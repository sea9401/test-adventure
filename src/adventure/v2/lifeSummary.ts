import {
  blacksmithJobForLevel,
  artisanLevel,
  artisanXpForNextLevel,
  artisanXpIntoLevel,
  nextArtisanMilestone,
  parseArtisanState,
  BLACKSMITH_REWARD_MILESTONES,
} from "@/adventure/data/v2/artisan";
import {
  parseGuildWorkshopStats,
} from "@/adventure/data/v2/guildWorkshop";
import { FISH_TOTAL } from "@/adventure/data/v2/fish";
import {
  COOKING_LEVEL_CAP,
  cookingLevelForXp,
  cookingLevelXpThreshold,
  parseCookingState,
} from "./cooking/state";
import { COOKING_PUBLIC_RECIPES } from "./cooking/catalog";
import {
  countDiscoveredFish,
  parseFishCodex,
} from "./fishingCodex";
import { fishingCatchItemChancePct } from "./fishingStock";
import {
  FISHING_LEVEL_CAP,
  fishingLevelBonuses,
  fishingProgressionView,
  parseFishingProgression,
} from "./fishingProgression";
import {
  farmingLevelForState,
  farmingLevelXpThreshold,
  parseFarmState,
} from "./farm";
import {
  MINING_LEVEL_CAP,
  miningProgressionView,
  miningTimeReduction,
} from "./miningProgression";
import { parseMiningLog } from "./miningSession";
import {
  WOODCUTTING_LEVEL_CAP,
  woodcuttingProgressionView,
  woodcuttingTimeReduction,
} from "./woodcuttingProgression";
import { parseWoodcuttingLog } from "./woodcuttingSession";
import { LIFE_LEVEL_CAP } from "./lifeLevelProgression";

export const LIFE_MASTERY_ACTIVITY_LEVEL_CAP = LIFE_LEVEL_CAP;
export const LIFE_MASTERY_MAX_LEVEL = LIFE_MASTERY_ACTIVITY_LEVEL_CAP * 5;

export type LifeActivityId =
  | "farming"
  | "woodcutting"
  | "mining"
  | "fishing"
  | "cooking"
  | "blacksmith";

export type LifeRecord = {
  label: string;
  value: number;
  suffix?: string;
};

export type LifeActivitySummary = {
  id: LifeActivityId;
  level: number;
  levelCap: number | null;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number;
  records: LifeRecord[];
  effects: string[];
  nextGoal: string | null;
};

export type LifeSummary = {
  lifeMastery: {
    level: number;
    maxLevel: number;
  };
  activities: LifeActivitySummary[];
  artisan: LifeActivitySummary;
};

export type LifeSummarySaves = {
  farmRaw?: unknown;
  woodcuttingRaw?: unknown;
  miningRaw?: unknown;
  fishingRaw?: unknown;
  fishingCodexRaw?: unknown;
  cookingRaw?: unknown;
  craftingRaw?: unknown;
};

const LIFE_JOB_MILESTONES = {
  farming: [
    { level: 10, name: "원예가" },
    { level: 20, name: "숙련 농부" },
    { level: 35, name: "농업 장인" },
    { level: 50, name: "전설의 농부" },
  ],
  woodcutting: [
    { level: 10, name: "산림 기술자" },
    { level: 20, name: "벌목 명인" },
    { level: 35, name: "산림 대가" },
    { level: 50, name: "전설의 나무꾼" },
  ],
  mining: [
    { level: 10, name: "광산 기술자" },
    { level: 20, name: "채광 명인" },
    { level: 35, name: "광산 대가" },
    { level: 50, name: "전설의 광부" },
  ],
  cooking: [
    { level: 5, name: "요리사" },
    { level: 10, name: "전문 요리사" },
    { level: 20, name: "수석 요리사" },
    { level: 35, name: "요리 명장" },
    { level: 50, name: "전설의 요리사" },
  ],
} as const;

const LIFE_EXTENSION_MILESTONES = [60, 75, 90, 100] as const;

function nextLifeExtensionGoal(level: number): string | null {
  const nextLevel = LIFE_EXTENSION_MILESTONES.find(
    (milestoneLevel) => milestoneLevel > level,
  );
  return nextLevel ? `다음 숙련 마일스톤 · Lv.${nextLevel}` : null;
}

function nextLifeJobGoal(
  milestones: readonly { level: number; name: string }[],
  level: number,
): string | null {
  const next = milestones.find((milestone) => milestone.level > level);
  return next
    ? `${next.name} 생활 레벨 조건 · Lv.${next.level}`
    : nextLifeExtensionGoal(level);
}

