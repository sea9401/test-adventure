import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import { SETTLEMENT_MATERIAL_ID } from "@/adventure/data/v2/settlementMaterials";
import { incrementGuildExplorationProgressForUser } from "@/lib/server/guildExplorationWeekly";
import {
  WOODCUTTING_LOG_KEY,
  WOODCUTTING_SESSION_KEY,
  WOODCUTTING_TREES,
  parseWoodcuttingLog,
  parseWoodcuttingSession,
  recordWoodcuttingSuccess,
} from "@/adventure/v2/woodcuttingSession";

type CharSave = {
  materials?: unknown;
  [key: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const sessionId = (body as { sessionId?: unknown } | null)?.sessionId;
  if (typeof sessionId !== "string") {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const now = Date.now();
  const result = await db.transaction(async (tx) => {
    const session = parseWoodcuttingSession(
      await lockSaveForUpdate(tx, userId, WOODCUTTING_SESSION_KEY, {}),
    );
    if (!session) return { success: false as const, reason: "no_session" as const };
    if (session.sessionId !== sessionId) {
      return { success: false as const, reason: "stale" as const };
    }
    if (now < session.readyAt) {
      return {
        success: false as const,
        reason: "not_ready" as const,
        retryAfterMs: session.readyAt - now,
      };
    }
    if (now > session.expiresAt) {
      await upsertSave(tx, userId, WOODCUTTING_SESSION_KEY, {});
      return { success: false as const, reason: "expired" as const };
    }

    await upsertSave(tx, userId, WOODCUTTING_SESSION_KEY, {});
    const tree = WOODCUTTING_TREES[session.treeId];
    const timberGained = tree.baseTimber;
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

    const logRaw = await lockSaveForUpdate(tx, userId, WOODCUTTING_LOG_KEY, {});
    const log = recordWoodcuttingSuccess(parseWoodcuttingLog(logRaw), {
      treeId: session.treeId,
      timber: timberGained,
    });
    await upsertSave(tx, userId, WOODCUTTING_LOG_KEY, log);
    await incrementGuildExplorationProgressForUser(
      tx,
      userId,
      "woodcuttingSuccesses",
      1,
      new Date(now),
    );
    return {
      success: true as const,
      tree,
      timberGained,
      timber: materials[SETTLEMENT_MATERIAL_ID.timber] ?? timberGained,
      log,
    };
  });

  if (!result.success) {
    return Response.json({
      ok: true,
      success: false,
      reason: result.reason,
      retryAfterMs: "retryAfterMs" in result ? result.retryAfterMs : undefined,
    });
  }

  return Response.json({ ok: true, ...result });
}
