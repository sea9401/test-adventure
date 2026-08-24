import type { AdventureActivityView } from "@/adventure/v2/adventureDashboard";
import {
  FARM_DAILY_DELIVERY_LIMIT,
  FARM_SAVE_KEY,
  emptyFarmState,
  getFarmWeeklyDeliveryRequests,
  normalizeFarmForDay,
  parseFarmState,
} from "@/adventure/v2/farm";
import {
  MINING_AUTO_KEY,
  WOODCUTTING_AUTO_KEY,
  parseAutoGatheringState,
} from "@/adventure/v2/autoGathering";
import {
  FISHING_DAILY_KEY,
  deriveFishingContractViews,
  deriveFishingDailyViews,
  parseFishingDaily,
  rolloverFishingDaily,
} from "@/adventure/data/v2/fishingDailyChallenges";
import {
  MASTERY_TOWER_SAVE_KEY,
  kstDateKey,
  masteryTowerClaimPreview,
  parseMasteryTowerState,
} from "@/adventure/data/v2/masteryTower";
import {
  STORM_EXPEDITION_DAILY_ATTEMPTS,
  STORM_EXPEDITION_SAVE_KEY,
  parseStormExpeditionState,
  stormExpeditionDateKey,
} from "@/adventure/data/v2/stormExpedition";
import { ARENA_STATE_KEY } from "@/lib/storage-keys";
import { arenaDailyMatchCount, parseArenaState } from "./arena";

export const ADVENTURE_HOME_SAVE_KEY = "adventure-home.v1";

export const ADVENTURE_DASHBOARD_SAVE_FALLBACKS = {
  [ADVENTURE_HOME_SAVE_KEY]: null,
  [FARM_SAVE_KEY]: {},
  [FISHING_DAILY_KEY]: {},
  [WOODCUTTING_AUTO_KEY]: {},
  [MINING_AUTO_KEY]: {},
  [MASTERY_TOWER_SAVE_KEY]: {},
  [STORM_EXPEDITION_SAVE_KEY]: {},
  [ARENA_STATE_KEY]: {},
} satisfies Record<string, unknown>;

export const ADVENTURE_ACTIVITY_IDS = [
  "farm_daily",
  "farm_weekly",
  "farm_ready",
  "fishing_daily",
  "woodcutting_ready",
  "mining_ready",
  "mastery_tower_daily",
  "storm_expedition_daily",
  "arena_daily",
] as const;

type RawActivity = Omit<AdventureActivityView, "enabled">;

function minutesRemaining(readyAt: number, now: number): string {
  const minutes = Math.max(1, Math.ceil((readyAt - now) / 60_000));
  if (minutes < 60) return `${minutes}분 남음`;
  const hours = Math.ceil(minutes / 60);
  return `${hours}시간 남음`;
}

function gatheringActivity(
  id: "woodcutting_ready" | "mining_ready",
  title: string,
  href: string,
  raw: unknown,
  now: number,
): RawActivity {
  const session = parseAutoGatheringState(raw).session;
  if (session == null) {
    return {
      id,
      group: "ready",
      tab: "life",
      title,
      detail: "진행 중인 작업 없음",
      href,
      state: "completed",
      defaultEnabled: true,
    };
  }
  const ready = session.readyAt <= now;
  return {
    id,
    group: "ready",
    tab: "life",
    title,
    detail: ready ? `${session.sourceName} 작업 완료` : minutesRemaining(session.readyAt, now),
    href,
    state: ready ? "actionable" : "in_progress",
    readyAt: session.readyAt,
    defaultEnabled: true,
  };
}

