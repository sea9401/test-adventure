import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave } from "@/lib/server/savesKv";
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
  const [charSave, logRaw, skillsRaw] = await Promise.all([
    readSave<{ materials?: Record<string, unknown> }>(
      db,
      userId,
      "character.v2",
      {},
    ),
    readSave(db, userId, MINING_LOG_KEY, {}),
    readSave(db, userId, "skills.v2", {}),
  ]);
  const bonuses = equippedMiningBonuses(parseV2SkillsState(skillsRaw).equipped);
  return Response.json({
    ok: true,
    materials: miningMaterialBalances(charSave.materials),
    log: parseMiningLog(logRaw),
    durationReductionPct: bonuses.durationReductionPct,
  });
}
