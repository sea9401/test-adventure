import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  applyBossActionInTx,
  claimBossRewardInTx,
  drizzleDangerousFishingBossStore,
  readDangerousFishingBossView,
  startBossAttemptInTx,
} from "@/lib/server/dangerousFishingBoss";
import type { DangerousFishingAction } from "@/adventure/v2/dangerousFishingEncounter";
import {
  checkpointRealtimeBossAttemptInTx,
  finishRealtimeBossAttemptInTx,
  startRealtimeBossAttemptInTx,
} from "@/lib/server/dangerousFishingRealtimeBoss";

function statusForError(error: string): number {
  if (error === "fishing_level_locked") return 403;
  if (error === "not_found" || error === "no_attempt") return 404;
  if (error === "expired") return 410;
  if (error === "too_fast") return 429;
  if (
    error === "bad_request" ||
    error === "invalid_inputs" ||
    error === "invalid_bait"
  ) return 400;
  return 409;
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const view = await db.transaction((tx) =>
    readDangerousFishingBossView(
      drizzleDangerousFishingBossStore(tx),
      userId,
      new Date(Date.now()),
    ),
  );
  return Response.json(view);
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.eventId !== "string") {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const isStart = body.action === "start";
  const isRealtimeStart = body.action === "start_realtime";
  const isCheckpoint = body.action === "checkpoint";
  const isFinish = body.action === "finish";
  const isClaim = body.action === "claim";
  const isAction =
    body.action === "reel" || body.action === "give" || body.action === "brace";
  if (
    !isStart &&
    !isRealtimeStart &&
    !isCheckpoint &&
    !isFinish &&
    !isClaim &&
    !isAction
  ) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: isAction || isCheckpoint || isFinish
      ? "v2:dangerous-fishing:boss-action"
      : "v2:dangerous-fishing:boss",
    userLimit: isAction || isCheckpoint || isFinish ? 120 : 30,
    ipLimit: isAction || isCheckpoint || isFinish ? 720 : 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const now = new Date(Date.now());
  const result = await db.transaction(async (tx) => {
    const store = drizzleDangerousFishingBossStore(tx);
    if (isStart) {
      return startBossAttemptInTx(store, {
        userId,
        eventId: body.eventId as string,
        now,
        random: Math.random,
      });
    }
    if (isRealtimeStart) {
      return startRealtimeBossAttemptInTx(store, {
        userId,
        eventId: body.eventId as string,
        baitId: body.baitId,
        now,
        random: Math.random,
      });
    }
    if (isCheckpoint) {
      return checkpointRealtimeBossAttemptInTx(store, {
        userId,
        eventId: body.eventId,
        encounterId: body.encounterId,
        revision: body.revision,
        inputs: body.inputs,
        clientTick: body.clientTick,
        now,
      });
    }
    if (isFinish) {
      return finishRealtimeBossAttemptInTx(store, {
        userId,
        eventId: body.eventId,
        encounterId: body.encounterId,
        revision: body.revision,
        inputs: body.inputs,
        clientTick: body.clientTick,
        requestId: body.requestId,
        now,
      });
    }
    if (isClaim) {
      return claimBossRewardInTx(store, {
        userId,
        eventId: body.eventId as string,
        now,
      });
    }
    if (
      typeof body.encounterId !== "string" ||
      typeof body.revision !== "number" ||
      !Number.isInteger(body.revision)
    ) {
      return { ok: false as const, error: "bad_request" as const };
    }
    return applyBossActionInTx(store, {
      userId,
      eventId: body.eventId as string,
      encounterId: body.encounterId,
      revision: body.revision,
      action: body.action as DangerousFishingAction,
      now,
    });
  });
  return Response.json(result, {
    status: result.ok ? 200 : statusForError(result.error),
  });
}
