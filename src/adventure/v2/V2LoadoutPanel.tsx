"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SkillEffectChips } from "./SkillEffectChips";

// SP 로드아웃 패널 — 배운 스킬 라이브러리에서 SP 예산 안으로 장착/해제(코어루프 전용).
//   공용/기본기는 직업 무관 장착(오픈믹스), 시그니처는 현 직업 체인 밖이면 잠김(locked).
//   장착 변경은 POST /api/v2/me/loadout 로 전체 equipped(우선순위 순서)를 재전송 — 서버가
//   validateLoadout 으로 재검증(예산/학습/직업고정). 거부 시 직전 상태로 롤백.

export type V2LoadoutSkill = {
  skillId: string;
  name: string;
  spCost: number;
  equipped: boolean;
};
export type V2LoadoutSpBreakdown = {
  base: number;
  milestoneSp: number;
  masteryBonusSp: number;
  softCapReduction?: number;
  spFruitBonus: number;
  equipmentCodexBonus?: number;
  collectionBonusSp: number;
  collectionBonus?: {
    fishSp: number;
    treasureSp: number;
  };
  groups: Array<{
    id: string;
    label: string;
    cumLevel: number;
    requiredCumLevel: number;
    mastered: boolean;
    remainingCumLevel: number;
    milestoneSp: number;
    masteryBonusSp: number;
  }>;
};
export type V2LoadoutData = {
  spBudget: number;
  spUsed: number;
  equipped: string[]; // 장착 우선순위 순서(갬빗 fallback).
  library: V2LoadoutSkill[];
  spBreakdown?: V2LoadoutSpBreakdown;
};

export function V2LoadoutPanel({
  loadout,
  onChanged,
}: {
  loadout: V2LoadoutData;
  onChanged?: () => void;
}) {
  // 단일 진실원천 = order(장착된 id 우선순위 리스트). 메타(코스트/잠금/시그)는 library 에서.
  const [order, setOrder] = useState<string[]>(loadout.equipped);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 부모가 /me/state 를 다시 불러(예: 스킬 학습 후) loadout 이 갱신되면 서버 진실로 동기화.
  //   토글은 같은 prop 참조라 effect 미발화 → 낙관적 로컬 상태 유지. 학습 등 refresh 시에만 리셋.
  const equippedKey = loadout.equipped.join(",");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 서버 loadout prop 이 바뀔 때 로컬 편집 순서 재시드
    setOrder(loadout.equipped);
    setMsg(null);
    // equippedKey 로 내용 비교(refresh 마다 새 배열 ref 라도 내용 같으면 미발화).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equippedKey]);

  const meta = useMemo(
    () => new Map(loadout.library.map((s) => [s.skillId, s])),
    [loadout.library],
  );
  const equippedSet = useMemo(() => new Set(order), [order]);
  const spUsed = order.reduce((a, id) => a + (meta.get(id)?.spCost ?? 0), 0);
  const { spBudget } = loadout;
  const pct = spBudget > 0 ? Math.min(100, (spUsed / spBudget) * 100) : 0;
  const spBreakdown = loadout.spBreakdown;

  async function commit(nextOrder: string[]) {
    const prev = order;
    setOrder(nextOrder); // 낙관적 반영.
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/loadout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ equipped: nextOrder }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        overBudget?: boolean;
      } | null;
      if (!j?.ok) {
        setOrder(prev); // 롤백.
        setMsg(
          j?.overBudget ? "스킬포인트가 부족해요" : "장착을 변경할 수 없어요",
        );
      } else {
        onChanged?.();
      }
    } catch {
      setOrder(prev);
      setMsg("오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  }

  function toggle(skillId: string) {
    if (equippedSet.has(skillId)) {
      commit(order.filter((x) => x !== skillId));
    } else {
      commit([...order, skillId]);
    }
  }

  if (loadout.library.length === 0) {
    return (
      <Card padding="md">
        <h2 className="text-sm font-semibold">스킬</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          아직 배운 스킬이 없어요. 아래에서 스킬을 먼저 배우세요.
        </p>
      </Card>
    );
  }

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">스킬</h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          스킬포인트{" "}
          <strong className="tabular-nums text-violet-700 dark:text-violet-400">
            {spUsed}
          </strong>{" "}
          / {spBudget}
        </span>
      </div>
      {/* SP 예산 바 */}
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-violet-500 transition-[width] dark:bg-violet-600"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        배운 스킬을 스킬포인트 예산 안에서 장착하세요. 공용·기본기는 어느 직업이든,
        시그니처는 그 직업일 때만 장착할 수 있어요.
      </p>
      {spBreakdown && (
        <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/80">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-600 dark:text-zinc-300">
            <span>기본 {spBreakdown.base}</span>
            <span>숙련도 +{spBreakdown.milestoneSp}</span>
            <span>직업군 정복 +{spBreakdown.masteryBonusSp}</span>
            {(spBreakdown.softCapReduction ?? 0) > 0 && (
              <span>상한 조정 -{spBreakdown.softCapReduction}</span>
            )}
            <span>SP 열매 +{spBreakdown.spFruitBonus}</span>
            <span>도감 +{spBreakdown.collectionBonusSp}</span>
            <span>장비 도감 +{spBreakdown.equipmentCodexBonus ?? 0}</span>
          </div>
          {spBreakdown.groups.length > 0 && (
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {spBreakdown.groups.map((g) => {
                const masteryPct =
                  g.requiredCumLevel > 0
                    ? Math.min(100, (g.cumLevel / g.requiredCumLevel) * 100)
                    : 0;
                return (
                  <div key={g.id} className="min-w-0">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate font-medium text-zinc-700 dark:text-zinc-200">
                        {g.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                        {g.mastered
                          ? `정복 +${g.masteryBonusSp}`
                          : `${g.cumLevel.toLocaleString()} / ${g.requiredCumLevel.toLocaleString()}`}
                      </span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                      <div
                        className={`h-full rounded-full ${
                          g.mastered
                            ? "bg-emerald-500 dark:bg-emerald-500"
                            : "bg-sky-500 dark:bg-sky-500"
                        }`}
                        style={{ width: `${masteryPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <ul className="mt-3 space-y-1.5">
        {loadout.library.map((s) => {
          const equipped = equippedSet.has(s.skillId);
          const wouldFit = spUsed + s.spCost <= spBudget;
          return (
            <li
              key={s.skillId}
              className={`flex flex-wrap items-start justify-between gap-2 rounded-md border px-3 py-2 ${
                equipped
                  ? "border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/40"
                  : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold">
                    {s.name}
                  </span>
                  <span className="shrink-0 rounded bg-zinc-200/70 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-300">
                    SP {s.spCost}
                  </span>
                </div>
                {/* 간단한 효과 설명 — 패시브면 "지능 +10%" 등, 액티브면 피해/회복 + MP·쿨다운. */}
                <SkillEffectChips skillId={s.skillId} />
              </div>
              {equipped ? (
                <button
                  type="button"
                  onClick={() => toggle(s.skillId)}
                  disabled={busy}
                  aria-label={`${s.name} 해제`}
                  className="shrink-0 rounded-md border border-violet-500 bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-50 dark:text-violet-300"
                >
                  해제
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => toggle(s.skillId)}
                  disabled={busy || !wouldFit}
                  aria-label={`${s.name} 장착`}
                  className="shrink-0 rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {!wouldFit ? "SP 부족" : "장착"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {msg && (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
        >
          {msg}
        </div>
      )}
    </Card>
  );
}