function cappedProgress(args: {
  level: number;
  levelCap: number;
  xp: number;
  threshold: (level: number) => number;
}) {
  const level = Math.min(args.levelCap, Math.max(1, args.level));
  if (level >= args.levelCap) {
    return { level, xpIntoLevel: 0, xpForNext: 0 };
  }
  const start = args.threshold(level);
  const end = args.threshold(level + 1);
  return {
    level,
    xpIntoLevel: Math.max(0, args.xp - start),
    xpForNext: Math.max(1, end - start),
  };
}

function nextFishingBonusGoal(level: number): string | null {
  const current = fishingLevelBonuses(level);
  for (let nextLevel = level + 1; nextLevel <= FISHING_LEVEL_CAP; nextLevel += 1) {
    const next = fishingLevelBonuses(nextLevel);
    if (
      next.sizeBonusPct !== current.sizeBonusPct ||
      next.rareSizeBonusPct !== current.rareSizeBonusPct ||
      next.bigCatchSizeBonusPct !== current.bigCatchSizeBonusPct ||
      next.specialWeightPct !== current.specialWeightPct
    ) {
      return `낚시 보너스 강화 · Lv.${nextLevel}`;
    }
  }
  return null;
}

function percent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function lifeSummaryFromSaves(
  saves: LifeSummarySaves,
  now = Date.now(),
): LifeSummary {
  const farm = parseFarmState(saves.farmRaw);
  const rawFarmingLevel = farmingLevelForState(farm);
  const farming = cappedProgress({
    level: rawFarmingLevel,
    levelCap: LIFE_MASTERY_ACTIVITY_LEVEL_CAP,
    xp: farm.stats.farmingXp,
    threshold: farmingLevelXpThreshold,
  });

  const woodcuttingLog = parseWoodcuttingLog(saves.woodcuttingRaw);
  const woodcutting = woodcuttingProgressionView(
    woodcuttingLog.cuts,
    woodcuttingLog.xp,
  );

  const miningLog = parseMiningLog(saves.miningRaw);
  const mining = miningProgressionView(miningLog.successes, miningLog.xp);

  const fishing = fishingProgressionView(
    parseFishingProgression(saves.fishingRaw),
  );
  const fishingCodex = parseFishCodex(saves.fishingCodexRaw);

  const cookingState = parseCookingState(saves.cookingRaw, now);
  const rawCookingLevel = cookingLevelForXp(cookingState.xp);
  const cooking = cappedProgress({
    level: rawCookingLevel,
    levelCap: COOKING_LEVEL_CAP,
    xp: cookingState.xp,
    threshold: cookingLevelXpThreshold,
  });

  const crafting =
    saves.craftingRaw != null &&
    typeof saves.craftingRaw === "object" &&
    !Array.isArray(saves.craftingRaw)
      ? (saves.craftingRaw as Record<string, unknown>)
      : {};
  const artisanState = parseArtisanState(crafting.artisan);
  const blacksmith = artisanState.blacksmith ?? { xp: 0, crafts: 0 };
  const blacksmithLevel = artisanLevel(blacksmith);
  const workshopStats = parseGuildWorkshopStats(crafting.workshopStats);
  const blacksmithMilestone = nextArtisanMilestone(
    BLACKSMITH_REWARD_MILESTONES,
    blacksmithLevel,
  );

  const activities: LifeActivitySummary[] = [
    {
      id: "farming",
      level: farming.level,
      levelCap: LIFE_MASTERY_ACTIVITY_LEVEL_CAP,
      xp: farm.stats.farmingXp,
      xpIntoLevel: farming.xpIntoLevel,
      xpForNext: farming.xpForNext,
      records: [
        { label: "총 수확", value: farm.stats.harvests, suffix: "회" },
        { label: "희귀 수확", value: farm.stats.rareHarvests, suffix: "회" },
        { label: "납품", value: farm.stats.deliveries, suffix: "회" },
        { label: "농장 평판", value: farm.stats.reputation },
      ],
      effects: ["생산직 계열 전직 조건에 반영"],
      nextGoal: nextLifeJobGoal(LIFE_JOB_MILESTONES.farming, farming.level),
    },
    {
      id: "woodcutting",
      level: woodcutting.level,
      levelCap: WOODCUTTING_LEVEL_CAP,
      xp: woodcutting.xp,
      xpIntoLevel: woodcutting.xpIntoLevel,
      xpForNext: woodcutting.xpForNext,
      records: [
        { label: "총 벌목", value: woodcuttingLog.cuts, suffix: "회" },
        { label: "완벽 벌목", value: woodcuttingLog.perfectCuts, suffix: "회" },
        { label: "획득 원목", value: woodcuttingLog.timberEarned, suffix: "개" },
        { label: "최고 콤보", value: woodcuttingLog.bestCombo },
      ],
      effects: [
        `작업 시간 ${percent(woodcuttingTimeReduction(woodcutting.level) * 100)}% 단축`,
        "레벨에 따라 실패 확률 감소",
      ],
      nextGoal: nextLifeJobGoal(
        LIFE_JOB_MILESTONES.woodcutting,
        woodcutting.level,
      ),
    },
    {
      id: "mining",
      level: mining.level,
      levelCap: MINING_LEVEL_CAP,
      xp: mining.xp,
      xpIntoLevel: mining.xpIntoLevel,
      xpForNext: mining.xpForNext,
      records: [
        { label: "채광 성공", value: miningLog.successes, suffix: "회" },
        { label: "획득 광석", value: miningLog.oreEarned, suffix: "개" },
        { label: "부산물", value: miningLog.byproductsEarned, suffix: "개" },
        { label: "발견 광맥", value: Object.keys(miningLog.nodes).length, suffix: "종" },
      ],
      effects: [
        `작업 시간 ${percent(miningTimeReduction(mining.level) * 100)}% 단축`,
        "레벨에 따라 실패 확률 감소",
      ],
      nextGoal: nextLifeJobGoal(LIFE_JOB_MILESTONES.mining, mining.level),
    },
    {
      id: "fishing",
      level: fishing.level,
      levelCap: FISHING_LEVEL_CAP,
      xp: fishing.xp,
      xpIntoLevel: fishing.xpIntoLevel,
      xpForNext: fishing.level >= FISHING_LEVEL_CAP ? 0 : fishing.xpForNext,
      records: [
        { label: "총 어획", value: fishing.catches, suffix: "마리" },
        {
          label: "등록 어종",
          value: countDiscoveredFish(fishingCodex),
          suffix: `/${FISH_TOTAL}종`,
        },
        { label: "보유 낚싯대", value: fishing.ownedRods.length, suffix: "개" },
        { label: "보유 미끼", value: fishing.ownedLures.length, suffix: "개" },
      ],
      effects: [
        `물고기 크기 +${fishing.levelBonuses.sizeBonusPct}%`,
        `특별 손님 가중치 +${fishing.levelBonuses.specialWeightPct}%`,
        `어획물 획득 확률 ${fishingCatchItemChancePct(fishing.level)}%`,
      ],
      nextGoal:
        fishing.level >= 50
          ? nextLifeExtensionGoal(fishing.level)
          : nextFishingBonusGoal(fishing.level),
    },
    {
      id: "cooking",
      level: cooking.level,
      levelCap: COOKING_LEVEL_CAP,
      xp: cookingState.xp,
      xpIntoLevel: cooking.xpIntoLevel,
      xpForNext: cooking.xpForNext,
      records: [
        { label: "조리한 요리", value: cookingState.stats.dishesCooked, suffix: "개" },
        { label: "걸작 요리", value: cookingState.stats.masterpiecesCooked, suffix: "개" },
        { label: "납품 완료", value: cookingState.stats.deliveriesCompleted, suffix: "회" },
        {
          label: "발견 조리법",
          value: cookingState.discoveredRecipeIds.length,
          suffix: `/${COOKING_PUBLIC_RECIPES.length}개`,
        },
      ],
      effects: [
        `현재 레벨 연구 대상 ${COOKING_PUBLIC_RECIPES.filter((recipe) => recipe.requiredLevel <= cooking.level).length}/${COOKING_PUBLIC_RECIPES.length}개`,
      ],
      nextGoal: nextLifeJobGoal(LIFE_JOB_MILESTONES.cooking, cooking.level),
    },
  ];

  return {
    lifeMastery: {
      level: activities.reduce((sum, activity) => sum + activity.level, 0),
      maxLevel: LIFE_MASTERY_MAX_LEVEL,
    },
    activities,
    artisan: {
      id: "blacksmith",
      level: blacksmithLevel,
      levelCap: null,
      xp: blacksmith.xp,
      xpIntoLevel: artisanXpIntoLevel(blacksmith),
      xpForNext: artisanXpForNextLevel(blacksmith),
      records: [
        { label: "제작", value: workshopStats.totalCrafts, suffix: "회" },
        { label: "품질 제작", value: workshopStats.qualityCrafts, suffix: "회" },
        { label: "숙련 활동", value: blacksmith.crafts, suffix: "회" },
      ],
      effects: [
        `${blacksmithJobForLevel(blacksmithLevel).name} · ${blacksmithJobForLevel(blacksmithLevel).role}`,
      ],
      nextGoal: blacksmithMilestone
        ? `${blacksmithMilestone.title} · Lv.${blacksmithMilestone.level}`
        : null,
    },
  };
}
