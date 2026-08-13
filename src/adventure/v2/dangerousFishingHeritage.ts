import type { V2ProficiencyState } from "@/adventure/data/v2/proficiency";
import {
  DANGEROUS_LINES,
  DANGEROUS_REELS,
  DANGEROUS_RODS,
  type DangerousLine,
  type DangerousLineId,
  type DangerousReel,
  type DangerousReelId,
  type DangerousRod,
  type DangerousRodId,
} from "@/adventure/data/v2/dangerousFishing";
import {
  V2_FISHING_JOB_IDS,
  highestVisitedFishingJobId,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  fishingLevelForXp,
  type FishingProgressionState,
} from "./fishingProgression";

export const DANGEROUS_FISHING_UNLOCK_LEVEL = 15;
export const DANGEROUS_FISHING_ASSIST_CAP_PCT = 10;
export const DANGEROUS_TARGET_READING_CAP_PCT = 10;
export const DANGEROUS_CARGO_PROTECTION_CAP_PCT = 15;
export const DANGEROUS_TRACE_BONUS_CAP_PCT = 20;
export const DANGEROUS_SIZE_BONUS_CAP_PCT = 5;

export type DangerousFishingLineage = {
  telegraphSteps: number;
  targetReadingPct: number;
  staminaBonusPct: number;
  cargoProtectionPct: number;
  deepTraceBonusPct: number;
};

export type DangerousFishingPassiveBonuses = {
  traceBonusPct: number;
  targetReadingPct: number;
  staminaBonusPct: number;
  cargoProtectionPct: number;
  sizeBonusPct: number;
  deepTraceBonusPct: number;
};

export type DangerousFishingHeritage = {
  unlocked: boolean;
  fishingLevel: number;
  levelAssistPct: number;
  highestFishingJobId: string | null;
  lineage: DangerousFishingLineage;
  passives: DangerousFishingPassiveBonuses;
};

const EMPTY_LINEAGE: DangerousFishingLineage = {
  telegraphSteps: 0,
  targetReadingPct: 0,
  staminaBonusPct: 0,
  cargoProtectionPct: 0,
  deepTraceBonusPct: 0,
};

function lineageFor(highestJobId: string | null): DangerousFishingLineage {
  const highestIndex = highestJobId
    ? V2_FISHING_JOB_IDS.indexOf(
        highestJobId as (typeof V2_FISHING_JOB_IDS)[number],
      )
    : -1;
  if (highestIndex < 0) return { ...EMPTY_LINEAGE };
  return {
    telegraphSteps: highestIndex >= 0 ? 1 : 0,
    targetReadingPct: highestIndex >= 1 ? 5 : 0,
    staminaBonusPct: highestIndex >= 2 ? 6 : 0,
    cargoProtectionPct: highestIndex >= 3 ? 10 : 0,
    deepTraceBonusPct: highestIndex >= 4 ? 10 : 0,
  };
}

function passiveBonuses(
  equippedSkillIds: readonly string[],
): DangerousFishingPassiveBonuses {
  const equipped = new Set(equippedSkillIds);
  return {
    traceBonusPct: equipped.has("v2c_camper_tidereading") ? 5 : 0,
    targetReadingPct: equipped.has("v2c_angler_pointreading") ? 4 : 0,
    staminaBonusPct: equipped.has("v2c_masterangler_bigcatchsense") ? 4 : 0,
    cargoProtectionPct: equipped.has("v2c_fullcatchking_bountyhaul") ? 5 : 0,
    sizeBonusPct: equipped.has("v2c_fullcatchking_bountyhaul") ? 2 : 0,
    deepTraceBonusPct: equipped.has("v2c_seagod_deepcurrent") ? 8 : 0,
  };
}

export function dangerousFishingHeritage(args: {
  fishingProgression: FishingProgressionState;
  proficiency: V2ProficiencyState;
  currentJobId?: string | null;
  equippedSkillIds: readonly string[];
}): DangerousFishingHeritage {
  const fishingLevel = fishingLevelForXp(args.fishingProgression.xp);
  const unlocked = fishingLevel >= DANGEROUS_FISHING_UNLOCK_LEVEL;
  const levelAssistPct = unlocked
    ? Math.min(
        DANGEROUS_FISHING_ASSIST_CAP_PCT,
        Math.floor(
          ((fishingLevel - DANGEROUS_FISHING_UNLOCK_LEVEL) *
            DANGEROUS_FISHING_ASSIST_CAP_PCT) /
            (50 - DANGEROUS_FISHING_UNLOCK_LEVEL),
        ),
      )
    : 0;
  const highestFishingJobId = highestVisitedFishingJobId(
    args.proficiency,
    args.currentJobId,
  );
  return {
    unlocked,
    fishingLevel,
    levelAssistPct,
    highestFishingJobId,
    lineage: lineageFor(highestFishingJobId),
    passives: passiveBonuses(args.equippedSkillIds),
  };
}

export type DangerousFishingEncounterModifiers = {
  rod: DangerousRod;
  reel: DangerousReel;
  line: DangerousLine;
  assistance: {
    maxTensionBonus: number;
    reelPowerBonus: number;
    staminaDamageBonus: number;
    tensionControlBonus: number;
    slackTolerance: number;
  };
  telegraphSteps: number;
  targetReadingPct: number;
  staminaBonusPct: number;
  cargoProtectionPct: number;
  traceBonusPct: number;
  sizeBonusPct: number;
};

function cap(value: number, max: number): number {
  return Math.min(max, Math.max(0, value));
}

export function dangerousFishingEncounterModifiers(
  heritage: DangerousFishingHeritage,
  loadout: {
    rodId: DangerousRodId;
    reelId: DangerousReelId;
    lineId: DangerousLineId;
  },
): DangerousFishingEncounterModifiers {
  const targetReadingPct = cap(
    heritage.lineage.targetReadingPct + heritage.passives.targetReadingPct,
    DANGEROUS_TARGET_READING_CAP_PCT,
  );
  const staminaBonusPct = cap(
    heritage.lineage.staminaBonusPct + heritage.passives.staminaBonusPct,
    12,
  );
  const cargoProtectionPct = cap(
    heritage.lineage.cargoProtectionPct +
      heritage.passives.cargoProtectionPct,
    DANGEROUS_CARGO_PROTECTION_CAP_PCT,
  );
  const traceBonusPct = cap(
    heritage.lineage.deepTraceBonusPct +
      heritage.passives.deepTraceBonusPct +
      heritage.passives.traceBonusPct,
    DANGEROUS_TRACE_BONUS_CAP_PCT,
  );
  const sizeBonusPct = cap(
    heritage.passives.sizeBonusPct,
    DANGEROUS_SIZE_BONUS_CAP_PCT,
  );
  return {
    rod: DANGEROUS_RODS[loadout.rodId],
    reel: DANGEROUS_REELS[loadout.reelId],
    line: DANGEROUS_LINES[loadout.lineId],
    assistance: {
      maxTensionBonus: Math.floor(heritage.levelAssistPct / 2),
      reelPowerBonus: Math.floor(heritage.levelAssistPct / 4),
      staminaDamageBonus: Math.floor(
        (heritage.levelAssistPct + staminaBonusPct) / 4,
      ),
      tensionControlBonus: Math.floor(heritage.levelAssistPct / 3),
      slackTolerance: 0,
    },
    telegraphSteps: heritage.lineage.telegraphSteps,
    targetReadingPct,
    staminaBonusPct,
    cargoProtectionPct,
    traceBonusPct,
    sizeBonusPct,
  };
}
