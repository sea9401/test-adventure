"use client";

import { useMemo, useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  FISH,
  FISH_IDS,
  FISH_TIERS,
  FISH_TIER_ORDER,
  formatFishSize,
  type FishId,
  type FishTier,
} from "@/adventure/data/v2/fish";
import { FishIcon } from "./FishIcon";
import type { FishingLeaderboardData } from "./fishingLeaderboard";
import { useFishingLeaderboard } from "./useFishingLeaderboard";

const TIER_BADGE: Record<FishTier, string> = {
  common:
    "bg-zinc-200/70 text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-300",
  uncommon:
    "bg-emerald-200/70 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200",
  rare: "bg-sky-200/70 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200",
  epic: "bg-violet-200/70 text-violet-800 dark:bg-violet-900/60 dark:text-violet-200",
  legendary:
    "bg-amber-200/80 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
};

export type FishingWeeklyState = "loading" | "ready" | "error";

export type FishingCodexMeta = {
  total: number;
  spBonus: number;
  milestones: number[];
  nextMilestone: number | null;
};

export type FishingCodexListProps = {
  registeredIds: ReadonlySet<string>;
  caughtIds: ReadonlySet<string>;
  best: Record<string, number>;
  meta: FishingCodexMeta;
  ranks: Partial<Record<FishId, number>>;
  weeklyState: FishingWeeklyState;
  showUnrankedOnly: boolean;
  onShowUnrankedOnlyChange: (show: boolean) => void;
  extractBusy: boolean;
  onPreviewExtraction: (fishId: FishId) => void;
};

export type FishingCodexPanelProps = Omit<
  FishingCodexListProps,
  | "ranks"
  | "weeklyState"
  | "showUnrankedOnly"
  | "onShowUnrankedOnlyChange"
>;

export function weeklyFishingRanks(
  data: FishingLeaderboardData | null,
): Partial<Record<FishId, number>> {
  const ranks: Partial<Record<FishId, number>> = {};
  if (!data) return ranks;
  for (const id of FISH_IDS) {
    const mine = data.byFish[id]?.find((entry) => entry.isMe);
    if (mine) ranks[id] = mine.rank;
  }
  return ranks;
}

export function weeklyFishingStatusLabel(
  rank: number | undefined,
  state: FishingWeeklyState,
): string {
  if (state === "loading") return "주간 확인 중";
  if (state === "error") return "주간 순위 확인 불가";
  return rank === undefined ? "주간 미등록" : `주간 ${rank}위`;
}

export function fishCodexCardState(registered: boolean, caughtEver: boolean) {
  if (!registered && !caughtEver) {
    return {
      visible: false,
      canExtract: false,
      status: "미발견" as const,
      recordLabel: null,
    };
  }
  return {
    visible: true,
    canExtract: registered,
    status: registered ? ("등재" as const) : ("미등록" as const),
    recordLabel:
      registered && !caughtEver ? "표본 등록 · 직접 어획 기록 없음" : null,
  };
}

