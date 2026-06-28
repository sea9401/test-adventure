"use client";

import { useCallback, useState } from "react";
import {
  Sword,
  HandFist,
  MagicWand,
  Knife,
  type Icon,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import {
  V2_CLASS_DEFS,
  V2_SELECTABLE_CLASSES,
  tier1ClassOf,
  type V2Class,
} from "@/adventure/data/v2/classes";
import { V2_ELEMENT_LABEL, type V2Element } from "@/adventure/data/v2/elements";
import { tierLevelCap } from "@/adventure/data/v2/proficiency";
import { respecGoldCost } from "@/adventure/data/v2/respec";
import { useGameState } from "./GameStateProvider";

// 성장의 신전 "직업" 탭 레거시 폴백 — 4직군(전사/무도가/마법사/도적) 아이콘 그리드.
// 코어루프 on 에서는 V2JobLadder 가 렌더되고, 이 컴포넌트는 jobsV2 가 없는 off 모드에서만 쓴다.
//  · 각 아이콘 = 직군. 레거시 도달 차수(N차) + 직업 숙련도(cumLevel) 표시, 현 직업은 하이라이트.
//  · 현 직업 클릭 = 다음 차수 전직(무료, 게이트 충족 시 "전직" 배지). class 는 불변, 차수만 +1.
//  · 다른 직업 클릭 = 갈아타기(무료·쿨다운 없음, 레벨1 리셋, "도달 차수로 복귀").
//  · 속성은 여기서 변경하지 않음 — 읽기 전용 표기만(변경은 별도 경로).

const ICON_BY_JOB: Record<string, Icon> = {
  warrior: Sword, // 전사
  martial: HandFist, // 무도가
  mage: MagicWand, // 마법사
  rogue: Knife, // 도적
};

export type V2AdvanceInfo = {
  nextClass: V2Class;
  nextName: string;
  nextTier: number;
  reqLevel: number;
  haveLevel: number;
  reqCum: number;
  haveCum: number;
  reqCodex: number;
  haveCodex: number;
  canAdvance: boolean;
};

type GroupInfo = { tier?: number; cumLevel?: number };

export function V2ClassGrid({
  currentClass,
  currentElement,
  level,
  gold,
  groups,
  advance,
  onChanged,
}: {
  currentClass: V2Class;
  currentElement: V2Element;
  level: number;
  // 부모가 넘기는 보유 골드(me/state 기준, 신선). 지불 게이트는 코어루프 on 이면 보유+은행.
  gold?: number;
  groups: Record<string, GroupInfo>;
  advance: V2AdvanceInfo | null;
  onChanged: () => void | Promise<void>;
}) {
  // flag off 면 보유만(===gold, prod 무변경), on 이면 보유+은행(은행 골드로도 전직).
  const { coreLoopOn, bankedGold } = useGameState();
  const heldGold = gold ?? 0;
  const spendable = coreLoopOn ? heldGold + bankedGold : heldGold;
  const activeGroup = tier1ClassOf(currentClass);
  const [selected, setSelected] = useState<V2Class>(
    activeGroup === "none" ? V2_SELECTABLE_CLASSES[0] : activeGroup,
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const activeTier =
    activeGroup === "none" ? 1 : (groups[activeGroup]?.tier ?? 1);
  const activeCap = tierLevelCap(activeTier);
  const activeAtCap = level >= activeCap;
  const isReincarnationReady = activeTier >= 4;
  const advanceCodexRequired = advance?.reqCodex ?? 0;
  const advanceCodexHave = advance?.haveCodex ?? 0;
  const codexOk = advanceCodexHave >= advanceCodexRequired;
  const canAdvanceNow =
    activeGroup !== "none" &&
    activeAtCap &&
    (isReincarnationReady || codexOk);
  const canSwitchClass = activeTier >= 4 && level >= tierLevelCap(4);

  const doAdvance = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/advance-class", { method: "POST" });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        required?: number;
        have?: number;
        reincarnated?: boolean;
        tier?: number;
      } | null;
      if (!j?.ok) {
        const label =
          j?.error === "level_too_low"
            ? `레벨 부족 (Lv ${j.have ?? "?"} / ${j.required ?? activeCap})`
            : j?.error === "insufficient_cum_level"
              ? `직업 숙련도 부족 (${j.have ?? "?"}/${j.required ?? "?"})`
              : j?.error === "codex_incomplete"
                ? `모험의 서 부족 (재료 ${j.have ?? "?"}/${j.required ?? "?"})`
                : j?.error === "no_advance"
                  ? "진행할 전직/환생이 없어요"
                : (j?.error ?? `http ${res.status}`);
        setMsg(`✗ ${label}`);
        return;
      }
      setMsg(
        j.reincarnated
          ? "✓ 환생 완료 — 1차 Lv1로 돌아왔습니다"
          : `✓ ${j.tier ?? activeTier + 1}차 전직 완료`,
      );
      await onChanged();
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [activeCap, activeTier, onChanged]);

  const doSwitch = useCallback(
    async (job: V2Class) => {
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/class-element", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // 직군(job)만 보냄 — 속성은 현재 값 유지(여기선 안 바꿈). off 모드 서버가 레거시 차수로 해석.
          body: JSON.stringify({ class: job, element: currentElement }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          required?: number;
          cooldownUntil?: number;
          requiredTier?: number;
          requiredLevel?: number;
          haveTier?: number;
          haveLevel?: number;
        } | null;
        if (!j?.ok) {
          const label =
            j?.error === "insufficient_gold"
              ? `골드 부족 (필요 ${(j.required ?? 0).toLocaleString()}G)`
              : j?.error === "not_at_apex"
                ? `직업 변경은 4차 정점(Lv100)에서만 가능 (현재 ${j.haveTier ?? "?"}차 Lv ${j.haveLevel ?? "?"} / 필요 ${j.requiredTier ?? 4}차 Lv ${j.requiredLevel ?? 100})`
              : j?.error === "respec_cooldown"
                ? `전직 쿨다운 중 — ${
                    j.cooldownUntil
                      ? new Date(j.cooldownUntil).toLocaleString()
                      : "잠시"
                  } 이후 가능`
                : (j?.error ?? `http ${res.status}`);
          setMsg(`✗ ${label}`);
          return;
        }
        setMsg("✓ 전환 완료");
        await onChanged();
      } catch (e) {
        setMsg(`✗ ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [currentElement, onChanged],
  );

  // 선택된 직군 상세.
  const selReached = groups[selected]?.tier ?? 1;
  const selCum = groups[selected]?.cumLevel ?? 0;
  const isActiveSel = selected === activeGroup;
  const isFirstPick = currentClass === "none";
  const switchCost = respecGoldCost(
    currentClass,
    selected,
    currentElement,
    currentElement,
    level,
  );
  const cantAfford = switchCost > 0 && spendable < switchCost;

  return (
    <Card padding="md">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">직업</h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          속성 {V2_ELEMENT_LABEL[currentElement]}
        </span>
      </div>

      {/* 4직군 아이콘 그리드 */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {V2_SELECTABLE_CLASSES.map((job) => {
          const isActive = job === activeGroup;
          const reached = groups[job]?.tier ?? 1;
          const cum = groups[job]?.cumLevel ?? 0;
          const jobTier = groups[job]?.tier ?? 1;
          const jobAtCap = isActive && level >= tierLevelCap(jobTier);
          const ready =
            isActive &&
            activeGroup !== "none" &&
            jobAtCap &&
            (jobTier >= 4 || codexOk);
          const badgeLabel = jobTier >= 4 ? "환생" : "전직";
          // 레거시 도달 차수 — 전직 가능하면 다음 차수를 미리 보여줌.
          const showTier = ready && jobTier < 4 ? jobTier + 1 : reached;
          const IconCmp = ICON_BY_JOB[job] ?? Sword;
          const isSel = job === selected;
          return (
            <button
              key={job}
              type="button"
              onClick={() => setSelected(job)}
              className={`relative flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition ${
                isSel
                  ? "border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-950/40"
                  : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:bg-zinc-800/60"
              }`}
            >
              {ready && (
                <span className="absolute right-1 top-1 rounded bg-emerald-500 px-1 text-[9px] font-bold text-white">
                  {badgeLabel}
                </span>
              )}
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  isActive
                    ? "bg-sky-500/15 ring-2 ring-sky-400 dark:ring-sky-500"
                    : "bg-zinc-200/60 dark:bg-zinc-800"
                }`}
              >
                <IconCmp
                  size={20}
                  weight={isActive ? "fill" : "regular"}
                  className={
                    isActive
                      ? "text-sky-600 dark:text-sky-300"
                      : "text-zinc-500 dark:text-zinc-400"
                  }
                />
              </span>
              <span className="truncate text-[11px] font-medium leading-tight">
                {V2_CLASS_DEFS[job].name}
                <span className="ml-1 font-normal text-zinc-400 dark:text-zinc-500">
                  {showTier}차
                </span>
              </span>
              <span className="text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
                {cum.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      {/* 선택 상세 + 동작 */}
      <div className="mt-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">
            {V2_CLASS_DEFS[selected].name}
            <span className="ml-1 text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
              {selReached}차 · 숙련도 {selCum.toLocaleString()}
            </span>
          </span>
          {isActiveSel && (
            <span className="text-[11px] text-sky-600 dark:text-sky-400">
              현재 직업
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          {V2_CLASS_DEFS[selected].description}
        </p>

        {isActiveSel ? (
          activeGroup !== "none" ? (
            <div className="mt-2.5">
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span
                  className={
                    activeAtCap
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }
                >
                  Lv {level}/{activeCap}
                </span>
                {!isReincarnationReady && advanceCodexRequired > 0 && (
                  <span
                    className={
                      codexOk
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }
                  >
                    도감 {advanceCodexHave}/{advanceCodexRequired}
                  </span>
                )}
              </div>
              {!activeAtCap && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                  이 차수는 Lv {activeCap}에서 멈춥니다. 한계 도달 후{" "}
                  {isReincarnationReady ? "환생" : "전직"}할 수 있어요.
                </p>
              )}
              {isReincarnationReady && (
                <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                  환생 시 권능(성장치·트레이트·초과 키트픽)이 리셋되고 1차 Lv1로 돌아갑니다.
                  직업 숙련도, 성장 한계치, 프론티어 층은 보존됩니다.
                </p>
              )}
              <button
                type="button"
                onClick={doAdvance}
                disabled={busy || !canAdvanceNow}
                className="mt-2 w-full rounded-md border border-emerald-500 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-400 dark:text-emerald-300"
              >
                {busy
                  ? "…"
                  : !activeAtCap
                    ? `Lv ${activeCap} 도달 시 ${isReincarnationReady ? "환생" : "전직"}`
                    : !isReincarnationReady && !codexOk
                      ? `모험의 서 ${advanceCodexRequired}종 필요`
                      : isReincarnationReady
                        ? "환생 — 1차 Lv1로 리셋"
                        : `${Math.min(4, activeTier + 1)}차 전직 — 레벨 1로 리셋`}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
              이 직군의 정점(4차)에 도달했습니다.
            </p>
          )
        ) : (
          <div className="mt-2.5">
            <button
              type="button"
              onClick={() => doSwitch(selected)}
              disabled={busy || cantAfford}
              className="w-full rounded-md border border-indigo-400 bg-indigo-500/10 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-400 dark:text-indigo-300"
            >
              {busy
                ? "…"
                : isFirstPick
                  ? "이 직업 선택"
                  : switchCost > 0
                    ? `직업 변경 (${switchCost.toLocaleString()}G)`
                    : "직업 변경"}
            </button>
            {!isFirstPick && (
              <>
                <p
                  className={`mt-1.5 text-[11px] ${
                    cantAfford
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  레벨 1로 리셋 ·{" "}
                  {selReached > 1
                    ? `도달한 ${selReached}차로 복귀`
                    : "1차부터 시작"}
                  {cantAfford
                    ? ` (보유 ${spendable.toLocaleString()}G — 부족)`
                    : ""}
                </p>
                {!canSwitchClass && (
                  <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                    직업 변경은 4차 정점(Lv100)에서 가능 · 현재 {activeTier}차 Lv{" "}
                    {level}/100
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {msg && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{msg}</p>
      )}
    </Card>
  );
}
