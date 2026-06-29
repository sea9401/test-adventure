"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TabBar } from "@/components/ui/TabBar";
import { FishingSubTabs } from "./FishingSubTabs";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
import {
  FISH,
  FISH_IDS,
  FISH_TIERS,
  FISH_TIER_ORDER,
  formatFishSize,
  type FishTier,
} from "@/adventure/data/v2/fish";
import type { FishingHallOfFameData } from "./fishingLeaderboard";

// 역대 최대어 명예의 전당 — 전 시즌 통틀어 종별 최대어. 데이터는 주입(useFishingHallOfFame / dev mock).
// 주간 리더보드(FishingLeaderboardView)와 같은 구성이되 시즌 정산·코인 표시가 없는 영구 기록판.

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

export function FishingHallOfFameView({
  data,
  loading,
  error,
  onBack,
  onOpenFishing,
  onOpenChallenges,
  onOpenLeaderboard,
  onOpenShop,
}: {
  data: FishingHallOfFameData | null;
  loading: boolean;
  error?: string | null;
  onBack?: () => void;
  // 낚시터 서브 탭바 — 미전달(dev 하니스)이면 그 탭 숨김.
  onOpenFishing?: () => void;
  onOpenChallenges?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenShop?: () => void;
}) {
  const [activeTier, setActiveTier] = useState<FishTier>("common");
  const tierSpecies = useMemo(
    () => FISH_IDS.filter((id) => FISH[id].tier === activeTier),
    [activeTier],
  );

  return (
    <main className="mx-auto max-w-[640px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="역대 최대어 명예의 전당" onBack={onBack} />
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        종마다 역대 가장 큰 기록입니다. 시즌이 지나도 사라지지 않아요.
      </p>

      <FishingSubTabs
        active="hallOfFame"
        onOpenFishing={onOpenFishing}
        onOpenChallenges={onOpenChallenges}
        onOpenLeaderboard={onOpenLeaderboard}
        onOpenShop={onOpenShop}
      />

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
          <Card padding="sm">
            <TabBar
              tabs={FISH_TIER_ORDER.map((tier) => ({
                key: tier,
                label: FISH_TIERS[tier].label,
              }))}
              active={activeTier}
              onChange={setActiveTier}
              ariaLabel="낚시 등급"
              size="sm"
              variant="highlight"
              scrollable
            />
          </Card>
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${TIER_BADGE[activeTier]}`}
              >
                {FISH_TIERS[activeTier].label}
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {tierSpecies.length}종
              </span>
            </div>
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {tierSpecies.map((id) => {
                const entries = data?.byFish[id] ?? [];
                return (
                  <li key={id} className="px-3 py-2.5">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      🐟 {FISH[id].name}
                    </div>
                    {entries.length === 0 ? (
                      <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                        아직 기록 없음 — 역대 첫 기록의 주인이 되어 보자.
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
                              <PlayerNameLink name={e.name} />
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
        </div>
      )}
    </main>
  );
}
