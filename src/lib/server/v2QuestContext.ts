// 가이드 퀘스트 진행 상태(QuestCtx) 를 세이브 raw 값 + 외부 신호로 조립. GET(무락 read)·claim(락 read)
// 양쪽이 같은 함수를 쓰도록 raw 값/extras 를 인자로 받는다(읽기는 호출부가 책임).
//   character.v2  → class·level·frontierDepth·specChoice(→직업 tier 브리지)
//   proficiency.v2 → cultivations(현 직군). tier = 직업 카탈로그 tier(jobIdFromLegacy)
//   adventure-log.v2 → battleCount·bossKills(보스 첫 처치 칭호 수)
//   equipment.v2  → equippedCount·uniqueOwned
//   extras(DB/별도 세이브) → hasGuild·hasTraded·arenaPlayed (assembleQuestExtras)

import { and, eq, or, sql } from "drizzle-orm";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import {
  V2_JOB_CATALOG,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  parseProficiencyForChar,
  totalCumLevel,
} from "@/adventure/data/v2/proficiency";
import {
  parseEquipmentSave,
  isUnique,
  V2_EQUIPMENT,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { ENHANCE_STONE_MATERIAL_ID } from "@/adventure/data/v2/v2Enhance";
import {
  BOSS_TITLE_IDS,
  BOSS_TITLE_TO_KIND,
} from "@/adventure/data/v2/coopBosses";
import type { QuestCtx } from "@/adventure/data/v2/v2Quests";
import {
  parseRepeatSave,
  repeatSaveNeedsRollover,
  rolloverRepeatSave,
  type RepeatSignals,
} from "@/adventure/data/v2/v2RepeatQuests";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
  type DbExecutor,
} from "@/lib/server/savesKv";
import {
  guildActivityRollups,
  guildMembers,
  guildActivityLog,
  marketplaceListingsV2,
  marketplaceUserTradeTotals,
  pvpRatings,
} from "@/db/schema";
import { ARENA_HISTORY_KEY } from "@/lib/storage-keys";
import { parseArenaHistory } from "@/lib/server/arena";
import { parseFishCodex } from "@/adventure/v2/fishingCodex";
import { artisanLevel, parseArtisanState } from "@/adventure/data/v2/artisan";
import { parseGuildWorkshopStats } from "@/adventure/data/v2/guildWorkshop";
import {
  FARM_SAVE_KEY,
  farmingLevelForState,
  parseFarmState,
} from "@/adventure/v2/farm";
import {
  WOODCUTTING_LOG_KEY,
  parseWoodcuttingLog,
} from "@/adventure/v2/woodcuttingSession";
import { woodcuttingProgressionView } from "@/adventure/v2/woodcuttingProgression";
import {
  MINING_LOG_KEY,
  parseMiningLog,
} from "@/adventure/v2/miningSession";
import { miningProgressionView } from "@/adventure/v2/miningProgression";
import {
  fishingLevelForXp,
  parseFishingProgression,
} from "@/adventure/v2/fishingProgression";
import {
  equipmentCodexSummary,
} from "@/adventure/data/v2/equipmentCodex";
import {
  parseMasteryTowerState,
} from "@/adventure/data/v2/masteryTower";
import {
  cookingLevelForXp,
  parseCookingState,
} from "@/adventure/v2/cooking";
import { parseV2SkillsState } from "@/adventure/data/v2/v2Skills";

type CharSave = {
  class?: unknown;
  level?: unknown;
  frontierDepth?: unknown;
  specChoice?: unknown; // 직업 사다리 브리지(jobIdFromLegacy) — tier 파생용
  gold?: unknown;
  bankedGold?: unknown;
  hasHealed?: unknown;
  hasShopped?: unknown;
  hasManuallyEquippedGear?: unknown;
  hasBattledAfterEquippingGear?: unknown;
  hasEditedSkillLoadout?: unknown;
  discoveredOutpostIds?: unknown;
  materials?: Record<string, unknown>;
};

type AdventureLog = {
  monsters?: Record<string, { kills?: number }>;
  battleLosses?: number;
  titles?: Record<string, unknown>;
  // 격파한 협동 보스 종류(coop/claim 기록) — bossKills 판정용. 옛 세이브엔 없음(레거시 칭호로 환산).
  coopBossKinds?: unknown;
};

