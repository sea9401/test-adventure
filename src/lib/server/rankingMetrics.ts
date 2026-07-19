import { FISH_IDS } from "@/adventure/data/v2/fish";
import { equipmentCodexSummary } from "@/adventure/data/v2/equipmentCodex";
import { parseV2Class } from "@/adventure/data/v2/classes";
import { buildJobCodex } from "@/adventure/data/v2/v2JobCodex";
import { parseProficiencyForChar } from "@/adventure/data/v2/proficiency";
import {
  discoveredFishIds,
  parseFishCodex,
} from "@/adventure/v2/fishingCodex";
import {
  farmingLevelForState,
  parseFarmState,
} from "@/adventure/v2/farm";
import {
  fishingLevelForXp,
  parseFishingProgression,
} from "@/adventure/v2/fishingProgression";
import {
  MINING_LEVEL_CAP,
  miningProgressionView,
} from "@/adventure/v2/miningProgression";
import { parseMiningLog } from "@/adventure/v2/miningSession";
import {
  WOODCUTTING_LEVEL_CAP,
  woodcuttingProgressionView,
} from "@/adventure/v2/woodcuttingProgression";
import { parseWoodcuttingLog } from "@/adventure/v2/woodcuttingSession";
import { jobUnlockContextFromSaves } from "@/lib/server/jobUnlockContext";
import { parseClaimed } from "@/lib/server/v2QuestContext";

const FARMING_RANKING_LEVEL_CAP = 50;

export type LifeMasteryRanking = {
  totalLevel: number;
  totalXp: number;
  farmingLevel: number;
  woodcuttingLevel: number;
  miningLevel: number;
  fishingLevel: number;
};

export function lifeMasteryRankingFromSaves(input: {
  farmRaw?: unknown;
  woodcuttingRaw?: unknown;
  miningRaw?: unknown;
  fishingRaw?: unknown;
}): LifeMasteryRanking {
  const farm = parseFarmState(input.farmRaw);
  const woodcutting = parseWoodcuttingLog(input.woodcuttingRaw);
  const mining = parseMiningLog(input.miningRaw);
  const fishing = parseFishingProgression(input.fishingRaw);
  const farmingLevel = Math.min(
    FARMING_RANKING_LEVEL_CAP,
    farmingLevelForState(farm),
  );
  const woodcuttingLevel = Math.min(
    WOODCUTTING_LEVEL_CAP,
    woodcuttingProgressionView(woodcutting.cuts, woodcutting.xp).level,
  );
  const miningLevel = Math.min(
    MINING_LEVEL_CAP,
    miningProgressionView(mining.successes, mining.xp).level,
  );
  const fishingLevel = fishingLevelForXp(fishing.xp);
  return {
    totalLevel:
      farmingLevel + woodcuttingLevel + miningLevel + fishingLevel,
    totalXp:
      farm.stats.farmingXp + woodcutting.xp + mining.xp + fishing.xp,
    farmingLevel,
    woodcuttingLevel,
    miningLevel,
    fishingLevel,
  };
}

export type CodexCompletionRanking = {
  collected: number;
  total: number;
  jobUnlocked: number;
  equipmentRegistered: number;
  fishDiscovered: number;
};

export function codexCompletionRankingFromSaves(input: {
  characterRaw?: unknown;
  proficiencyRaw?: unknown;
  farmRaw?: unknown;
  woodcuttingRaw?: unknown;
  questsRaw?: unknown;
  equipmentCodexRaw?: unknown;
  fishingCodexRaw?: unknown;
}): CodexCompletionRanking {
  const character =
    input.characterRaw && typeof input.characterRaw === "object"
      ? (input.characterRaw as Record<string, unknown>)
      : {};
  const cls = parseV2Class(character.class);
  const specChoice =
    typeof character.specChoice === "string" ? character.specChoice : null;
  const proficiency = parseProficiencyForChar(
    input.proficiencyRaw,
    character,
  );
  const jobCodex = buildJobCodex(
    proficiency,
    [],
    cls,
    specChoice,
    jobUnlockContextFromSaves({
      farmRaw: input.farmRaw,
      woodcuttingRaw: input.woodcuttingRaw,
      completedQuestIds: parseClaimed(input.questsRaw),
    }),
  );
  const equipment = equipmentCodexSummary(input.equipmentCodexRaw);
  const jobUnlocked = jobCodex.jobs.filter((job) => job.unlocked).length;
  const fishDiscovered = discoveredFishIds(
    parseFishCodex(input.fishingCodexRaw),
  ).length;
  const collected =
    jobUnlocked + equipment.registeredCount + fishDiscovered;
  const total = jobCodex.totalJobs + equipment.total + FISH_IDS.length;
  return {
    collected,
    total,
    jobUnlocked,
    equipmentRegistered: equipment.registeredCount,
    fishDiscovered,
  };
}
