import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { SETTLEMENT_MATERIAL_ID } from "@/adventure/data/v2/settlementMaterials";
import {
  WOODCUTTING_LOG_KEY,
  WOODCUTTING_SESSION_KEY,
  WOODCUTTING_TREES,
  createWoodcuttingRound,
  parseWoodcuttingLog,
  pickWoodcuttingTreeId,
  woodcuttingRoundView,
  type WoodcuttingSession,
} from "@/adventure/v2/woodcuttingSession";

export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const treeId = pickWoodcuttingTreeId(Math.random);
  const session: WoodcuttingSession = {
    sessionId: randomUUID(),
    treeId,
    round: createWoodcuttingRound({ index: 1, now, rng: Math.random }),
    hits: [],
    combo: 0,
    bestCombo: 0,
  };

  await db.transaction(async (tx) => {
    await lockSaveForUpdate(tx, userId, WOODCUTTING_SESSION_KEY, {});
    await upsertSave(tx, userId, WOODCUTTING_SESSION_KEY, session);
  });

  const [charSave, logRaw] = await Promise.all([
    readSave<{ materials?: Record<string, unknown> }>(db, userId, "character.v2", {}),
    readSave(db, userId, WOODCUTTING_LOG_KEY, {}),
  ]);
  const timber = Math.max(
    0,
    Math.floor(Number(charSave.materials?.[SETTLEMENT_MATERIAL_ID.timber]) || 0),
  );

  return Response.json({
    ok: true,
    sessionId: session.sessionId,
    tree: WOODCUTTING_TREES[treeId],
    round: woodcuttingRoundView(session.round, now),
    timber,
    log: parseWoodcuttingLog(logRaw),
  });
}