export type QuestExtras = {
  hasGuild: boolean;
  hasTraded: boolean;
  arenaPlayed: boolean;
  arenaWins: number;
  guildDiningMeals: number;
  guildTrainingDrills: number;
  guildExpeditions: number;
  guildWorkshopDeliveries: number;
  guildAlchemyCrafts: number;
  guildTradeContracts: number;
  // 생활의 달인 — 도감 세이브 파생(fishing-codex.v1).
  fishSpecies: number;
  // 반복 퀘스트(차분 판정) — 누적치/타임스탬프.
  fishCaught: number;
  arenaTimes: number[];
};

export function buildQuestCtx(args: {
  charRaw: unknown;
  proficiencyRaw: unknown;
  advLogRaw: unknown;
  equipmentRaw: unknown;
  skillsRaw: unknown;
  craftingRaw: unknown;
  farmRaw?: unknown;
  woodcuttingRaw?: unknown;
  miningRaw?: unknown;
  fishingProgressRaw?: unknown;
  equipmentCodexRaw?: unknown;
  masteryTowerRaw?: unknown;
  cookingRaw?: unknown;
  extras: QuestExtras;
}): QuestCtx {
  const charSave = (args.charRaw ?? {}) as CharSave;

  const cls = parseV2Class(charSave.class);
  const group = tier1ClassOf(cls);

  const level =
    typeof charSave.level === "number"
      ? Math.max(1, Math.floor(charSave.level))
      : 1;
  const frontierDepth = Math.max(
    2,
    Math.floor(Number(charSave.frontierDepth) || 2),
  );

  // 전직 진행(tier 0~6) — 코어루프는 proficiency 차수를 폐지(flattenGroupTiers 로 항상 1)하므로
  //   현 직업의 카탈로그 tier 로 본다(직업 사다리 = jobIdFromLegacy(class, specChoice) → 카탈로그).
  //   specChoice 는 advance-class 가 써주는 직업 저장 브리지(전문화 패시브와 무관).
  const spec =
    typeof charSave.specChoice === "string" ? charSave.specChoice : null;
  const tier = V2_JOB_CATALOG[jobIdFromLegacy(cls, spec)]?.tier ?? 1;
  // 수행 횟수 — 현 직군 그룹 기준(state 라우트와 동일 파생).
  const prof = parseProficiencyForChar(args.proficiencyRaw, charSave);
  const g = prof.groups[group];
  const cultivations = g?.cultivations ?? 0;

  // 전투 수 — monster kills 합 + 패배(랭킹 battleCount 정의와 동일). 보상 게이트라 숫자 강제
  // 변환(손상 세이브의 문자열 값이 "+" 로 연결돼 string>=number 오판정 → 오지급되는 일 방지).
  const num = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const advLog = (args.advLogRaw ?? {}) as AdventureLog;
  const battleCount =
    Object.values(advLog.monsters ?? {}).reduce(
      (sum, m) => sum + num(m?.kills),
      0,
    ) + num(advLog.battleLosses);
  const titles = advLog.titles ?? {};
  // bossKills = 격파한 협동 보스 종류 수. 신규 기록(coopBossKinds) + 레거시(보스 칭호 보유분을
  //   종류로 환산)의 합집합 — 보상 개편으로 칭호 지급은 끊겼지만 기존 진행 보존(둘 다 멱등·종류 dedup).
  const killedKinds = new Set<string>(
    Array.isArray(advLog.coopBossKinds)
      ? advLog.coopBossKinds.filter((k): k is string => typeof k === "string")
      : [],
  );
  for (const titleId of BOSS_TITLE_IDS) {
    if (titles[titleId] != null) killedKinds.add(BOSS_TITLE_TO_KIND[titleId]);
  }
  const bossKills = killedKinds.size;
  const titleCount =
    titles && typeof titles === "object" ? Object.keys(titles).length : 0;

  const { owned, equipped } = parseEquipmentSave(args.equipmentRaw);
  const equippedCount = Object.values(equipped).filter(
    (iid) => iid != null,
  ).length;
  const uniqueOwned = owned.filter((it) => {
    const def = V2_EQUIPMENT[it.id as V2EquipmentId];
    return def ? isUnique(def) : false;
  }).length;
  // 강화의 길 — 보유 장비 최고 강화 레벨 + 강화석 보유 합(붉은+푸른).
  const maxEnhanceLevel = owned.reduce(
    (max, it) => Math.max(max, it.enhance?.level ?? 0),
    0,
  );
  const mats = charSave.materials ?? {};
  const enhanceStones =
    num(mats[ENHANCE_STONE_MATERIAL_ID.red]) +
    num(mats[ENHANCE_STONE_MATERIAL_ID.blue]);

  const gold = num(charSave.gold);
  const outpostsDiscovered = Array.isArray(charSave.discoveredOutpostIds)
    ? charSave.discoveredOutpostIds.length
    : 0;
  // 기초 튜토리얼 — 은행 예치 골드 / 로드아웃 장착 스킬 수.
  const bankedGold = num(charSave.bankedGold);
  const hasHealed = Boolean(charSave.hasHealed);
  const hasShopped = Boolean(charSave.hasShopped);
  const hasManuallyEquippedGear = Boolean(charSave.hasManuallyEquippedGear);
  const hasBattledAfterEquippingGear = Boolean(
    charSave.hasBattledAfterEquippingGear,
  );
  const hasEditedSkillLoadout = Boolean(charSave.hasEditedSkillLoadout);
  const craftingSave =
    args.craftingRaw != null &&
    typeof args.craftingRaw === "object" &&
    !Array.isArray(args.craftingRaw)
      ? (args.craftingRaw as Record<string, unknown>)
      : {};
  const workshopStats = parseGuildWorkshopStats(craftingSave.workshopStats);
  const artisan = parseArtisanState(craftingSave.artisan);
  const blacksmithLevel = artisanLevel(artisan.blacksmith);
  // 튜토리얼 판정도 전투와 같은 정규화된 스킬 상태를 사용한다. 현재 장착 수가 1 이상이면
  // 퀘스트 활성화 전에 장착했더라도 「기술 연마」가 즉시 완료된다.
  const skillsSave = parseV2SkillsState(args.skillsRaw);
  const skillsEquipped = skillsSave.equipped.length;
  const skillsLearned = skillsSave.learned.length;

  const farm = parseFarmState(args.farmRaw);
  const woodcutting = parseWoodcuttingLog(args.woodcuttingRaw);
  const woodcuttingProgress = woodcuttingProgressionView(
    woodcutting.cuts,
    woodcutting.xp,
  );
  const mining = parseMiningLog(args.miningRaw);
  const miningProgress = miningProgressionView(mining.successes, mining.xp);
  const fishing = parseFishingProgression(args.fishingProgressRaw);
  const equipmentCodex = equipmentCodexSummary(args.equipmentCodexRaw);
  const masteryTower = parseMasteryTowerState(args.masteryTowerRaw);
  const cooking = parseCookingState(args.cookingRaw);
  const cookingLevel = cookingLevelForXp(cooking.xp);
  const cookingRecipesDiscovered = cooking.discoveredRecipeIds.length;

  // 확장 신호(2026-06-11) — 직업 숙련도·몬스터 종 수.
  const cumLevel = totalCumLevel(prof);
  // 전투직 재전직 횟수 — 생활직 반복 전환은 제외한 실제 행동 카운터를 사용한다.
  const reincarnations = prof.reincarnations ?? 0;
  const speciesKilled = Object.values(advLog.monsters ?? {}).filter(
    (m) => num(m?.kills) > 0,
  ).length;

  return {
    class: cls,
    level,
    tier,
    battleCount,
    frontierDepth,
    equippedCount,
    hasManuallyEquippedGear,
    hasBattledAfterEquippingGear,
    uniqueOwned,
    cultivations,
    bossKills,
    hasGuild: args.extras.hasGuild,
    hasTraded: args.extras.hasTraded,
    arenaPlayed: args.extras.arenaPlayed,
    arenaWins: args.extras.arenaWins,
    gold,
    outpostsDiscovered,
    titleCount,
    cumLevel,
    reincarnations,
    speciesKilled,
    fishSpecies: args.extras.fishSpecies,
    maxEnhanceLevel,
    enhanceStones,
    bankedGold,
    skillsEquipped,
    skillsLearned,
    hasEditedSkillLoadout,
    hasHealed,
    hasShopped,
    workshopCrafts: workshopStats.totalCrafts,
    workshopQualityCrafts: workshopStats.qualityCrafts,
    blacksmithLevel,
    farmingLevel: farmingLevelForState(farm),
    farmHarvests: farm.stats.harvests,
    farmRareHarvests: farm.stats.rareHarvests,
    farmDeliveries: farm.stats.deliveries,
    // reputation은 누적 획득량이고 reputationSpent는 그중 사용한 양이다.
    // 사용량을 다시 더하면 증표를 쓸 때마다 업적 진행도가 이중으로 오르므로 획득량만 사용한다.
    farmReputationEarned: farm.stats.reputation,
    woodcuttingLevel: woodcuttingProgress.level,
    woodcuttingCuts: woodcutting.cuts,
    woodcuttingSpecies: Object.keys(woodcutting.trees).length,
    miningLevel: miningProgress.level,
    miningSuccesses: mining.successes,
    miningByproducts: mining.byproductsEarned,
    miningSpecies: Object.keys(mining.nodes).length,
    fishingLevel: fishingLevelForXp(fishing.xp),
    fishCaught: fishing.catches,
    equipmentCodexRegistered: equipmentCodex.registeredCount,
    equipmentCodexTotal: equipmentCodex.total,
    masteryTowerFloor: masteryTower.lifetimeBestFloor,
    cookingLevel,
    cookingRecipesDiscovered,
    cookingDishesCooked: cooking.stats.dishesCooked,
    cookingOrdersCompleted: cooking.stats.ordersCompleted,
    cookingMasterpiecesCooked: cooking.stats.masterpiecesCooked,
    cookingRareIngredientDishes: cooking.stats.rareIngredientDishes,
    guildDiningMeals: args.extras.guildDiningMeals,
    guildTrainingDrills: args.extras.guildTrainingDrills,
    guildExpeditions: args.extras.guildExpeditions,
    guildWorkshopDeliveries: args.extras.guildWorkshopDeliveries,
    guildAlchemyCrafts: args.extras.guildAlchemyCrafts,
    guildTradeContracts: args.extras.guildTradeContracts,
  };
}

