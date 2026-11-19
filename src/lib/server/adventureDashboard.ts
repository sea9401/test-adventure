import { LIFE_MAJOR_SAVE_KEY } from "@/adventure/v2/lifeMajor";
import { SANCTUARY_SAVE_KEY, SANCTUARY_DAILY_ATTEMPTS, parseSanctuaryState, canEnterSanctuary } from "@/adventure/data/v2/sanctuaryDungeon";
import { V2_UNEXPLORED } from "@/adventure/data/v2/coreLoopConfig";
import type { AdventureActivityView } from "@/adventure/v2/adventureDashboard";
import {
  FARM_DAILY_DELIVERY_LIMIT,
  FARM_WEEKLY_DELIVERY_LIMIT,
  FARM_SAVE_KEY,
  emptyFarmState,
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
  STORM_EXPEDITION_UNLOCK_DEPTH,
  parseStormExpeditionState,
  stormExpeditionDateKey,
} from "@/adventure/data/v2/stormExpedition";
import { ARENA_HISTORY_KEY, ARENA_STATE_KEY, CHARACTER_STATE_KEY } from "@/lib/storage-keys";
import { arenaDailyMatchCount, parseArenaHistory, parseArenaState } from "./arena";
import { FISHING_CODEX_KEY, parseFishCodex } from "@/adventure/v2/fishingCodex";
import { WOODCUTTING_LOG_KEY } from "@/adventure/v2/woodcuttingSession";
import { MINING_LOG_KEY } from "@/adventure/v2/miningSession";
import { buildRepeatSignals, REPEAT_QUESTS_KEY } from "./v2QuestContext";
import { deriveRepeatBundle, nextDailyResetAt, parseRepeatSave, rolloverRepeatSave } from "@/adventure/data/v2/v2RepeatQuests";

import {
  COOKING_DAILY_REQUEST_COUNT,
  COOKING_SAVE_KEY,
  parseCookingState,
} from "@/adventure/v2/cooking/state";
import { FISHING_PROGRESS_KEY } from "@/adventure/v2/fishingProgression";
import { PEDDLER_SAVE_KEY, parsePeddlerState } from "@/adventure/v2/peddler";
import { PEDDLER_REQUIRED_LIFE_LEVEL, PEDDLER_ROUTE_IDS } from "@/adventure/v2/peddlerRules";
import { kstDayKey, kstWeekMondayKey } from "@/lib/kst";
import { lifeLevelsFromSaves } from "./lifeMajor";
import {
  GUILD_TRAINING_SAVE_KEY,
  guildTrainingDrillViews,
  parseGuildTrainingState,
  todayGuildTrainingKey,
  todayGuildTrainingWeekKey,
} from "@/adventure/data/v2/guildTrainingGround";
import {
  GUILD_WORKSHOP_DELIVERY_IDS,
  parseGuildWorkshopDeliveryState,
  todayDeliveryKey,
} from "@/adventure/data/v2/guildWorkshopDelivery";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import { jobIdFromLegacy } from "@/adventure/data/v2/v2JobCatalog";
import { trainingGroundUpgradeForLevel } from "@/adventure/data/v2/settlement";
import {
  FISHING_SHOP_STATE_KEY,
  FISHING_STAMINA_POTION_ITEM_ID,
  FISHING_STAMINA_POTION_WEEKLY_LIMIT,
  parseFishingShopState,
} from "@/adventure/v2/fishingShop";
import {
  COOP_SHOP_ENTRIES,
  COOP_SHOP_STATE_KEY,
  coopShopPurchaseCount,
  parseCoopShopState,
} from "@/adventure/v2/coop/coopShop";
import { LIFE_FESTIVAL_SAVE_KEY, parseLifeFestivalState } from "@/adventure/v2/lifeFestival";
import { LIFE_FESTIVAL_SHOP_ITEM_BY_ID } from "@/adventure/data/v2/lifeFestival";

export const ADVENTURE_HOME_SAVE_KEY = "adventure-home.v1";

