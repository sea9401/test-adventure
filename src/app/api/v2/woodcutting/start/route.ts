import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { SETTLEMENT_MATERIAL_ID } from "@/adventure/data/v2/settlementMaterials";
import {
  WOODCUTTING_SPOTS,
  isWoodcuttingSpotId,
} from "@/adventure/data/v2/woodcuttingSpots";
import {
  WOODCUTTING_LOG_KEY,
  WOODCUTTING_SESSION_KEY,
  WOODCUTTING_TREES,
  createWoodcuttingSession,
  parseWoodcuttingLog,
  pickWoodcuttingTreeId,
  type WoodcuttingSession,
} from "@/adventure/v2/woodcuttingSession";

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { spotId?: unknown } | null;
  if (typeof body?.spotId !== "string" || !isWoodcuttingSpotId(body.spotId)) {
    return Response.json({ ok: false, error: "bad_spot" }, { status: 400 });
  }

  const now = Date.now();
  const spotId = body.spotId;
  const treeId = pickWoodcuttingTreeId(spotId);
  const session: WoodcuttingSession = createWoodcuttingSession({
    sessionId: randomUUID(),
    spotId,
    treeId,
    now,
  });

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
    spot: WOODCUTTING_SPOTS[spotId],
    tree: WOODCUTTING_TREES[treeId],
    durationMs: WOODCUTTING_TREES[treeId].durationMs,
    chops: WOODCUTTING_TREES[treeId].chops,
    timber,
    log: parseWoodcuttingLog(logRaw),
  });
}