// 세이브 raw 외의 신호(DB·별도 세이브 키) 집계 — 길드 소속 / 거래소 거래 / 투기장 기록.
// GET 은 db, claim 은 tx 를 넘긴다(둘 다 읽기 전용 쿼리).
export async function assembleQuestExtras(
  ex: DbExecutor,
  userId: string,
): Promise<QuestExtras> {
  // claim 경로는 transaction 을 넘긴다. pg transaction 의 단일 client 에서
  // query 를 겹치지 않도록 모든 집계를 순서대로 실행한다.
  const guildRows = await ex
    .select({ id: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  const tradeRows = await ex
    .select({ id: marketplaceListingsV2.id })
    .from(marketplaceListingsV2)
    .where(
      and(
        eq(marketplaceListingsV2.status, "sold"),
        or(
          eq(marketplaceListingsV2.sellerId, userId),
          eq(marketplaceListingsV2.buyerId, userId),
        ),
      ),
    )
    .limit(1);
  const archivedTradeRows = await ex
    .select({ userId: marketplaceUserTradeTotals.userId })
    .from(marketplaceUserTradeTotals)
    .where(
      and(
        eq(marketplaceUserTradeTotals.userId, userId),
        sql`${marketplaceUserTradeTotals.purchases} + ${marketplaceUserTradeTotals.sales} > 0`,
      ),
    )
    .limit(1);
  const arenaRaw = await readSave(ex, userId, ARENA_HISTORY_KEY, {});
  const arenaAgg = await ex
    .select({
      matches: sql<number>`coalesce(sum(${pvpRatings.wins} + ${pvpRatings.losses} + ${pvpRatings.draws}), 0)::bigint`,
      wins: sql<number>`coalesce(sum(${pvpRatings.wins}), 0)::bigint`,
    })
    .from(pvpRatings)
    .where(eq(pvpRatings.userId, userId));
  const fishRaw = await readSave(ex, userId, "fishing-codex.v1", {});
  const guildActivityAgg = await ex
    .select({
      diningMeals: sql<number>`count(*) filter (where ${guildActivityLog.type} = 'dining_meal')::bigint`,
      trainingDrills: sql<number>`count(*) filter (where ${guildActivityLog.type} = 'training_drill_claim')::bigint`,
      expeditions: sql<number>`count(*) filter (where ${guildActivityLog.type} = 'exploration_expedition_claim')::bigint`,
      workshopDeliveries: sql<number>`count(*) filter (where ${guildActivityLog.type} = 'workshop_delivery')::bigint`,
      alchemyCrafts: sql<number>`count(*) filter (where ${guildActivityLog.type} = 'alchemy_craft')::bigint`,
      tradeContracts: sql<number>`count(*) filter (where ${guildActivityLog.type} = 'trade_contract_complete')::bigint`,
    })
    .from(guildActivityLog)
    .where(eq(guildActivityLog.actorUserId, userId));
  const archivedGuildActivityAgg = await ex
    .select({
      diningMeals: sql<number>`coalesce(sum(${guildActivityRollups.eventCount}) filter (where ${guildActivityRollups.source} = 'dining_meal'), 0)::bigint`,
      trainingDrills: sql<number>`coalesce(sum(${guildActivityRollups.eventCount}) filter (where ${guildActivityRollups.source} = 'training_drill_claim'), 0)::bigint`,
      expeditions: sql<number>`coalesce(sum(${guildActivityRollups.eventCount}) filter (where ${guildActivityRollups.source} = 'exploration_expedition_claim'), 0)::bigint`,
      workshopDeliveries: sql<number>`coalesce(sum(${guildActivityRollups.eventCount}) filter (where ${guildActivityRollups.source} = 'workshop_delivery'), 0)::bigint`,
      alchemyCrafts: sql<number>`coalesce(sum(${guildActivityRollups.eventCount}) filter (where ${guildActivityRollups.source} = 'alchemy_craft'), 0)::bigint`,
      tradeContracts: sql<number>`coalesce(sum(${guildActivityRollups.eventCount}) filter (where ${guildActivityRollups.source} = 'trade_contract_complete'), 0)::bigint`,
    })
    .from(guildActivityRollups)
    .where(
      and(
        eq(guildActivityRollups.userId, userId),
        eq(guildActivityRollups.periodKey, "lifetime"),
      ),
    );
  const arenaHistory = parseArenaHistory(arenaRaw);

  const fishCodex = parseFishCodex(fishRaw);
  const lifetimeArenaMatches = Number(arenaAgg[0]?.matches ?? 0);
  const lifetimeArenaWins = Number(arenaAgg[0]?.wins ?? 0);
  return {
    hasGuild: guildRows.length > 0,
    hasTraded: tradeRows.length > 0 || archivedTradeRows.length > 0,
    arenaPlayed: lifetimeArenaMatches > 0 || arenaHistory.length > 0,
    arenaWins: Math.max(
      lifetimeArenaWins,
      arenaHistory.filter((e) => e.outcome === "win").length,
    ),
    guildDiningMeals:
      Number(guildActivityAgg[0]?.diningMeals ?? 0) +
      Number(archivedGuildActivityAgg[0]?.diningMeals ?? 0),
    guildTrainingDrills:
      Number(guildActivityAgg[0]?.trainingDrills ?? 0) +
      Number(archivedGuildActivityAgg[0]?.trainingDrills ?? 0),
    guildExpeditions:
      Number(guildActivityAgg[0]?.expeditions ?? 0) +
      Number(archivedGuildActivityAgg[0]?.expeditions ?? 0),
    guildWorkshopDeliveries: Number(
      guildActivityAgg[0]?.workshopDeliveries ?? 0,
    ) + Number(archivedGuildActivityAgg[0]?.workshopDeliveries ?? 0),
    guildAlchemyCrafts:
      Number(guildActivityAgg[0]?.alchemyCrafts ?? 0) +
      Number(archivedGuildActivityAgg[0]?.alchemyCrafts ?? 0),
    guildTradeContracts:
      Number(guildActivityAgg[0]?.tradeContracts ?? 0) +
      Number(archivedGuildActivityAgg[0]?.tradeContracts ?? 0),
    fishSpecies: Object.keys(fishCodex.fish).length,
    fishCaught: Object.values(fishCodex.fish).reduce(
      (sum, e) => sum + Math.max(0, e.totalCaught ?? 0),
      0,
    ),
    arenaTimes: arenaHistory
      .map((e) => new Date(e.at).getTime())
      .filter((t) => Number.isFinite(t)),
  };
}

// guide-quests.v2 세이브 → 수령 완료 id 집합. (서버 전용 키 — SYNCED_KEYS 아님.)
export function parseClaimed(raw: unknown): Set<string> {
  const obj = (raw ?? {}) as { claimed?: unknown };
  if (!Array.isArray(obj.claimed)) return new Set();
  return new Set(obj.claimed.filter((x): x is string => typeof x === "string"));
}

export function parseTrackedQuestId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const trackedQuestId = (raw as { trackedQuestId?: unknown }).trackedQuestId;
  return typeof trackedQuestId === "string" && trackedQuestId.length > 0
    ? trackedQuestId
    : null;
}

export function guideQuestSavePayload(
  claimed: ReadonlySet<string>,
  trackedQuestId: string | null,
): { claimed: string[]; trackedQuestId?: string } {
  return trackedQuestId
    ? { claimed: [...claimed], trackedQuestId }
    : { claimed: [...claimed] };
}

export const GUIDE_QUESTS_KEY = "guide-quests.v2";
export const REPEAT_QUESTS_KEY = "repeat-quests.v2";

// guide-quests.v2 를 무락 read → 수령 완료 퀘스트 id 집합. 직업 해금 questCompleted 조건의
// 데이터 소스(JobUnlockContext.completedQuestIds). 읽기 전용 게이트라 lock 불필요(readSave).
// 반복 퀘스트(repeat-quests.v2)는 영구 완료가 아니라 제외 — questCompleted 는 1회성 가이드 완료만.
export async function loadCompletedQuestIds(
  exec: DbExecutor,
  userId: string,
): Promise<Set<string>> {
  const raw = await readSave(exec, userId, GUIDE_QUESTS_KEY, {});
  return parseClaimed(raw);
}

// 반복 퀘스트 신호 — adventure-log 누적치 + extras. ctx(가이드용)와 분리된 얇은 조립.
export function buildRepeatSignals(
  advLogRaw: unknown,
  extras: QuestExtras,
  raws: {
    farmRaw?: unknown;
    woodcuttingRaw?: unknown;
    miningRaw?: unknown;
    craftingRaw?: unknown;
  } = {},
): RepeatSignals {
  const advLog = (advLogRaw ?? {}) as AdventureLog & {
    enhanceAttempts?: unknown;
  };
  const n = (v: unknown): number => {
    const x = typeof v === "number" ? v : Number(v);
    return Number.isFinite(x) ? Math.max(0, x) : 0;
  };
  const battleCount =
    Object.values(advLog.monsters ?? {}).reduce(
      (sum, m) => sum + n(m?.kills),
      0,
    ) + n(advLog.battleLosses);
  const farm = parseFarmState(raws.farmRaw);
  const woodcutting = parseWoodcuttingLog(raws.woodcuttingRaw);
  const mining = parseMiningLog(raws.miningRaw);
  const craftingSave =
    raws.craftingRaw && typeof raws.craftingRaw === "object"
      ? (raws.craftingRaw as Record<string, unknown>)
      : {};
  const workshop = parseGuildWorkshopStats(craftingSave.workshopStats);
  return {
    battleCount,
    fishCaught: extras.fishCaught,
    enhanceAttempts: n(advLog.enhanceAttempts),
    farmHarvests: farm.stats.harvests,
    woodcuttingCuts: woodcutting.cuts,
    miningSuccesses: mining.successes,
    workshopCrafts: workshop.totalCrafts,
    arenaTimes: extras.arenaTimes,
  };
}

// 반복 퀘스트 누적 신호를 올리는 행동 전에 호출한다. 자정/주간 경계 뒤 첫 행동이
// 새 baseline 에 흡수되지 않도록, 해당 행동의 카운터를 변경하기 전에 주기를 확정한다.
// 빠른 경로는 무락 read 1회이며, 실제 롤오버가 필요할 때만 행 잠금과 전체 신호 조립을 한다.
export async function rolloverRepeatQuestsBeforeProgress(
  ex: DbExecutor,
  userId: string,
  now: Date,
): Promise<boolean> {
  const current = parseRepeatSave(
    await readSave(ex, userId, REPEAT_QUESTS_KEY, {}),
  );
  if (!repeatSaveNeedsRollover(current, now)) return false;

  const locked = parseRepeatSave(
    await lockSaveForUpdate(ex, userId, REPEAT_QUESTS_KEY, {}),
  );
  if (!repeatSaveNeedsRollover(locked, now)) return false;

  const advLogRaw = await readSave(ex, userId, "adventure-log.v2", {});
  const farmRaw = await readSave(ex, userId, FARM_SAVE_KEY, {});
  const woodcuttingRaw = await readSave(
    ex,
    userId,
    WOODCUTTING_LOG_KEY,
    {},
  );
  const miningRaw = await readSave(ex, userId, MINING_LOG_KEY, {});
  const craftingRaw = await readSave(ex, userId, "crafting.v2", {});
  const extras = await assembleQuestExtras(ex, userId);
  const signals = buildRepeatSignals(advLogRaw, extras, {
    farmRaw,
    woodcuttingRaw,
    miningRaw,
    craftingRaw,
  });
  const rolled = rolloverRepeatSave(locked, now, signals);
  if (rolled.changed) {
    await upsertSave(ex, userId, REPEAT_QUESTS_KEY, rolled.save);
  }
  return rolled.changed;
}
