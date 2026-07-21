import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave } from "@/lib/server/savesKv";
import {
  MINING_AUTO_KEY,
  parseAutoGatheringState,
  WOODCUTTING_AUTO_KEY,
} from "@/adventure/v2/autoGathering";
import { activeAutoGatheringActivity } from "@/lib/server/lifeActivityLock";
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

  const [charSave, logRaw, skillsRaw, autoRaw, miningAutoRaw] = await Promise.all([
    readSave<{ materials?: Record<string, unknown> }>(db, userId, "character.v2", {}),
    readSave(db, userId, WOODCUTTING_LOG_KEY, {}),
    readSave(db, userId, "skills.v2", {}),
    readSave(db, userId, WOODCUTTING_AUTO_KEY, {}),
    readSave(db, userId, MINING_AUTO_KEY, {}),
  ]);
  const materials = woodcuttingMaterialBalances(charSave.materials);
  const bonuses = equippedWoodcuttingBonuses(
    parseV2SkillsState(skillsRaw).equipped,
  );

  const autoState = parseAutoGatheringState(autoRaw);
  return Response.json({
    ok: true,
    materials,
    timber: materials[SETTLEMENT_MATERIAL_ID.timber],
    log: parseWoodcuttingLog(logRaw),
    durationReductionPct: bonuses.durationReductionPct,
    autoSession: autoState.session,
    activeAutoActivity: activeAutoGatheringActivity({
      woodcutting: autoState,
      mining: parseAutoGatheringState(miningAutoRaw),
    }),
  });
}
