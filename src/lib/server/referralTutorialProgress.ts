import "server-only";

import { eq } from "drizzle-orm";
import {
  normalizeReferralProgressTaskIds,
  referralHuntTaskIds,
  referralLifeTaskIds,
  type ReferralTutorialProgressTaskId,
} from "@/adventure/data/v2/referralTutorial";
import {
  FARM_SAVE_KEY,
  farmingLevelForState,
  parseFarmState,
} from "@/adventure/v2/farm";
import {
  FISHING_PROGRESS_KEY,
  fishingLevelForXp,
  parseFishingProgression,
} from "@/adventure/v2/fishingProgression";
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
  COOKING_SAVE_KEY,
  cookingLevelForXp,
  parseCookingState,
} from "@/adventure/v2/cooking/state";
import { guildMembers } from "@/db/schema";
import { readSave, type DbExecutor } from "@/lib/server/savesKv";

type SnapshotRaw = {
  characterRaw: unknown;
  hasGuild: boolean;
  farmRaw: unknown;
  fishingRaw: unknown;
  woodcuttingRaw: unknown;
  miningRaw: unknown;
  cookingRaw: unknown;
};

export type ReferralTutorialSnapshot = {
  frontierDepth: number;
  hasGuild: boolean;
  maxLifeLevel: number;
  taskIds: ReferralTutorialProgressTaskId[];
};

export function deriveReferralTutorialSnapshot(
  raw: SnapshotRaw,
): ReferralTutorialSnapshot {
  const character = raw.characterRaw && typeof raw.characterRaw === "object"
    ? raw.characterRaw as Record<string, unknown>
    : {};
  const frontierDepth = nonNegativeInt(character.frontierDepth);
  const farm = parseFarmState(raw.farmRaw);
  const fishing = parseFishingProgression(raw.fishingRaw);
  const woodcutting = parseWoodcuttingLog(raw.woodcuttingRaw);
  const mining = parseMiningLog(raw.miningRaw);
  const cooking = parseCookingState(raw.cookingRaw);
  const maxLifeLevel = Math.max(
    farmingLevelForState(farm),
    fishingLevelForXp(fishing.xp),
    woodcuttingProgressionView(woodcutting.cuts, woodcutting.xp).level,
    miningProgressionView(mining.successes, mining.xp).level,
    cookingLevelForXp(cooking.xp),
  );
  const taskIds = normalizeReferralProgressTaskIds([
    ...referralHuntTaskIds(frontierDepth),
    ...(raw.hasGuild ? ["join_guild" as const] : []),
    ...referralLifeTaskIds(maxLifeLevel),
  ]);

  return { frontierDepth, hasGuild: raw.hasGuild, maxLifeLevel, taskIds };
}

export async function loadReferralTutorialSnapshot(
  executor: DbExecutor,
  userId: string,
): Promise<ReferralTutorialSnapshot> {
  const characterRaw = await readSave(executor, userId, "character.v2", {});
  const farmRaw = await readSave(executor, userId, FARM_SAVE_KEY, {});
  const fishingRaw = await readSave(
    executor,
    userId,
    FISHING_PROGRESS_KEY,
    {},
  );
  const woodcuttingRaw = await readSave(
    executor,
    userId,
    WOODCUTTING_LOG_KEY,
    {},
  );
  const miningRaw = await readSave(executor, userId, MINING_LOG_KEY, {});
  const cookingRaw = await readSave(executor, userId, COOKING_SAVE_KEY, {});
  const membership = await executor
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);

  return deriveReferralTutorialSnapshot({
    characterRaw,
    hasGuild: membership.length > 0,
    farmRaw,
    fishingRaw,
    woodcuttingRaw,
    miningRaw,
    cookingRaw,
  });
}

function nonNegativeInt(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}
