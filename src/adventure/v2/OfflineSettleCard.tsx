"use client";

import { useEffect, useRef, useState } from "react";
import { useGameState } from "./GameStateProvider";

// 오프라인 정산 카드 — 코어루프(V2_CORE_LOOP_V2) flag-on 에서만 동작.
// me/state 의 offlinePending(안 논 동안 쌓인 판수) > 0 이면 앱 로드 시 한 번 자동으로
// POST /api/v2/me/offline-settle 을 호출해 정산하고, 결과를 카드로 보여준다. flag off 면
// offlinePending 이 null 이라 아무것도 안 한다(현행 UI 무변경).

type SettleResult = {
  battles: number;
  wins: number;
  losses: number;
  totalExp: number;
  totalGold: number;
  totalLossTax: number;
  totalProficiency: number;
  totalMastery: number;
  levelsGained: number;
  spMilestonesGained?: number; // 코어루프 — 자리 비운 동안 새로 넘은 SP 마일스톤(>0 일 때만 표기).
  depth: number;
};

export function OfflineSettleCard() {
  const { offlinePending, setOfflinePending, refreshGameState } =
    useGameState();
  const [result, setResult] = useState<SettleResult | null>(null);
  // 세션당 1회만 정산(GameChrome 은 라우트 전환에도 remount 안 됨 → ref 가 세션 가드).
  const settled = useRef(false);

  useEffect(() => {
    if (offlinePending == null || offlinePending <= 0) return;
    if (settled.current) return;
    settled.current = true;
    (async () => {
      try {
        const res = await fetch("/api/v2/me/offline-settle", {
          method: "POST",
        });
        // fetch 는 4xx/5xx 에 throw 안 함 — !ok 면 정산 미반영, settled 풀어 다음 로드 재시도(멱등).
        if (!res.ok) {
          settled.current = false;
          return;
        }
        const j = (await res.json()) as Partial<SettleResult> & {
          battles?: number;
        };
        if ((j.battles ?? 0) > 0) {
          setResult({
            battles: j.battles ?? 0,
            wins: j.wins ?? 0,
            losses: j.losses ?? 0,
            totalExp: j.totalExp ?? 0,
            totalGold: j.totalGold ?? 0,
            totalLossTax: j.totalLossTax ?? 0,
            totalProficiency: j.totalProficiency ?? 0,
            totalMastery: j.totalMastery ?? 0,
            levelsGained: j.levelsGained ?? 0,
            spMilestonesGained: j.spMilestonesGained ?? 0,
            depth: j.depth ?? 0,
          });
        }
        // 정산 반영(성공 시에만) — 대기 0 + 골드/EXP/레벨 갱신.
        setOfflinePending(0);
        await refreshGameState();
      } catch {
        settled.current = false;
      }
    })();
  }, [offlinePending, setOfflinePending, refreshGameState]);

  if (!result || result.battles <= 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
          복귀 정산
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          자리를 비운 동안 {result.battles.toLocaleString()}판을 자동으로
          사냥했어요.
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          <Row label="경험치" value={`+${result.totalExp.toLocaleString()}`} />
          <Row
            label="골드"
            value={`+${result.totalGold.toLocaleString()}`}
            positive
          />
          {result.levelsGained > 0 && (
            <Row label="레벨" value={`+${result.levelsGained}`} positive />
          )}
          {result.totalProficiency > 0 && (
            <Row
              label="숙달 포인트"
              value={`+${result.totalProficiency.toLocaleString()}`}
              positive
            />
          )}
          {result.totalMastery > 0 && (
            <Row
              label="직업 숙련도"
              value={`+${result.totalMastery.toLocaleString()}`}
              positive
            />
          )}
          {(result.spMilestonesGained ?? 0) > 0 && (
            <Row
              label="스킬포인트"
              value={`+${result.spMilestonesGained}`}
              positive
            />
          )}
          <Row label="승/패" value={`${result.wins} / ${result.losses}`} />
          {result.totalLossTax > 0 && (
            <Row
              label="패배로 잃은 골드"
              value={`-${result.totalLossTax.toLocaleString()}`}
            />
          )}
        </dl>
        <button
          type="button"
          onClick={() => setResult(null)}
          className="mt-5 w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700"
        >
          받기
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd
        className={`font-medium tabular-nums ${
          positive
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-zinc-700 dark:text-zinc-200"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
