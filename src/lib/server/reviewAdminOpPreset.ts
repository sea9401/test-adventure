import { MAX_FRONTIER_DEPTH } from "@/adventure/data/v2/dungeon";
import {
  parseProficiencyForChar,
  type V2ProficiencyGroup,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import { V2_STAT_KEYS } from "@/adventure/data/v2/v2StatKeys";
import { jobIdFromLegacy } from "@/adventure/data/v2/v2JobCatalog";
import { staminaConfigForCharacter } from "@/adventure/v2/stamina";
import {
  FARM_SAVE_KEY,
  farmingLevelForState,
  farmingLevelXpThreshold,
  parseFarmState,
} from "@/adventure/v2/farm";
import {
  COOKING_LEVEL_CAP,
  COOKING_SAVE_KEY,
  cookingLevelForXp,
  cookingLevelXpThreshold,
  parseCookingState,
} from "@/adventure/v2/cooking";
import {
  FISHING_LEVEL_CAP,
  FISHING_PROGRESS_KEY,
  fishingLevelForXp,
  fishingLevelXpThreshold,
  parseFishingProgression,
} from "@/adventure/v2/fishingProgression";
import { MINING_LOG_KEY, parseMiningLog } from "@/adventure/v2/miningSession";
import {
  MINING_LEVEL_CAP,
  miningLevelForXp,
  miningXpForLevel,
} from "@/adventure/v2/miningProgression";
import {
  WOODCUTTING_LOG_KEY,
  parseWoodcuttingLog,
} from "@/adventure/v2/woodcuttingSession";
import {
  WOODCUTTING_LEVEL_CAP,
  woodcuttingLevelForXp,
  woodcuttingXpForLevel,
} from "@/adventure/v2/woodcuttingProgression";
import { MAX_LEVEL } from "@/lib/leveling";

export const REVIEW_ADMIN_LIFE_SAVE_KEYS = {
  farm: FARM_SAVE_KEY,
  woodcutting: WOODCUTTING_LOG_KEY,
  mining: MINING_LOG_KEY,
  fishing: FISHING_PROGRESS_KEY,
  cooking: COOKING_SAVE_KEY,
} as const;

export const REVIEW_ADMIN_OP_TARGETS = {
  level: MAX_LEVEL,
  stat: 6_000,
  capGain: 6_000,
  proficiencyPoints: 1_000_000,
  mastery: 1_000_000,
  groupTier: 5,
  reincarnations: 100,
  gold: 1_000_000_000,
  fame: 1_000_000,
  charges: 100_000,
} as const;

export type ReviewAdminOpCharacter = Record<string, unknown> & {
  level: number;
  exp: number;
  gold: number;
  bankedGold: number;
  fame: number;
  frontierDepth: number;
  stamina: { current: number; lastUpdatedAt: number };
};

export type ReviewAdminOpInventory = Record<string, unknown> & {
  hpCharges: number;
  mpCharges: number;
};

export type ReviewAdminOpPresetResult = {
  character: ReviewAdminOpCharacter;
  proficiency: V2ProficiencyState;
  inventory: ReviewAdminOpInventory;
  groupId: string;
  jobId: string;
};

export function buildReviewAdminLifePreset(input: {
  farmRaw: unknown;
  woodcuttingRaw: unknown;
  miningRaw: unknown;
  fishingRaw: unknown;
  cookingRaw: unknown;
  nowMs: number;
}) {
  const farmParsed = parseFarmState(input.farmRaw, input.nowMs);
  const farm = {
    ...farmParsed,
    stats: {
      ...farmParsed.stats,
      farmingXp: Math.max(
        farmParsed.stats.farmingXp,
        farmingLevelXpThreshold(50),
      ),
    },
  };
  const woodcuttingParsed = parseWoodcuttingLog(input.woodcuttingRaw);
  const woodcutting = {
    ...woodcuttingParsed,
    xp: Math.max(
      woodcuttingParsed.xp,
      woodcuttingXpForLevel(WOODCUTTING_LEVEL_CAP),
    ),
  };
  const miningParsed = parseMiningLog(input.miningRaw);
  const mining = {
    ...miningParsed,
    xp: Math.max(
      miningParsed.xp,
      miningXpForLevel(MINING_LEVEL_CAP),
    ),
  };
  const fishingParsed = parseFishingProgression(input.fishingRaw);
  const fishing = {
    ...fishingParsed,
    xp: Math.max(
      fishingParsed.xp,
      fishingLevelXpThreshold(FISHING_LEVEL_CAP),
    ),
  };
  const cookingParsed = parseCookingState(input.cookingRaw, input.nowMs);
  const cooking = {
    ...cookingParsed,
    xp: Math.max(
      cookingParsed.xp,
      cookingLevelXpThreshold(COOKING_LEVEL_CAP),
    ),
  };

  return {
    farm,
    woodcutting,
    mining,
    fishing,
    cooking,
    levels: {
      farming: Math.min(50, farmingLevelForState(farm)),
      woodcutting: woodcuttingLevelForXp(woodcutting.xp),
      mining: miningLevelForXp(mining.xp),
      fishing: fishingLevelForXp(fishing.xp),
      cooking: cookingLevelForXp(cooking.xp),
    },
  };
}

function nonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

export function buildReviewAdminOpPreset(input: {
  characterRaw: Record<string, unknown>;
  proficiencyRaw: unknown;
  inventoryRaw: Record<string, unknown>;
  nowMs: number;
}): ReviewAdminOpPresetResult | null {
  const { characterRaw, proficiencyRaw, inventoryRaw, nowMs } = input;
  const playerClass = parseV2Class(characterRaw.class);
  const groupId = tier1ClassOf(playerClass);
  const jobId = jobIdFromLegacy(
    playerClass,
    typeof characterRaw.specChoice === "string"
      ? characterRaw.specChoice
      : null,
  );
  if (groupId === "none" || jobId === "none") return null;

  const previousLevel = nonNegativeInt(characterRaw.level);
  const staminaMax = staminaConfigForCharacter(characterRaw, nowMs).max;
  const previousStaminaCurrent = nonNegativeInt(
    characterRaw.stamina && typeof characterRaw.stamina === "object"
      ? (characterRaw.stamina as { current?: unknown }).current
      : 0,
  );
  const character: ReviewAdminOpCharacter = {
    ...characterRaw,
    level: Math.max(previousLevel, REVIEW_ADMIN_OP_TARGETS.level),
    exp:
      previousLevel < REVIEW_ADMIN_OP_TARGETS.level
        ? 0
        : nonNegativeInt(characterRaw.exp),
    gold: Math.max(
      nonNegativeInt(characterRaw.gold),
      REVIEW_ADMIN_OP_TARGETS.gold,
    ),
    bankedGold: Math.max(
      nonNegativeInt(characterRaw.bankedGold),
      REVIEW_ADMIN_OP_TARGETS.gold,
    ),
    fame: Math.max(
      nonNegativeInt(characterRaw.fame),
      REVIEW_ADMIN_OP_TARGETS.fame,
    ),
    frontierDepth: Math.max(
      nonNegativeInt(characterRaw.frontierDepth),
      MAX_FRONTIER_DEPTH,
    ),
    stamina: {
      current: Math.max(previousStaminaCurrent, staminaMax),
      lastUpdatedAt: nowMs,
    },
  };

  const parsed = parseProficiencyForChar(proficiencyRaw, characterRaw);
  const caps = { ...parsed.caps };
  const grown = { ...parsed.grown };
  for (const stat of V2_STAT_KEYS) {
    caps[stat] = Math.max(
      nonNegativeInt(caps[stat]),
      REVIEW_ADMIN_OP_TARGETS.capGain,
    );
    grown[stat] = Math.max(
      nonNegativeInt(grown[stat]),
      REVIEW_ADMIN_OP_TARGETS.stat,
    );
  }

  const currentGroup: V2ProficiencyGroup = parsed.groups[groupId] ?? {
    cultivations: 0,
    tier: 1,
    cumLevel: 0,
  };
  const proficiency: V2ProficiencyState = {
    ...parsed,
    points: Math.max(
      parsed.points,
      REVIEW_ADMIN_OP_TARGETS.proficiencyPoints,
    ),
    groups: {
      ...parsed.groups,
      [groupId]: {
        ...currentGroup,
        tier: Math.max(currentGroup.tier, REVIEW_ADMIN_OP_TARGETS.groupTier),
        cumLevel: Math.max(
          currentGroup.cumLevel,
          REVIEW_ADMIN_OP_TARGETS.mastery,
        ),
      },
    },
    caps,
    grown,
    jobCumLevel: {
      ...(parsed.jobCumLevel ?? {}),
      [jobId]: Math.max(
        parsed.jobCumLevel?.[jobId] ?? 0,
        REVIEW_ADMIN_OP_TARGETS.mastery,
      ),
    },
    reincarnations: Math.max(
      parsed.reincarnations ?? 0,
      REVIEW_ADMIN_OP_TARGETS.reincarnations,
    ),
  };

  const inventory: ReviewAdminOpInventory = {
    ...inventoryRaw,
    hpCharges: Math.max(
      nonNegativeInt(inventoryRaw.hpCharges),
      REVIEW_ADMIN_OP_TARGETS.charges,
    ),
    mpCharges: Math.max(
      nonNegativeInt(inventoryRaw.mpCharges),
      REVIEW_ADMIN_OP_TARGETS.charges,
    ),
  };

  return { character, proficiency, inventory, groupId, jobId };
}
