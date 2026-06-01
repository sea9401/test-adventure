"use client";

import { Card } from "@/components/ui/Card";
import {
  FISH,
  FISH_IDS,
  FISH_TIERS,
  FISH_TIER_ORDER,
  formatFishSize,
  type FishTier,
} from "@/adventure/data/v2/fish";
import type { FishingLeaderboardData } from "./fishingLeaderboard";

// 주간 종별 리더보드 표시. 데이터는 주입(useFishingLeaderboard 실 API / dev mock).
// 설계: docs/fishing-content-plan.md §5

const TIER_BADGE: Record<FishTier, string> = {
  common: "bg-zinc-200/70 text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-300",
  uncommon:
    "bg-emerald-200/70 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200",
  rare: "bg-sky-200/70 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200",
  epic: "bg-violet-200/70 text-violet-800 dark:bg-violet-900/60 dark:text-violet-200",
  legendary:
    "bg-amber-200/80 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
};

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function rankLabel(rank: number): string {
  return MEDAL[rank] ?? `${rank}위`;
}

function endsInLabel(endsAt: string): string {
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) return "";
  const ms = end - Date.now();
  if (ms <= 0) return "곧 마감";
  const days = Math.floor(ms / (24 * 3600 * 1000));
  const hours = Math.floor((ms % (24 * 3600 * 1000)) / (3600 * 1000));
  if (days > 0) return `${days}일 ${hours}시간 남음`;
  return `${hours}시간 남음`;
}

export function FishingLeaderboardView({
  data,
  loading,
  error,
  onBack,
}: {
  data: FishingLeaderboardData | null;
  loading: boolean;
  error?: string | null;
  onBack?: () => void;
}) {
  return (
    <main className="mx-auto max-w-[640px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            ← 돌아가기
          </button>
        )}
        <div>
          <h1 className="text-lg font-bold">주간 낚시 대회</h1>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            종마다 이번 주 최대어 순위. 매주 월요일 새벽에 순위가 정산된다.
            {data?.endsAt && (
              <span className="ml-1 font-medium text-zinc-600 dark:text-zinc-300">
                ({endsInLabel(data.endsAt)})
              </span>
            )}
          </p>
        </div>
      </header>

      {loading ? (
        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          불러오는 중…
        </p>
      ) : error ? (
        <p className="py-8 text-center text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : (
        <div className="space-y-3">
          {FISH_TIER_ORDER.map((tier) => {
            const species = FISH_IDS.filter((id) => FISH[id].tier === tier);
            return (
              <Card key={tier} padding="none" className="overflow-hidden">
                <div className="flex items-baseline justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${TIER_BADGE[tier]}`}
                  >
                    {FISH_TIERS[tier].label}
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    1등 {FISH_TIERS[tier].recordCoins.rank1}코인
                  </span>
                </div>
                <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {species.map((id) => {
                    const entries = data?.byFish[id] ?? [];
                    return (
                      <li key={id} className="px-3 py-2.5">
                        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          🐟 {FISH[id].name}
                        </div>
                        {entries.length === 0 ? (
                          <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                            아직 기록 없음 — 첫 기록의 주인이 되어 보자.
                          </p>
                        ) : (
                          <ul className="mt-1.5 space-y-0.5">
                            {entries.map((e) => (
                              <li
                                key={`${id}-${e.rank}-${e.name}`}
                                className={`flex items-center justify-between gap-2 rounded px-1.5 py-1 text-[12px] ${
                                  e.isMe
                                    ? "bg-sky-100 font-medium text-sky-900 dark:bg-sky-950/50 dark:text-sky-200"
                                    : "text-zinc-700 dark:text-zinc-300"
                                }`}
                              >
                                <span className="flex items-center gap-1.5">
                                  <span className="inline-block w-7 shrink-0 tabular-nums">
                                    {rankLabel(e.rank)}
                                  </span>
                                  {e.name}
                                  {e.isMe && (
                                    <span className="rounded bg-sky-200/80 px-1 text-[10px] text-sky-800 dark:bg-sky-800/70 dark:text-sky-100">
                                      나
                                    </span>
                                  )}
                                </span>
                                <span className="shrink-0 tabular-nums text-amber-600 dark:text-amber-400">
                                  {formatFishSize(e.size)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
