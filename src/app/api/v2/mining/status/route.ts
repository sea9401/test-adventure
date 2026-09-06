import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave } from "@/lib/server/savesKv";
import {
  MINING_AUTO_KEY,
  WOODCUTTING_AUTO_KEY,
  parseAutoGatheringState,
} from "@/adventure/v2/autoGathering";
import { activeAutoGatheringActivity } from "@/lib/server/lifeActivityLock";
import {
  MINING_LOG_KEY,
  miningMaterialBalances,
  parseMiningLog,
} from "@/adventure/v2/miningSession";
import {
  equippedMiningBonuses,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  LIFE_TOOL_DURATION_REDUCTION_PCT,
  LIFE_WORKSHOP_SAVE_KEY,
  parseLifeWorkshopState,
} from "@/adventure/v2/lifeWorkshop";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const [charSave, logRaw, skillsRaw, autoRaw, woodcuttingAutoRaw, workshopRaw] =
    await Promise.all([
    readSave<{ materials?: Record<string, unknown> }>(
      db,
      userId,
      "character.v2",
      {},
    ),
    readSave(db, userId, MINING_LOG_KEY, {}),
    readSave(db, userId, "skills.v2", {}),
    readSave(db, userId, MINING_AUTO_KEY, {}),
    readSave(db, userId, WOODCUTTING_AUTO_KEY, {}),
    readSave(db, userId, LIFE_WORKSHOP_SAVE_KEY, {}),
  ]);
  const bonuses = equippedMiningBonuses(parseV2SkillsState(skillsRaw).equipped);
  const toolTier = parseLifeWorkshopState(workshopRaw).tools.mining;
  const autoState = parseAutoGatheringState(autoRaw);
  return Response.json({
    ok: true,
    serverNow: Date.now(),
    materials: miningMaterialBalances(charSave.materials),
    log: parseMiningLog(logRaw),
    failureReductionPct: bonuses.failureReductionPct,
    durationReductionPct:
      bonuses.durationReductionPct + LIFE_TOOL_DURATION_REDUCTION_PCT[toolTier],
    autoSession: autoState.session,
    activeAutoActivity: activeAutoGatheringActivity({
      woodcutting: parseAutoGatheringState(woodcuttingAutoRaw),
      mining: autoState,
    }),
  });
}