export function FishingCodexList({
  registeredIds,
  caughtIds,
  best,
  meta,
  ranks,
  weeklyState,
  showUnrankedOnly,
  onShowUnrankedOnlyChange,
  extractBusy,
  onPreviewExtraction,
}: FishingCodexListProps) {
  const discoveredCount = registeredIds.size;
  const unrankedCount = FISH_IDS.filter(
    (id) => ranks[id] === undefined,
  ).length;
  const visibleTiers = FISH_TIER_ORDER.map((tier) => {
    const allSpecies = FISH_IDS.filter((id) => FISH[id].tier === tier);
    const species = showUnrankedOnly
      ? allSpecies.filter((id) => ranks[id] === undefined)
      : allSpecies;
    return { tier, allSpecies, species };
  }).filter(({ species }) => species.length > 0);
  const filterDisabled = weeklyState !== "ready";

  return (
    <div className="space-y-3">
      <Card padding="md">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold">어보</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              발견 {discoveredCount} / {meta.total}종 · SP +{meta.spBonus}
            </p>
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            다음 보상{" "}
            {meta.nextMilestone
              ? `${meta.nextMilestone}종`
              : "신규 어종 추가 시 확장"}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-sky-500 transition-[width]"
            style={{
              width: `${
                meta.total > 0
                  ? Math.min(100, (discoveredCount / meta.total) * 100)
                  : 0
              }%`,
            }}
          />
        </div>
        {meta.milestones.length > 0 && (
          <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            SP 보상: {meta.milestones.join(" / ")}종
          </p>
        )}
      </Card>

      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="xs"
            variant={showUnrankedOnly ? "info" : "secondary"}
            aria-pressed={showUnrankedOnly}
            disabled={filterDisabled}
            onClick={() => onShowUnrankedOnlyChange(!showUnrankedOnly)}
          >
            주간 미등록만 {weeklyState === "ready" ? unrankedCount : "—"}
          </Button>
          {weeklyState !== "ready" && (
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {weeklyState === "loading"
                ? "주간 순위를 불러오는 중입니다."
                : "주간 순위를 불러오지 못했습니다."}
            </span>
          )}
        </div>
      </Card>

      {visibleTiers.length === 0 ? (
        <EmptyState
          icon={<CheckCircle size={28} weight="duotone" aria-hidden />}
          title="주간 기록 등록 완료"
          message="이번 주 모든 어종에 기록을 등록했습니다."
        />
      ) : (
        visibleTiers.map(({ tier, allSpecies, species }) => {
          const tierMeta = FISH_TIERS[tier];
          const tierDiscoveredCount = allSpecies.filter((id) =>
            registeredIds.has(id),
          ).length;
          return (
            <Card key={tier} padding="none" className="overflow-hidden">
              <div
                className={`${SURFACE_INSET} flex flex-wrap items-baseline justify-between gap-2 rounded-none border-x-0 border-t-0 px-3 py-2`}
              >
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${TIER_BADGE[tier]}`}
                >
                  {tierMeta.label}
                </span>
                <div className="flex flex-wrap justify-end gap-x-2 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span>
                    {tierDiscoveredCount}/{allSpecies.length}
                  </span>
                  <span>1등 보상 {tierMeta.recordCoins.rank1}코인</span>
                </div>
              </div>
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {species.map((id) => {
                  const fish = FISH[id];
                  const registered = registeredIds.has(id);
                  const caughtEver = caughtIds.has(id);
                  const cardState = fishCodexCardState(registered, caughtEver);
                  const bestSize = best[id];
                  const weeklyRank = ranks[id];
                  return (
                    <li
                      key={id}
                      className={`px-3 py-2.5 ${
                        cardState.visible
                          ? ""
                          : "text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          <FishIcon
                            fishId={id}
                            name={fish.name}
                            decorative={!cardState.visible}
                            className={`h-6 w-6 ${
                              cardState.visible ? "" : "grayscale"
                            }`}
                          />
                          {fish.name}
                          {registered ? (
                            <span className="rounded bg-emerald-200/70 px-1 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                              {cardState.status}
                            </span>
                          ) : caughtEver ? (
                            <span className="rounded bg-amber-200/70 px-1 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                              미등록
                            </span>
                          ) : (
                            <span className="rounded bg-zinc-200/70 px-1 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-300">
                              미발견
                            </span>
                          )}
                        </span>
                        <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 sm:w-auto sm:shrink-0 sm:justify-end">
                          <span className="text-[11px] font-medium tabular-nums text-sky-700 dark:text-sky-300">
                            {weeklyFishingStatusLabel(
                              weeklyRank,
                              weeklyState,
                            )}
                          </span>
                          <span className="text-[11px] font-medium tabular-nums text-amber-600 dark:text-amber-400">
                            최대어{" "}
                            {caughtEver &&
                            typeof bestSize === "number" &&
                            bestSize > 0
                              ? formatFishSize(bestSize)
                              : "—"}
                          </span>
                          {cardState.canExtract && (
                            <Button
                              size="xs"
                              variant="secondary"
                              disabled={extractBusy}
                              onClick={() => onPreviewExtraction(id)}
                            >
                              표본 추출
                            </Button>
                          )}
                        </span>
                      </div>
                      {cardState.recordLabel && (
                        <p className="mt-1 text-xs font-medium text-sky-700 dark:text-sky-300">
                          {cardState.recordLabel}
                        </p>
                      )}
                      {cardState.visible && fish.description && (
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                          {fish.description}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })
      )}
    </div>
  );
}

export function FishingCodexPanel(props: FishingCodexPanelProps) {
  const [showUnrankedOnly, setShowUnrankedOnly] = useState(false);
  const { data, loading, error } = useFishingLeaderboard();
  const ranks = useMemo(() => weeklyFishingRanks(data), [data]);
  const weeklyState: FishingWeeklyState = error
    ? "error"
    : loading || !data
      ? "loading"
      : "ready";

  return (
    <FishingCodexList
      {...props}
      ranks={ranks}
      weeklyState={weeklyState}
      showUnrankedOnly={showUnrankedOnly}
      onShowUnrankedOnlyChange={setShowUnrankedOnly}
    />
  );
}
