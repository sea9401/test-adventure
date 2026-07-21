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

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const [charSave, logRaw, skillsRaw, autoRaw, woodcuttingAutoRaw] =
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
  ]);
  const bonuses = equippedMiningBonuses(parseV2SkillsState(skillsRaw).equipped);
  const autoState = parseAutoGatheringState(autoRaw);
  return Response.json({
    ok: true,
    materials: miningMaterialBalances(charSave.materials),
    log: parseMiningLog(logRaw),
    durationReductionPct: bonuses.durationReductionPct,
    autoSession: autoState.session,
    activeAutoActivity: activeAutoGatheringActivity({
      woodcutting: parseAutoGatheringState(woodcuttingAutoRaw),
      mining: autoState,
    }),
  });
}