export function resolveAdventureActivities(
  saves: Record<string, unknown>,
  now = Date.now(),
): RawActivity[] {
  const farm = normalizeFarmForDay(
    parseFarmState(saves[FARM_SAVE_KEY] ?? emptyFarmState(now), now),
    now,
  );
  const readyPlots = farm.plots.filter(
    (plot) => plot.cropId != null && plot.readyAt != null && plot.readyAt <= now,
  );
  const nextPlot = farm.plots
    .filter((plot) => plot.readyAt != null && plot.readyAt > now)
    .sort((a, b) => (a.readyAt ?? 0) - (b.readyAt ?? 0))[0];
  const dailyCurrent = Math.min(
    FARM_DAILY_DELIVERY_LIMIT,
    farm.deliveries.claimedIds.length,
  );
  const weeklyTarget = getFarmWeeklyDeliveryRequests().length;
  const weeklyCurrent = Math.min(weeklyTarget, farm.weekly.claimedIds.length);

  const fishing = rolloverFishingDaily(
    parseFishingDaily(saves[FISHING_DAILY_KEY]),
    kstDateKey(now),
  );
  const fishingViews = [
    ...deriveFishingDailyViews(fishing),
    ...deriveFishingContractViews(fishing),
  ];
  const fishingClaimed = fishingViews.filter((view) => view.claimed).length;
  const fishingClaimable = fishingViews.filter((view) => view.claimable).length;

  const tower = parseMasteryTowerState(saves[MASTERY_TOWER_SAVE_KEY], kstDateKey(now));
  const towerClaimable = masteryTowerClaimPreview(tower).total > 0;
  const expedition = parseStormExpeditionState(
    saves[STORM_EXPEDITION_SAVE_KEY],
    stormExpeditionDateKey(now),
  );
  const arena = parseArenaState(saves[ARENA_STATE_KEY]);
  const arenaCount = arenaDailyMatchCount(arena, now);

  return [
    {
      id: "farm_daily",
      group: "daily",
      tab: "life",
      title: "농장 일일 납품",
      detail: `${dailyCurrent} / ${FARM_DAILY_DELIVERY_LIMIT}`,
      href: "/town/farm",
      state: dailyCurrent >= FARM_DAILY_DELIVERY_LIMIT ? "completed" : "in_progress",
      current: dailyCurrent,
      target: FARM_DAILY_DELIVERY_LIMIT,
      defaultEnabled: true,
    },
    {
      id: "farm_weekly",
      group: "weekly",
      tab: "life",
      title: "농장 주간 납품",
      detail: `${weeklyCurrent} / ${weeklyTarget}`,
      href: "/town/farm",
      state: weeklyTarget > 0 && weeklyCurrent >= weeklyTarget ? "completed" : "in_progress",
      current: weeklyCurrent,
      target: weeklyTarget,
      defaultEnabled: true,
    },
    {
      id: "farm_ready",
      group: "ready",
      tab: "life",
      title: "농장 수확",
      detail:
        readyPlots.length > 0
          ? `수확 가능 ${readyPlots.length}칸`
          : nextPlot?.readyAt
            ? minutesRemaining(nextPlot.readyAt, now)
            : "재배 중인 작물 없음",
      href: "/town/farm",
      state: readyPlots.length > 0 ? "actionable" : nextPlot ? "in_progress" : "completed",
      ...(nextPlot?.readyAt ? { readyAt: nextPlot.readyAt } : {}),
      defaultEnabled: true,
    },
    {
      id: "fishing_daily",
      group: "daily",
      tab: "life",
      title: "낚시 일일 과제",
      detail:
        fishingClaimable > 0
          ? `보상 수령 가능 ${fishingClaimable}개`
          : `${fishingClaimed} / ${fishingViews.length}`,
      href: "/town/fishing",
      state:
        fishingClaimable > 0
          ? "actionable"
          : fishingClaimed >= fishingViews.length
            ? "completed"
            : "in_progress",
      current: fishingClaimed,
      target: fishingViews.length,
      defaultEnabled: true,
    },
    gatheringActivity(
      "woodcutting_ready",
      "자동 벌목",
      "/town/logging",
      saves[WOODCUTTING_AUTO_KEY],
      now,
    ),
    gatheringActivity(
      "mining_ready",
      "자동 채광",
      "/town/mining",
      saves[MINING_AUTO_KEY],
      now,
    ),
    {
      id: "mastery_tower_daily",
      group: "daily",
      tab: "battle",
      title: "숙련의 탑",
      detail: towerClaimable
        ? "오늘 기록 보상 수령 가능"
        : tower.todayBestFloor > 0
          ? `오늘 최고 ${tower.todayBestFloor}층`
          : "오늘 기록 없음",
      href: "/battle/mastery-tower",
      state: towerClaimable ? "actionable" : tower.claimed ? "completed" : "in_progress",
      defaultEnabled: true,
    },
    {
      id: "storm_expedition_daily",
      group: "daily",
      tab: "battle",
      title: "원정",
      detail: expedition.active
        ? "진행 중인 원정 계속하기"
        : `${expedition.attemptsUsed} / ${STORM_EXPEDITION_DAILY_ATTEMPTS}`,
      href: "/battle/storm-expedition",
      state:
        expedition.active || expedition.attemptsUsed < STORM_EXPEDITION_DAILY_ATTEMPTS
          ? "actionable"
          : "completed",
      current: expedition.attemptsUsed,
      target: STORM_EXPEDITION_DAILY_ATTEMPTS,
      defaultEnabled: true,
    },
    {
      id: "arena_daily",
      group: "daily",
      tab: "battle",
      title: "아레나",
      detail: `오늘 ${arenaCount}회 참여`,
      href: "/battle/arena",
      state: "in_progress",
      current: arenaCount,
      defaultEnabled: true,
    },
  ];
}
