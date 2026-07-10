import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import { SETTLEMENT_MATERIAL_ID } from "@/adventure/data/v2/settlementMaterials";
import {
  WOODCUTTING_LOG_KEY,
  WOODCUTTING_SESSION_KEY,
  WOODCUTTING_ROUNDS,
  WOODCUTTING_TREES,
  applyWoodcuttingHit,
  bestWoodcuttingReactionMs,
  createWoodcuttingRound,
  isWoodcuttingSpot,
  parseWoodcuttingLog,
  parseWoodcuttingSession,
  recordWoodcuttingSuccess,
  woodcuttingRoundView,
  woodcuttingTimberReward,
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
  const b = (body ?? {}) as {
    sessionId?: unknown;
    spot?: unknown;
    reactionMs?: unknown;
  };
  if (
    typeof b.sessionId !== "string" ||
    typeof b.spot !== "string" ||
    !isWoodcuttingSpot(b.spot) ||
    typeof b.reactionMs !== "number" ||
    !Number.isFinite(b.reactionMs)
  ) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const now = Date.now();
  const sessionId = b.sessionId;
  const spot = b.spot;
  const reactionMs = b.reactionMs;
  const result = await db.transaction(async (tx) => {
    const session = parseWoodcuttingSession(
      await lockSaveForUpdate(tx, userId, WOODCUTTING_SESSION_KEY, {}),
    );
    if (!session) return { complete: true as const, success: false as const, reason: "no_session" as const };
    if (session.sessionId !== sessionId) {
      return { complete: true as const, success: false as const, reason: "stale" as const };
    }

    const applied = applyWoodcuttingHit(session, {
      spot,
      reactionMs,
      serverNow: now,
    });

    if (!applied.complete) {
      const nextSession = {
        ...applied.session,
        round: createWoodcuttingRound({
          index: applied.session.hits.length + 1,
          now,
          rng: Math.random,
        }),
      };
      await upsertSave(tx, userId, WOODCUTTING_SESSION_KEY, nextSession);
      return {
        complete: false as const,
        hit: applied.hit,
        combo: nextSession.combo,
        bestCombo: nextSession.bestCombo,
        round: woodcuttingRoundView(nextSession.round, now),
      };
    }

    await upsertSave(tx, userId, WOODCUTTING_SESSION_KEY, {});
    const tree = WOODCUTTING_TREES[session.treeId];
    const reward = woodcuttingTimberReward(
      tree,
      applied.session.hits,
      applied.session.bestCombo,
    );
    const logRaw = await lockSaveForUpdate(tx, userId, WOODCUTTING_LOG_KEY, {});

    if (reward.timber <= 0 || reward.grade == null) {
      return {
        complete: true as const,
        success: false as const,
        reason: "not_felled" as const,
        tree,
        hit: applied.hit,
        hits: applied.session.hits,
        score: reward.score,
        combo: applied.session.combo,
        bestCombo: applied.session.bestCombo,
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
      bestReactionMs: bestWoodcuttingReactionMs(applied.session.hits),
      grade: reward.grade,
      bestCombo: applied.session.bestCombo,
    });
    await upsertSave(tx, userId, WOODCUTTING_LOG_KEY, log);

    return {
      complete: true as const,
      success: true as const,
      tree,
      grade: reward.grade,
      timberGained: reward.timber,
      timber: materials[SETTLEMENT_MATERIAL_ID.timber] ?? reward.timber,
      hit: applied.hit,
      hits: applied.session.hits,
      score: reward.score,
      combo: applied.session.combo,
      bestCombo: applied.session.bestCombo,
      log,
    };
  });

  if (!result.complete) {
    return Response.json({
      ok: true,
      complete: false,
      hit: result.hit,
      combo: result.combo,
      bestCombo: result.bestCombo,
      round: result.round,
    });
  }

  if (!result.success) {
    return Response.json({
      ok: true,
      complete: true,
      success: false,
      reason: result.reason,
      tree: "tree" in result ? result.tree : null,
      hit: "hit" in result ? result.hit : null,
      hits: "hits" in result ? result.hits : [],
      score: "score" in result ? result.score : 0,
      combo: "combo" in result ? result.combo : 0,
      bestCombo: "bestCombo" in result ? result.bestCombo : 0,
      totalRounds: WOODCUTTING_ROUNDS,
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
    hit: result.hit,
    hits: result.hits,
    score: result.score,
    combo: result.combo,
    bestCombo: result.bestCombo,
    log: result.log,
  });
}
