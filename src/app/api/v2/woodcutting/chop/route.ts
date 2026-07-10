import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import { SETTLEMENT_MATERIAL_ID } from "@/adventure/data/v2/settlementMaterials";
import {
  WOODCUTTING_LOG_KEY,
  WOODCUTTING_SESSION_KEY,
  WOODCUTTING_TREES,
  chopQualityBonus,
  judgeChop,
  parseWoodcuttingLog,
  parseWoodcuttingSession,
  recordWoodcuttingSuccess,
} from "@/adventure/v2/woodcuttingSession";

type CharSave = {
  materials?: unknown;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const b = (body ?? {}) as { sessionId?: unknown; reactionMs?: unknown };
  if (
    typeof b.sessionId !== "string" ||
    typeof b.reactionMs !== "number" ||
    !Number.isFinite(b.reactionMs)
  ) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const now = Date.now();
  const sessionId = b.sessionId;
  const reactionMs = b.reactionMs;
  const result = await db.transaction(async (tx) => {
    const session = parseWoodcuttingSession(
      await lockSaveForUpdate(tx, userId, WOODCUTTING_SESSION_KEY, {}),
    );
    if (!session) return { success: false as const, reason: "no_session" as const };
    if (session.sessionId !== sessionId) {
      return { success: false as const, reason: "stale" as const };
    }

    await upsertSave(tx, userId, WOODCUTTING_SESSION_KEY, {});
    const judgment = judgeChop({
      reactionMs,
      serverNow: now,
      readyAt: session.readyAt,
      expiresAt: session.expiresAt,
    });
    if (!judgment.success) {
      return { success: false as const, reason: judgment.reason };
    }

    const tree = WOODCUTTING_TREES[session.treeId];
    const quality = chopQualityBonus(reactionMs);
    const timberGained = tree.baseTimber + quality.bonus;
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materials = mergeDrops(charSave.materials, {
      [SETTLEMENT_MATERIAL_ID.timber]: timberGained,
    });
    await upsertSave(tx, userId, "character.v2", { ...charSave, materials });

    const log = recordWoodcuttingSuccess(
      parseWoodcuttingLog(
        await lockSaveForUpdate(tx, userId, WOODCUTTING_LOG_KEY, {}),
      ),
      { treeId: session.treeId, timber: timberGained, reactionMs, grade: quality.grade },
    );
    await upsertSave(tx, userId, WOODCUTTING_LOG_KEY, log);

    return {
      success: true as const,
      tree,
      grade: quality.grade,
      timberGained,
      timber: materials[SETTLEMENT_MATERIAL_ID.timber] ?? timberGained,
      log,
    };
  });

  if (!result.success) {
    return Response.json({ ok: true, success: false, reason: result.reason });
  }

  return Response.json({
    ok: true,
    success: true,
    tree: result.tree,
    grade: result.grade,
    timberGained: result.timberGained,
    timber: result.timber,
    log: result.log,
  });
}
