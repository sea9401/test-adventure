import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import { SETTLEMENT_MATERIAL_ID } from "@/adventure/data/v2/settlementMaterials";
import {
  WOODCUTTING_LOG_KEY,
  WOODCUTTING_SESSION_KEY,
  WOODCUTTING_TREES,
  isWoodcuttingBackCut,
  isWoodcuttingLane,
  judgeWoodcuttingPlan,
  parseWoodcuttingLog,
  parseWoodcuttingSession,
  recordWoodcuttingSuccess,
  woodcuttingTimberReward,
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
  const value = (body ?? {}) as {
    sessionId?: unknown;
    selectedLane?: unknown;
    backCut?: unknown;
  };
  if (
    typeof value.sessionId !== "string" ||
    !isWoodcuttingLane(value.selectedLane) ||
    !isWoodcuttingBackCut(value.backCut)
  ) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const now = Date.now();
  const sessionId = value.sessionId;
  const selectedLane = value.selectedLane;
  const backCut = value.backCut;
  const result = await db.transaction(async (tx) => {
    const session = parseWoodcuttingSession(
      await lockSaveForUpdate(tx, userId, WOODCUTTING_SESSION_KEY, {}),
    );
    if (!session) return { success: false as const, reason: "no_session" as const };
    if (session.sessionId !== sessionId) {
      return { success: false as const, reason: "stale" as const };
    }
    if (now > session.expiresAt) {
      await upsertSave(tx, userId, WOODCUTTING_SESSION_KEY, {});
      return { success: false as const, reason: "expired" as const };
    }

    await upsertSave(tx, userId, WOODCUTTING_SESSION_KEY, {});
    const judgment = judgeWoodcuttingPlan({
      challenge: session.challenge,
      selectedLane,
      backCut,
    });
    const tree = WOODCUTTING_TREES[session.treeId];
    const reward = woodcuttingTimberReward(tree, judgment);
    const logRaw = await lockSaveForUpdate(tx, userId, WOODCUTTING_LOG_KEY, {});

    if (reward.timber <= 0 || reward.grade == null) {
      return {
        success: false as const,
        reason: judgment.reason,
        tree,
        judgment,
        log: parseWoodcuttingLog(logRaw),
      };
    }

    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materials = mergeDrops(charSave.materials, {
      [SETTLEMENT_MATERIAL_ID.timber]: reward.timber,
    });
    await upsertSave(tx, userId, "character.v2", { ...charSave, materials });

    const log = recordWoodcuttingSuccess(parseWoodcuttingLog(logRaw), {
      treeId: session.treeId,
      timber: reward.timber,
      grade: reward.grade,
    });
    await upsertSave(tx, userId, WOODCUTTING_LOG_KEY, log);

    return {
      success: true as const,
      tree,
      grade: reward.grade,
      timberGained: reward.timber,
      timber: materials[SETTLEMENT_MATERIAL_ID.timber] ?? reward.timber,
      judgment,
      log,
    };
  });

  if (!result.success) {
    return Response.json({
      ok: true,
      complete: true,
      success: false,
      reason: result.reason,
      tree: "tree" in result ? result.tree : null,
      judgment: "judgment" in result ? result.judgment : null,
      log: "log" in result ? result.log : undefined,
    });
  }

  return Response.json({
    ok: true,
    complete: true,
    success: true,
    tree: result.tree,
    grade: result.grade,
    timberGained: result.timberGained,
    timber: result.timber,
    judgment: result.judgment,
    log: result.log,
  });
}
