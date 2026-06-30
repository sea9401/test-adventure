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
import {
  RARE_MAP_KINDS,
  type RareMapKindId,
} from "@/adventure/data/v2/rareMaps";
import { formatStatGains, formatHpMpGains } from "@/adventure/v2/HuntResultCard";
import type { V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import type { ElementMatchup } from "@/adventure/data/v2/elements";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";

// N회 일괄 사냥의 합산 결과. EXP/골드/드랍/전적.

export type BatchReplayEntry = {
  index: number;
  enemyName: string;
  won: boolean;
  turns: number;
  replay: ReplayPayload;
  startPlayerHp?: number;
  expForBar?: number;
  maxExpForBar?: number;
  hpCharges?: number;
  mpCharges?: number;
  elementMatchup?: ElementMatchup;
};

export type BatchSummary = {
  attempted: number;
  completed: number;
  wins: number;
  losses: number;
  totalExp: number;
  totalProficiency: number;
  totalMastery?: number;
  totalGold: number;
  totalGoldGross?: number; // 세전 합산 — 세금 줄 표기용.
  totalGoldTaxed?: number;
  taxOwnerLabel?: string; // 세금 수취자 — 점령 길드명/솔로 점령자/거점 금고.
  levelsGained: number;
  spMilestonesGained?: number; // 코어루프 — 일괄 동안 새로 넘은 SP 마일스톤 합산(>0 일 때만 표기).
  statGains: Partial<Record<V2StatKey, number>>; // 일괄 사냥 동안 레벨업으로 오른 1차 스탯 합산.
  hpGained?: number; // 일괄 동안 레벨업으로 오른 maxHp 합산.
  mpGained?: number; // 일괄 동안 레벨업으로 오른 maxMp 합산.
  drops: Partial<Record<V2MaterialId, number>>;
  droppedEquipments: V2EquipmentId[];
  droppedUniques: V2EquipmentId[];
  rareMapDrops?: RareMapKindId[];
  stoppedReason?: "stamina" | "death" | "defeat" | "recovery" | "error" | null;
  replays?: BatchReplayEntry[];
};

export function BatchSummaryCard({
  summary,
  onSelectReplay,
}: {
  summary: BatchSummary;
  onSelectReplay?: (entry: BatchReplayEntry) => void;
}) {
  const dropEntries = Object.entries(summary.drops).filter(
    ([, n]) => (n ?? 0) > 0,
  ) as Array<[V2MaterialId, number]>;
  const eqNames = summary.droppedEquipments
    .map((id) => V2_EQUIPMENT[id]?.name ?? id)
    .filter(Boolean);
  const uniqueNames = summary.droppedUniques
    .map((id) => V2_EQUIPMENT[id]?.name ?? id)
    .filter(Boolean);
  const rareMapNames = (summary.rareMapDrops ?? []).map(
    (k) => RARE_MAP_KINDS[k]?.name ?? k,
  );

  // 드랍 배너 — 재료 + 장비 합쳐 한 줄.
  const dropParts: string[] = [];
  for (const [id, n] of dropEntries) {
    dropParts.push(`${V2_MATERIALS[id]?.name ?? id} ×${n}`);
  }
  for (const name of eqNames) {
    dropParts.push(name);
  }

  const statGainsText = formatStatGains(summary.statGains);
  const hpMpGainsText = formatHpMpGains(summary.hpGained, summary.mpGained);

  return (
    <Card padding="sm">
      {rareMapNames.length > 0 && (
        <div className="ui-reward-flash mb-2 rounded-md border border-sky-400 bg-sky-50 px-2 py-1.5 text-center text-xs font-semibold text-sky-800 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-200">
          🗺 {rareMapNames.join(", ")} 발견! — 인벤토리 소모품에서 확인
        </div>
      )}
      {uniqueNames.length > 0 && (
        <div className="ui-reward-flash mb-2 rounded-md border border-violet-400 bg-violet-50 px-2 py-1.5 text-center text-xs font-semibold text-violet-800 dark:border-violet-600 dark:bg-violet-950 dark:text-violet-200">
          ✨ 유니크 {uniqueNames.join(", ")} 획득!
        </div>
      )}
      {dropParts.length > 0 && (
        <div className="ui-reward-flash mb-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-center text-xs font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
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
          {(summary.spMilestonesGained ?? 0) > 0 && (
            <span className="text-xs text-violet-600 dark:text-violet-400">
              · 스킬포인트 +{summary.spMilestonesGained}
            </span>
          )}
        </div>
        {summary.totalProficiency > 0 && (
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="text-zinc-500 dark:text-zinc-400">숙달 포인트</span>
            <span className="font-medium tabular-nums text-violet-600 dark:text-violet-400">
              +{summary.totalProficiency.toLocaleString()}
            </span>
          </div>
        )}
        {(summary.totalMastery ?? 0) > 0 && (
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="text-zinc-500 dark:text-zinc-400">직업 숙련도</span>
            <span className="font-medium tabular-nums text-sky-600 dark:text-sky-400">
              +{(summary.totalMastery ?? 0).toLocaleString()}
            </span>
          </div>
        )}
        <div className="flex items-baseline justify-center gap-1.5">
          <span className="text-zinc-500 dark:text-zinc-400">골드</span>
          <span className="font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
            +{summary.totalGold.toLocaleString()}
          </span>
        </div>
        {(summary.totalGoldTaxed ?? 0) > 0 && (
          <div className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
            세금 −{(summary.totalGoldTaxed ?? 0).toLocaleString()} G →{" "}
            {summary.taxOwnerLabel ?? "점령자"}
          </div>
        )}
      </div>

      {summary.levelsGained > 0 && (
        <div className="ui-reward-flash mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-center dark:border-amber-700 dark:bg-amber-950">
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            레벨 업! +{summary.levelsGained}
          </span>
          {statGainsText && (
            <div className="mt-0.5 text-xs font-medium tabular-nums text-amber-800 dark:text-amber-200">
              {statGainsText}
            </div>
          )}
          {hpMpGainsText && (
            <div className="mt-0.5 text-xs font-medium tabular-nums text-amber-800 dark:text-amber-200">
              {hpMpGainsText}
            </div>
          )}
        </div>
      )}
      {summary.stoppedReason && summary.stoppedReason !== null && (
        <p className="mt-2 text-center text-xs text-amber-600 dark:text-amber-400">
          {summary.stoppedReason === "stamina"
            ? "스태미너 부족으로 중단"
            : summary.stoppedReason === "death" ||
                summary.stoppedReason === "defeat"
              ? "패배로 중단"
              : summary.stoppedReason === "recovery"
                ? "체력 부족으로 중단"
                : "오류로 중단"}{" "}
          ({summary.completed}/{summary.attempted})
        </p>
      )}
      {(summary.replays?.length ?? 0) > 0 && onSelectReplay && (
        <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div className="mb-2 text-center text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            전투 기록
          </div>
          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
            {summary.replays!.map((entry) => (
              <button
                key={entry.index}
                type="button"
                onClick={() => onSelectReplay(entry)}
                className={`ui-game-button rounded-md border px-2 py-1.5 text-xs font-medium tabular-nums transition ${
                  entry.won
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950"
                    : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950"
                }`}
                title={`${entry.index}회차 · ${entry.enemyName} · ${entry.turns}턴`}
              >
                {entry.index}회
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
