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

// N회 일괄 사냥의 합산 결과. EXP/골드/드랍/전적.

export type BatchSummary = {
  attempted: number;
  completed: number;
  wins: number;
  losses: number;
  totalExp: number;
  totalGold: number;
  levelsGained: number;
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

  return (
    <Card padding="sm">
      {dropParts.length > 0 && (
        <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-center text-xs font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
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
        <div className="flex items-baseline justify-center gap-1.5">
          <span className="text-zinc-500 dark:text-zinc-400">골드</span>
          <span className="font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
            +{summary.totalGold.toLocaleString()}
          </span>
        </div>
      </div>
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
