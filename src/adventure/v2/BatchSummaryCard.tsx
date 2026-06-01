"use client";

import { Card } from "@/components/ui/Card";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import {
  V2_EQUIPMENT,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { formatStatGains } from "@/adventure/v2/HuntResultCard";
import type { V2StatKey } from "@/adventure/data/v2/v2StatKeys";

// N회 일괄 사냥의 합산 결과. EXP/골드/드랍/전적.

export type BatchSummary = {
  attempted: number;
  completed: number;
  wins: number;
  losses: number;
  totalExp: number;
  totalProficiency: number;
  totalGold: number;
  levelsGained: number;
  statGains: Partial<Record<V2StatKey, number>>; // 일괄 사냥 동안 레벨업으로 오른 1차 스탯 합산.
  drops: Partial<Record<V2MaterialId, number>>;
  droppedEquipments: V2EquipmentId[];
  stoppedReason?: "stamina" | "death" | "recovery" | "error" | null;
};

export function BatchSummaryCard({ summary }: { summary: BatchSummary }) {
  const dropEntries = Object.entries(summary.drops).filter(
    ([, n]) => (n ?? 0) > 0,
  ) as Array<[V2MaterialId, number]>;
  const eqNames = summary.droppedEquipments
    .map((id) => V2_EQUIPMENT[id]?.name ?? id)
    .filter(Boolean);

  // 드랍 배너 — 재료 + 장비 합쳐 한 줄.
  const dropParts: string[] = [];
  for (const [id, n] of dropEntries) {
    dropParts.push(`${V2_MATERIALS[id]?.name ?? id} ×${n}`);
  }
  for (const name of eqNames) {
    dropParts.push(name);
  }

  const statGainsText = formatStatGains(summary.statGains);

  return (
    <Card padding="sm">
      {dropParts.length > 0 && (
        <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-center text-xs font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          ⭐ {dropParts.join(", ")}을(를) 획득했다!
        </div>
      )}
      <div className="flex items-baseline justify-center gap-2">
        <span className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {summary.attempted}회 사냥
        </span>
        <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          {summary.wins}승
        </span>
        {summary.losses > 0 && (
          <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">
            {summary.losses}패
          </span>
        )}
      </div>
      <div className="mt-2 space-y-1 text-center text-sm">
        <div className="flex items-baseline justify-center gap-1.5">
          <span className="text-zinc-500 dark:text-zinc-400">EXP</span>
          <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
            +{summary.totalExp.toLocaleString()}
          </span>
          {summary.levelsGained > 0 && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              · 레벨 +{summary.levelsGained}
            </span>
          )}
        </div>
        {summary.totalProficiency > 0 && (
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="text-zinc-500 dark:text-zinc-400">숙련도</span>
            <span className="font-medium tabular-nums text-violet-600 dark:text-violet-400">
              +{summary.totalProficiency.toLocaleString()}
            </span>
          </div>
        )}
        <div className="flex items-baseline justify-center gap-1.5">
          <span className="text-zinc-500 dark:text-zinc-400">골드</span>
          <span className="font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
            +{summary.totalGold.toLocaleString()}
          </span>
        </div>
      </div>

      {summary.levelsGained > 0 && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-center dark:border-amber-700 dark:bg-amber-950">
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            레벨 업! +{summary.levelsGained}
          </span>
          {statGainsText && (
            <div className="mt-0.5 text-xs font-medium tabular-nums text-amber-800 dark:text-amber-200">
              {statGainsText}
            </div>
          )}
        </div>
      )}
      {summary.stoppedReason && summary.stoppedReason !== null && (
        <p className="mt-2 text-center text-xs text-amber-600 dark:text-amber-400">
          {summary.stoppedReason === "stamina"
            ? "스태미너 부족으로 중단"
            : summary.stoppedReason === "death"
              ? "패배로 중단"
              : summary.stoppedReason === "recovery"
                ? "체력 부족으로 중단"
                : "오류로 중단"}{" "}
          ({summary.completed}/{summary.attempted})
        </p>
      )}
    </Card>
  );
}
