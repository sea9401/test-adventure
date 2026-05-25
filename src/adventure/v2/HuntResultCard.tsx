"use client";

// v2 던전 사냥 결과 카드 — 인라인. 한 번의 사냥(단판) 결과를 풍부하게 보여준다.
// 라이브의 AutoHuntResultModal(섹션·tabular-nums·monster 이미지) + BattleResult
// (승/패 색 헤더) 패턴을 단판 사이즈로 압축.
//
// DungeonHunt 가 직전 1회 결과를 prop 으로 넘겨 카드로 표시. 모달 X — 클릭 한 번에
// 다음 사냥 가는 흐름이라 인라인이 자연스러움.

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
  // 직전 사냥 사이에 점령 길드에게 토벌당한 정보 — 다음 hunt 응답에 1회 surface.
  ejected?: { outpostId: string; byGuildId: number; at: number } | null;
};

export function HuntResultCard({ result }: { result: HuntResult }) {
  const monster = MONSTERS[result.enemyName];
  const won = result.won;
  const drops = result.drops
    ? Object.entries(result.drops).filter(([, n]) => (n ?? 0) > 0)
    : [];
  const hasReward =
    won &&
    (result.expGained > 0 || result.goldGained > 0 || drops.length > 0);

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
          <div className="min-w-0">
            <div className="truncate text-sm text-zinc-500 dark:text-zinc-400">
              {result.floor}층
            </div>
            <div className="truncate text-base font-medium text-zinc-800 dark:text-zinc-100">
              {result.enemyName}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={`text-lg font-semibold ${
              won
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {won ? "승리" : "패배"}
          </div>
          <div className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {result.turns}턴
          </div>
        </div>
      </div>

      <div className="mt-3 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <span className="text-zinc-500 dark:text-zinc-400">HP</span>
          <span className="tabular-nums text-zinc-700 dark:text-zinc-200">
            {result.hpBefore} → {result.hpAfter} / {result.maxHp}
          </span>
        </div>
      </div>

      {hasReward && (
        <div className="mt-2 space-y-1.5 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
          {result.expGained > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">EXP</span>
              <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                +{result.expGained}
              </span>
            </div>
          )}
          {result.levelsGained > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">레벨</span>
              <span className="font-medium tabular-nums text-amber-600 dark:text-amber-400">
                +{result.levelsGained}
              </span>
            </div>
          )}
          {result.goldGained > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">
                골드
                {result.goldTaxed ? (
                  <span className="ml-1 text-xs text-zinc-400 dark:text-zinc-500">
                    (세금 {result.goldTaxed} 차감, 총 {result.goldGross})
                  </span>
                ) : null}
              </span>
              <span className="font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
                +{result.goldGained}
              </span>
            </div>
          )}
          {drops.length > 0 && (
            <div className="pt-1">
              <div className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                획득
              </div>
              <ul className="space-y-0.5">
                {drops.map(([id, amount]) => {
                  const mat = V2_MATERIALS[id as V2MaterialId];
                  return (
                    <li
                      key={id}
                      className="flex items-center justify-between gap-2"
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
            </div>
          )}
        </div>
      )}

      {won && !hasReward && (
        <div className="mt-2 border-t border-zinc-200 pt-3 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          이번 사냥은 빈손
        </div>
      )}

      {result.ejected && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-center text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          직전 사냥지에서 점령 길드에게 토벌당했습니다.
        </div>
      )}
    </Card>
  );
}