export const ADVENTURE_DASHBOARD_SAVE_FALLBACKS = {
  [ADVENTURE_HOME_SAVE_KEY]: null,
  [FARM_SAVE_KEY]: {},
  [FISHING_DAILY_KEY]: {},
  [WOODCUTTING_AUTO_KEY]: {},
  [MINING_AUTO_KEY]: {},
  [MASTERY_TOWER_SAVE_KEY]: {},
  [STORM_EXPEDITION_SAVE_KEY]: {},
  [SANCTUARY_SAVE_KEY]: {},
  [CHARACTER_STATE_KEY]: {},
  [ARENA_STATE_KEY]: {},
  [ARENA_HISTORY_KEY]: {},
  [FISHING_CODEX_KEY]: {},
  [WOODCUTTING_LOG_KEY]: {},
  [MINING_LOG_KEY]: {},
  [REPEAT_QUESTS_KEY]: {},
  "adventure-log.v2": {},
  "crafting.v2": {},
  // 홈의 "생활 한 번에 정산" 편의가 열렸는지 판단하는 생활 명성용.
  [LIFE_MAJOR_SAVE_KEY]: {},
  [COOKING_SAVE_KEY]: {},
  [PEDDLER_SAVE_KEY]: {},
  // 행상을 한 번도 보내지 않은 계정의 해금(생활 레벨) 판정용.
  [FISHING_PROGRESS_KEY]: {},
  [GUILD_TRAINING_SAVE_KEY]: {},
  [FISHING_SHOP_STATE_KEY]: {},
  [COOP_SHOP_STATE_KEY]: {},
  [LIFE_FESTIVAL_SAVE_KEY]: {},
} satisfies Record<string, unknown>;

export const ADVENTURE_ACTIVITY_IDS = [
  "daily_quest_reward",
  "farm_daily",
  "farm_weekly",
  "farm_ready",
  "fishing_daily",
  "cooking_daily",
  "cooking_weekly",
  "woodcutting_ready",
  "mining_ready",
  "peddler_ready",
  "mastery_tower_daily",
  "storm_expedition_daily",
  "sanctuary_daily",
  "arena_daily",
  "guild_training_daily",
  "guild_workshop_delivery_daily",
  "fishing_potion_weekly",
  "coop_potion_weekly",
  "festival_potion_weekly",
] as const;

/** 길드원은 길드 시설, 길드가 없는 계정은 모험가 협회 시설을 쓴다. 제작소 일일 납품은 길드에만 있다. */
export type AdventureFacilityContext =
  | { scope: "guild"; trainingGroundLevel: number; smithyLevel: number }
  | { scope: "association"; trainingGroundLevel: number };

const DEFAULT_FACILITY_CONTEXT: AdventureFacilityContext = {
  scope: "association",
  trainingGroundLevel: 1,
};

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

function peddlerActivity(
  saves: Record<string, unknown>,
  now: number,
): RawActivity {
  const base = {
    id: "peddler_ready",
    group: "ready",
    tab: "life",
    title: "행상 파견",
    href: "/town/peddler",
    defaultEnabled: true,
  } as const;
  const state = parsePeddlerState(saves[PEDDLER_SAVE_KEY], kstWeekMondayKey(new Date(now)));
  const readyAts = PEDDLER_ROUTE_IDS.flatMap((id) => {
    const dispatch = state.routes[id].dispatch;
    return dispatch ? [dispatch.readyAt] : [];
  });
  const arrived = readyAts.filter((readyAt) => readyAt <= now).length;
  if (arrived > 0) {
    return { ...base, detail: `도착한 수레 ${arrived}대`, state: "actionable" };
  }
  if (readyAts.length > 0) {
    const readyAt = Math.min(...readyAts);
    return { ...base, detail: minutesRemaining(readyAt, now), state: "in_progress", readyAt };
  }
  // 행상 화면과 같은 기준이다. 한 번이라도 보낸 계정은 레벨을 다시 확인하지 않는다.
  const unlocked =
    state.dispatchCount > 0 ||
    Object.values(
      lifeLevelsFromSaves(
        {
          farmRaw: saves[FARM_SAVE_KEY],
          woodcuttingRaw: saves[WOODCUTTING_LOG_KEY],
          miningRaw: saves[MINING_LOG_KEY],
          fishingRaw: saves[FISHING_PROGRESS_KEY],
          cookingRaw: saves[COOKING_SAVE_KEY],
        },
        now,
      ),
    ).some((level) => level >= PEDDLER_REQUIRED_LIFE_LEVEL);
  return unlocked
    ? { ...base, detail: "보낸 수레 없음", state: "completed" }
    : { ...base, detail: `생활 Lv.${PEDDLER_REQUIRED_LIFE_LEVEL}에 열립니다`, state: "unavailable" };
}

