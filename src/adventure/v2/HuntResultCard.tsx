"use client";

// v2 던전 사냥 결과 카드 — 간단 버전.
// 사용자 의도: EXP·골드·드랍만 보이게.
// 헤더(몬스터·승/패) 만 유지하고 HP·턴·레벨·빈손/ejected 메시지 등은 제거.

import { Card } from "@/components/ui/Card";
import { MONSTERS } from "@/adventure/data/monsters";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";

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
  ejected?: { outpostId: string; byGuildId: number; at: number } | null;
};

export function HuntResultCard({ result }: { result: HuntResult }) {
  const monster = MONSTERS[result.enemyName];
  const won = result.won;
  const drops = result.drops
    ? Object.entries(result.drops).filter(([, n]) => (n ?? 0) > 0)
    : [];

  return (
    <Card padding="md">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {monster?.image ? (
            <span className="size-10 shrink-0 overflow-hidden rounded border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={monster.image}
                alt={result.enemyName}
                className="h-full w-full object-cover"
              />
            </span>
          ) : (
            <span className="flex size-10 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-100 text-xs text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500">
              ?
            </span>
          )}
          <div className="truncate text-base font-medium text-zinc-800 dark:text-zinc-100">
            {result.enemyName}
          </div>
        </div>
        <div
          className={`shrink-0 text-lg font-semibold ${
            won
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {won ? "승리" : "패배"}
        </div>
      </div>

      <div className="mt-3 space-y-1.5 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
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
            {drops.length === 0 && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                —
              </span>
            )}
          </div>
          {drops.length > 0 && (
            <ul className="mt-1 space-y-0.5">
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
        </div>
      </div>
    </Card>
  );
}
