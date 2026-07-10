import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { SETTLEMENT_MATERIAL_ID } from "@/adventure/data/v2/settlementMaterials";
import {
  WOODCUTTING_LOG_KEY,
  WOODCUTTING_SESSION_KEY,
  parseWoodcuttingLog,
  pickWoodcuttingTreeId,
  rollChopReadyDelayMs,
  woodcuttingExpiresAtFor,
  type WoodcuttingSession,
} from "@/adventure/v2/woodcuttingSession";

export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const readyDelayMs = rollChopReadyDelayMs(Math.random);
  const readyAt = now + readyDelayMs;
  const session: WoodcuttingSession = {
    sessionId: randomUUID(),
    readyAt,
    expiresAt: woodcuttingExpiresAtFor(readyAt),
    treeId: pickWoodcuttingTreeId(Math.random),
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
    readyDelayMs,
    timber,
    log: parseWoodcuttingLog(logRaw),
  });
}
