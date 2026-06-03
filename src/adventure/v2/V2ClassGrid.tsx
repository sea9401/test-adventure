"use client";

import { useCallback, useState } from "react";
import {
  Sword,
  Target,
  HandFist,
  MagicWand,
  Cross,
  Knife,
  type Icon,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import {
  V2_CLASS_DEFS,
  V2_SELECTABLE_CLASSES,
  tier1ClassOf,
  classOfGroupTier,
  type V2Class,
} from "@/adventure/data/v2/classes";
import { V2_ELEMENT_LABEL, type V2Element } from "@/adventure/data/v2/elements";
import { respecGoldCost } from "@/adventure/data/v2/respec";

// 성장의 신전 "직업" 탭 — 6직업군 아이콘 그리드. 옛 드롭다운 피커 대체.
//  · 각 아이콘 = 직업군. 도달 차수 이름 + 직군 누적레벨(cumLevel) 표시, 현 직업군은 하이라이트.
//  · 현 직업군 클릭 = 다음 차수 전직(무료, 게이트 충족 시 아이콘이 다음 차수로 미리 바뀜).
//  · 다른 직업군 클릭 = 갈아타기(무료·쿨다운 없음, 레벨1 리셋, "도달 차수로 복귀").
//  · 속성은 여기서 변경하지 않음 — 읽기 전용 표기만(변경은 별도 경로).

const ICON_BY_GROUP: Record<string, Icon> = {
  swordsman: Sword, // 검술
  archer: Target, // 궁술
  martial: HandFist, // 체술
  mage: MagicWand, // 마술
  priest: Cross, // 신술
  ninja: Knife, // 인술
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
  gold: number;
  groups: Record<string, GroupInfo>;
  advance: V2AdvanceInfo | null;
  onChanged: () => void;
}) {
  const activeGroup = tier1ClassOf(currentClass);
  const [selected, setSelected] = useState<string>(
    activeGroup === "none" ? V2_SELECTABLE_CLASSES[0] : activeGroup,
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
      } | null;
      if (!j?.ok) {
        const label =
          j?.error === "level_too_low"
            ? `레벨 부족 (필요 Lv${j.required ?? "?"})`
            : j?.error === "insufficient_cum_level"
              ? `직군 누적 레벨 부족 (${j.have ?? "?"}/${j.required ?? "?"})`
              : j?.error === "codex_incomplete"
                ? `모험의 서 부족 (재료 ${j.have ?? "?"}/${j.required ?? "?"})`
                : (j?.error ?? `http ${res.status}`);
        setMsg(`✗ ${label}`);
        return;
      }
      setMsg("✓ 전직 완료");
      onChanged();
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [onChanged]);

  const doSwitch = useCallback(
    async (groupKey: string) => {
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/class-element", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // 직업군(1차 id)만 보냄 — 속성은 현재 값 유지(여기선 안 바꿈). 서버가 도달 차수로 해석.
          body: JSON.stringify({ class: groupKey, element: currentElement }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          required?: number;
          cooldownUntil?: number;
        } | null;
        if (!j?.ok) {
          const label =
            j?.error === "insufficient_gold"
              ? `골드 부족 (필요 ${(j.required ?? 0).toLocaleString()}G)`
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
        onChanged();
      } catch (e) {
        setMsg(`✗ ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [currentElement, onChanged],
  );

  // 선택된 직업군 상세.
  const selReached = groups[selected]?.tier ?? 1;
  const selCum = groups[selected]?.cumLevel ?? 0;
  const isActiveSel = selected === activeGroup;
  const selClass: V2Class = isActiveSel
    ? currentClass
    : classOfGroupTier(selected as V2Class, selReached);
  const isFirstPick = currentClass === "none";
  const switchCost = respecGoldCost(
    currentClass,
    selected as V2Class,
    currentElement,
    currentElement,
    level,
  );
  const cantAfford = switchCost > 0 && gold < switchCost;

  return (
    <Card padding="md">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">직업</h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          속성 {V2_ELEMENT_LABEL[currentElement]}
        </span>
      </div>

      {/* 6직업군 아이콘 그리드 */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {V2_SELECTABLE_CLASSES.map((groupKey) => {
          const isActive = groupKey === activeGroup;
          const reached = groups[groupKey]?.tier ?? 1;
          const cum = groups[groupKey]?.cumLevel ?? 0;
          const ready = isActive && !!advance?.canAdvance;
          // 현 직업군은 현재 직업, 전직 가능하면 다음 차수를 미리 보여줌. 타 직업군은 도달 차수.
          const displayClass: V2Class = isActive
            ? ready
              ? advance!.nextClass
              : currentClass
            : classOfGroupTier(groupKey as V2Class, reached);
          const IconCmp = ICON_BY_GROUP[groupKey] ?? Sword;
          const isSel = groupKey === selected;
          return (
            <button
              key={groupKey}
              type="button"
              onClick={() => setSelected(groupKey)}
              className={`relative flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition ${
                isSel
                  ? "border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-950/40"
                  : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:bg-zinc-800/60"
              }`}
            >
              {ready && (
                <span className="absolute right-1 top-1 rounded bg-emerald-500 px-1 text-[9px] font-bold text-white">
                  전직
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
                {V2_CLASS_DEFS[displayClass].name}
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
            {V2_CLASS_DEFS[selClass].name}
            <span className="ml-1 text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
              {V2_CLASS_DEFS[selClass].group} · 누적레벨{" "}
              {selCum.toLocaleString()}
            </span>
          </span>
          {isActiveSel && (
            <span className="text-[11px] text-sky-600 dark:text-sky-400">
              현재 직업군
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          {V2_CLASS_DEFS[selClass].description}
        </p>

        {isActiveSel ? (
          advance ? (
            <div className="mt-2.5">
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span
                  className={
                    advance.haveLevel >= advance.reqLevel
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }
                >
                  Lv {advance.haveLevel}/{advance.reqLevel}
                </span>
                <span
                  className={
                    advance.haveCum >= advance.reqCum
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }
                >
                  누적 {advance.haveCum}/{advance.reqCum}
                </span>
                {advance.reqCodex > 0 && (
                  <span
                    className={
                      advance.haveCodex >= advance.reqCodex
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }
                  >
                    도감 {advance.haveCodex}/{advance.reqCodex}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={doAdvance}
                disabled={busy || !advance.canAdvance}
                className="mt-2 w-full rounded-md border border-emerald-500 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-400 dark:text-emerald-300"
              >
                {busy
                  ? "…"
                  : `${advance.nextName}(${advance.nextTier}차) 전직 — 레벨 1로 리셋`}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
              이 직업군의 정점에 도달했습니다.
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
                    ? `이 직업군으로 전환 (${switchCost.toLocaleString()}G)`
                    : "이 직업군으로 전환"}
            </button>
            {!isFirstPick && (
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
                {cantAfford ? ` (보유 ${gold.toLocaleString()}G — 부족)` : ""}
              </p>
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
