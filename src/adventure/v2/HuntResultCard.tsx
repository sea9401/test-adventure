"use client";

// v2 던전 사냥 결과 카드 — 간단 버전.
// 사용자 의도: 승/패 + EXP·골드·드랍만. 몬스터 img/이름·HP·턴 제거.
// 사이즈 축소 — padding sm + 작은 font.

import { Card } from "@/components/ui/Card";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import {
  V2_EQUIPMENT,
  V2_EQUIP_BONUS_KEYS,
  V2_EQUIP_BONUS_LABELS,
  V2_EQUIP_PERCENT_KEYS,
  type V2EquipmentId,
  type V2EquipStats,
} from "@/adventure/data/v2/v2Equipment";

function formatEquipStats(stats: V2EquipStats): string {
  const parts: string[] = [];
  for (const k of V2_EQUIP_BONUS_KEYS) {
    const v = stats[k];
    if (!v) continue;
    const sign = v >= 0 ? "+" : "";
    const unit = V2_EQUIP_PERCENT_KEYS.has(k) ? "%" : "";
    parts.push(`${V2_EQUIP_BONUS_LABELS[k]} ${sign}${v}${unit}`);
  }
  return parts.join(" · ");
}

export type HuntResult = {
  floor: number;
  enemyName: string;
  won: boolean;
  expGained: number;
  goldGained: number;
  goldGross?: number;
  goldTaxed?: number;
  levelsGained: number;
  turns: number;
  hpBefore: number;
  hpAfter: number;
  maxHp: number;
  drops?: Partial<Record<V2MaterialId, number>>;
  droppedEquipment?: V2EquipmentId | null;
  ejected?: { outpostId: string; byGuildId: number; at: number } | null;
};

export function HuntResultCard({ result }: { result: HuntResult }) {
  const won = result.won;
  const drops = result.drops
    ? Object.entries(result.drops).filter(([, n]) => (n ?? 0) > 0)
    : [];
  const droppedEquip = result.droppedEquipment
    ? V2_EQUIPMENT[result.droppedEquipment]
    : null;

  return (
    <Card padding="sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          전투 결과
        </span>
        <span
          className={`text-sm font-semibold ${
            won
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {won ? "승리" : "패배"}
        </span>
      </div>

      <div className="mt-2 space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-zinc-500 dark:text-zinc-400">EXP</span>
          <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
            +{result.expGained}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500 dark:text-zinc-400">골드</span>
          <span className="font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
            +{result.goldGained}
          </span>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500 dark:text-zinc-400">드랍</span>
            {drops.length === 0 && !droppedEquip && (
              <span className="text-zinc-400 dark:text-zinc-500">—</span>
            )}
          </div>
          {drops.length > 0 && (
            <ul className="mt-0.5 space-y-0.5">
              {drops.map(([id, amount]) => {
                const mat = V2_MATERIALS[id as V2MaterialId];
                return (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-2 pl-2"
                  >
                    <span className="truncate text-zinc-700 dark:text-zinc-200">
                      {mat?.name ?? id}
                    </span>
                    <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-300">
                      ×{amount}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {droppedEquip && (
            <div className="mt-1 rounded-md border border-emerald-300 bg-emerald-50 p-1.5 dark:border-emerald-700 dark:bg-emerald-950/40">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-emerald-900 dark:text-emerald-100">
                  ✦ {droppedEquip.name}
                </span>
                <span className="shrink-0 text-[10px] text-emerald-700 dark:text-emerald-300">
                  T{droppedEquip.tier}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[10px] text-emerald-700 dark:text-emerald-300">
                {formatEquipStats(droppedEquip.stats)}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