function guildTrainingActivity(
  saves: Record<string, unknown>,
  now: number,
  facilities: AdventureFacilityContext,
): RawActivity {
  const guild = facilities.scope === "guild";
  const base = {
    id: "guild_training_daily",
    group: "daily",
    tab: guild ? "guild" : "town",
    title: "훈련장",
    href: guild ? "/guild?tab=facilities&facility=training_ground" : "/town/association",
    defaultEnabled: true,
  } as const;
  const level = facilities.trainingGroundLevel;
  if (level <= 0) return { ...base, detail: "훈련장이 없습니다", state: "unavailable" };

  const character = (saves[CHARACTER_STATE_KEY] ?? {}) as Record<string, unknown>;
  const cls = parseV2Class(character.class);
  const group = tier1ClassOf(cls);
  const jobId = jobIdFromLegacy(
    cls,
    typeof character.specChoice === "string" ? character.specChoice : null,
  );
  if (group === "none" || jobId === "none") {
    return { ...base, detail: "전직 후 이용 가능", state: "unavailable" };
  }

  const date = new Date(now);
  const drills = guildTrainingDrillViews({
    state: parseGuildTrainingState(
      saves[GUILD_TRAINING_SAVE_KEY],
      todayGuildTrainingKey(date),
      todayGuildTrainingWeekKey(date),
    ),
    buildingLevel: level,
    characterLevel: Math.max(1, Math.floor(Number(character.level) || 1)),
    hasJob: true,
    currentClass: group,
  });
  const claimed = drills.filter((drill) => drill.claimed).length;
  const dailyLimit = Math.max(1, trainingGroundUpgradeForLevel(level).unlockedDrillCount);
  // 오늘 더 받을 수 있는 훈련 수. 남은 횟수와 지금 조건이 맞는 훈련 수 중 작은 쪽이다.
  const claimable = Math.min(
    drills.filter((drill) => drill.available).length,
    Math.max(0, dailyLimit - claimed),
  );
  const target = claimed + claimable;
  if (target <= 0) {
    return { ...base, detail: "지금 할 수 있는 훈련 없음", state: "unavailable" };
  }
  return {
    ...base,
    detail: `${claimed} / ${target}`,
    state: claimable > 0 ? "actionable" : "completed",
    current: claimed,
    target,
  };
}

function guildWorkshopDeliveryActivity(
  saves: Record<string, unknown>,
  now: number,
  facilities: AdventureFacilityContext,
): RawActivity {
  const base = {
    id: "guild_workshop_delivery_daily",
    group: "daily",
    tab: "guild",
    title: "제작소 일일 납품",
    href: "/guild?tab=facilities&facility=guild_smithy",
    // 납품마다 맞는 제작 장비가 있어야 하고 명장 제작품 납품도 있어서 매일 다 채우는 일이 아니다.
    countsTowardCompletion: false,
    defaultEnabled: true,
  } as const;
  if (facilities.scope !== "guild") {
    return { ...base, detail: "길드에 가입하면 열립니다", state: "unavailable" };
  }
  if (facilities.smithyLevel <= 0) {
    return { ...base, detail: "제작소가 없습니다", state: "unavailable" };
  }
  const crafting = (saves["crafting.v2"] ?? {}) as Record<string, unknown>;
  const claimed = parseGuildWorkshopDeliveryState(
    crafting.delivery,
    todayDeliveryKey(new Date(now)),
  ).claimed.length;
  const target = GUILD_WORKSHOP_DELIVERY_IDS.length;
  return {
    ...base,
    detail: `${claimed} / ${target}`,
    state: claimed >= target ? "completed" : "in_progress",
    current: claimed,
    target,
  };
}

