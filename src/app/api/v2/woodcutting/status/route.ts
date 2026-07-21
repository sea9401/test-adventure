import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave } from "@/lib/server/savesKv";
import {
  parseAutoGatheringState,
  WOODCUTTING_AUTO_KEY,
} from "@/adventure/v2/autoGathering";
import { SETTLEMENT_MATERIAL_ID } from "@/adventure/data/v2/settlementMaterials";
import {
  WOODCUTTING_LOG_KEY,
  parseWoodcuttingLog,
  woodcuttingMaterialBalances,
} from "@/adventure/v2/woodcuttingSession";
import {
  equippedWoodcuttingBonuses,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [charSave, logRaw, skillsRaw, autoRaw] = await Promise.all([
    readSave<{ materials?: Record<string, unknown> }>(db, userId, "character.v2", {}),
    readSave(db, userId, WOODCUTTING_LOG_KEY, {}),
    readSave(db, userId, "skills.v2", {}),
    readSave(db, userId, WOODCUTTING_AUTO_KEY, {}),
  ]);
  const materials = woodcuttingMaterialBalances(charSave.materials);
  const bonuses = equippedWoodcuttingBonuses(
    parseV2SkillsState(skillsRaw).equipped,
  );

  return Response.json({
    ok: true,
    materials,
    timber: materials[SETTLEMENT_MATERIAL_ID.timber],
    log: parseWoodcuttingLog(logRaw),
    durationReductionPct: bonuses.durationReductionPct,
    autoSession: parseAutoGatheringState(autoRaw).session,
  });
}
