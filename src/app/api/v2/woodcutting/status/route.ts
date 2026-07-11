import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave } from "@/lib/server/savesKv";
import { SETTLEMENT_MATERIAL_ID } from "@/adventure/data/v2/settlementMaterials";
import {
  WOODCUTTING_LOG_KEY,
  parseWoodcuttingLog,
  woodcuttingMaterialBalances,
} from "@/adventure/v2/woodcuttingSession";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [charSave, logRaw] = await Promise.all([
    readSave<{ materials?: Record<string, unknown> }>(db, userId, "character.v2", {}),
    readSave(db, userId, WOODCUTTING_LOG_KEY, {}),
  ]);
  const materials = woodcuttingMaterialBalances(charSave.materials);

  return Response.json({
    ok: true,
    materials,
    timber: materials[SETTLEMENT_MATERIAL_ID.timber],
    log: parseWoodcuttingLog(logRaw),
  });
}