/** 주간 한도가 있는 스태미나 회복약 교환. 재화가 있어야 하므로 완료 집계에는 넣지 않는다. */
function weeklyPotionActivity(
  base: Pick<RawActivity, "id" | "tab" | "title" | "href">,
  bought: number,
  limit: number,
): RawActivity {
  const current = Math.min(limit, Math.max(0, bought));
  return {
    ...base,
    group: "weekly",
    detail: `${current} / ${limit}`,
    state: current >= limit ? "completed" : "in_progress",
    current,
    target: limit,
    countsTowardCompletion: false,
    defaultEnabled: true,
  };
}

function weeklyPotionActivities(saves: Record<string, unknown>, now: number): RawActivity[] {
  const date = new Date(now);
  const dayKey = kstDayKey(date);
  const weekKey = kstWeekMondayKey(date);
  const fishingShop = parseFishingShopState(saves[FISHING_SHOP_STATE_KEY], dayKey, weekKey);
  const coopShop = parseCoopShopState(saves[COOP_SHOP_STATE_KEY], dayKey, weekKey);
  const coopPotion = COOP_SHOP_ENTRIES.find(
    (entry) => entry.output.kind === "stamina_potion" && entry.limit?.scope === "weekly",
  );
  const festival = parseLifeFestivalState(saves[LIFE_FESTIVAL_SAVE_KEY], weekKey);
  const festivalPotion = LIFE_FESTIVAL_SHOP_ITEM_BY_ID.get("stamina_potion");
  return [
    weeklyPotionActivity(
      { id: "fishing_potion_weekly", tab: "town", title: "낚시 상점 회복약", href: "/town/exchange?shop=fishing" },
      fishingShop.weekly.purchases[FISHING_STAMINA_POTION_ITEM_ID] ?? 0,
      FISHING_STAMINA_POTION_WEEKLY_LIMIT,
    ),
    ...(coopPotion?.limit
      ? [
          weeklyPotionActivity(
            { id: "coop_potion_weekly", tab: "town", title: "협동전 상점 회복약", href: "/town/exchange?shop=coop" },
            coopShopPurchaseCount(coopShop, coopPotion),
            coopPotion.limit.count,
          ),
        ]
      : []),
    ...(festivalPotion?.weeklyLimit
      ? [
          weeklyPotionActivity(
            { id: "festival_potion_weekly", tab: "life", title: "생활 축제 포션", href: "/town/festival" },
            festival.weeklyPurchases[festivalPotion.id] ?? 0,
            festivalPotion.weeklyLimit,
          ),
        ]
      : []),
  ];
}

export function resolveAdventureActivities(
  saves: Record<string, unknown>,
  now = Date.now(),
  facilities: AdventureFacilityContext = DEFAULT_FACILITY_CONTEXT,
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
  const weeklyTarget = FARM_WEEKLY_DELIVERY_LIMIT;
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

  const cooking = parseCookingState(saves[COOKING_SAVE_KEY], now);
  const cookingDailyCurrent = Math.min(
    COOKING_DAILY_REQUEST_COUNT,
    cooking.daily.completedRequestIds.length,
  );
  const cookingWeeklyCurrent = cooking.weekly.completed ? 1 : 0;

  const tower = parseMasteryTowerState(saves[MASTERY_TOWER_SAVE_KEY], kstDateKey(now));
  const towerClaimable = masteryTowerClaimPreview(tower).total > 0;
  const expedition = parseStormExpeditionState(
    saves[STORM_EXPEDITION_SAVE_KEY],
    stormExpeditionDateKey(now),
  );
  const character = saves[CHARACTER_STATE_KEY] as
    | Record<string, unknown>
    | undefined;
  const frontierDepth = Math.max(
    2,
    Math.floor(Number(character?.frontierDepth) || 2),
  );
  const expeditionUnlocked = frontierDepth >= STORM_EXPEDITION_UNLOCK_DEPTH;
  const sanctuary = parseSanctuaryState(saves[SANCTUARY_SAVE_KEY], stormExpeditionDateKey(now));
  const sanctuaryUnlocked = V2_UNEXPLORED && canEnterSanctuary(character ?? {});
  const arena = parseArenaState(saves[ARENA_STATE_KEY]);
  const arenaCount = arenaDailyMatchCount(arena, now);
  const fishCodex = parseFishCodex(saves[FISHING_CODEX_KEY]);
  const signals = buildRepeatSignals(saves["adventure-log.v2"], {
    fishCaught: Object.values(fishCodex.fish).reduce(
      (sum, entry) => sum + Math.max(0, entry.totalCaught ?? 0), 0,
    ),
    arenaTimes: parseArenaHistory(saves[ARENA_HISTORY_KEY])
      .map((entry) => new Date(entry.at).getTime())
      .filter(Number.isFinite),
  }, {
    farmRaw: saves[FARM_SAVE_KEY],
    woodcuttingRaw: saves[WOODCUTTING_LOG_KEY],
    miningRaw: saves[MINING_LOG_KEY],
    craftingRaw: saves["crafting.v2"],
  });
  const repeat = rolloverRepeatSave(parseRepeatSave(saves[REPEAT_QUESTS_KEY]), new Date(now), signals);
  const dailyReward = deriveRepeatBundle(repeat.save, signals, "daily");

  return [
    {
      id: "daily_quest_reward",
      group: "daily",
      tab: "character",
      title: "일일 퀘스트",
      detail: dailyReward.claimable ? "보상 수령 가능" : dailyReward.claimed ? "보상 수령 완료" : `${dailyReward.completed} / ${dailyReward.goal}`,
      href: "/quests",
      state: dailyReward.claimable ? "actionable" : dailyReward.claimed ? "completed" : "in_progress",
      current: dailyReward.completed,
      target: dailyReward.goal,
      resetAt: nextDailyResetAt(new Date(now)),
      defaultEnabled: true,
    },
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
    {
      id: "cooking_daily",
      group: "daily",
      tab: "life",
      title: "주방 일일 납품",
      detail: `${cookingDailyCurrent} / ${COOKING_DAILY_REQUEST_COUNT}`,
      href: "/town/kitchen",
      state: cookingDailyCurrent >= COOKING_DAILY_REQUEST_COUNT ? "completed" : "in_progress",
      current: cookingDailyCurrent,
      target: COOKING_DAILY_REQUEST_COUNT,
      defaultEnabled: true,
    },
    {
      id: "cooking_weekly",
      group: "weekly",
      tab: "life",
      title: "주방 주간 납품",
      detail: `${cookingWeeklyCurrent} / 1`,
      href: "/town/kitchen",
      state: cookingWeeklyCurrent >= 1 ? "completed" : "in_progress",
      current: cookingWeeklyCurrent,
      target: 1,
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
    peddlerActivity(saves, now),
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
      title: "폭풍 원정",
      detail: expedition.active
        ? "진행 중인 원정 계속하기"
        : `${expedition.attemptsUsed} / ${STORM_EXPEDITION_DAILY_ATTEMPTS}`,
      href: "/battle/storm-expedition",
      state:
        !expeditionUnlocked
          ? "unavailable"
          : expedition.active || expedition.attemptsUsed < STORM_EXPEDITION_DAILY_ATTEMPTS
          ? "actionable"
          : "completed",
      current: expedition.attemptsUsed,
      target: STORM_EXPEDITION_DAILY_ATTEMPTS,
      defaultEnabled: true,
    },
    {
      id: "sanctuary_daily",
      group: "daily",
      tab: "battle",
      title: "태초의 성소",
      detail: sanctuary.active ? "진행 중인 던전 계속하기" : `${sanctuary.attemptsUsed} / ${SANCTUARY_DAILY_ATTEMPTS}`,
      href: "/battle/sanctuary",
      state: !sanctuaryUnlocked ? "unavailable" : sanctuary.active || sanctuary.attemptsUsed < SANCTUARY_DAILY_ATTEMPTS ? "actionable" : "completed",
      current: sanctuary.attemptsUsed,
      target: SANCTUARY_DAILY_ATTEMPTS,
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
      countsTowardCompletion: false,
      defaultEnabled: true,
    },
    guildTrainingActivity(saves, now, facilities),
    guildWorkshopDeliveryActivity(saves, now, facilities),
    ...weeklyPotionActivities(saves, now),
  ];
}
