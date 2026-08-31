import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { readSave } from "@/lib/server/savesKv";
import {
  ACTIVITY_GUARD_KEY,
  parseActivityGuardState,
} from "@/lib/server/activityGuard";
import { activityVerificationGateResponse } from "@/lib/server/activityGuardServer";
import {
  actOnEncounterInTx,
  startEncounterInTx,
  withDangerousFishingTransaction,
} from "@/lib/server/dangerousFishingService";
import type { DangerousFishingAction } from "@/adventure/v2/dangerousFishingEncounter";
import {
  checkpointRealtimeEncounterInTx,
  finishRealtimeEncounterInTx,
  startRealtimeEncounterInTx,
} from "@/lib/server/dangerousFishingRealtimeService";

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const verificationRequired = activityVerificationGateResponse(
    parseActivityGuardState(
      await readSave(db, userId, ACTIVITY_GUARD_KEY, {}),
    ),
    "fishing",
  );
  if (verificationRequired) return verificationRequired;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const isStart = body.action === "start";
  const isRealtimeStart = body.action === "start_realtime";
  const isCheckpoint = body.action === "checkpoint";
  const isFinish = body.action === "finish";
  const isAction = body.action === "reel" || body.action === "give" || body.action === "brace";
  if (!isStart && !isRealtimeStart && !isCheckpoint && !isFinish && !isAction) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: isStart || isRealtimeStart
      ? "v2:dangerous-fishing:start"
      : "v2:dangerous-fishing:action",
    userLimit: isStart || isRealtimeStart ? 45 : 120,
    ipLimit: isStart || isRealtimeStart ? 240 : 720,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const result = await withDangerousFishingTransaction((tx) => {
    if (isStart) {
      return startEncounterInTx(tx, userId, {
        baitId: body.baitId,
        now: Date.now(),
        random: Math.random,
      });
    }
    if (isRealtimeStart) {
      return startRealtimeEncounterInTx(tx, userId, {
        baitId: body.baitId,
        now: Date.now(),
        random: Math.random,
      });
    }
    if (isCheckpoint) {
      return checkpointRealtimeEncounterInTx(tx, userId, {
        encounterId: body.encounterId,
        revision: body.revision,
        inputs: body.inputs,
        clientTick: body.clientTick,
        now: Date.now(),
      });
    }
    if (isFinish) {
      return finishRealtimeEncounterInTx(tx, userId, {
        encounterId: body.encounterId,
        revision: body.revision,
        inputs: body.inputs,
        clientTick: body.clientTick,
        requestId: body.requestId,
        now: Date.now(),
        random: Math.random,
      });
    }
    return actOnEncounterInTx(tx, userId, {
      action: body.action as DangerousFishingAction,
      encounterId: body.encounterId,
      revision: body.revision,
      now: Date.now(),
      random: Math.random,
    });
  });
  return Response.json(result, { status: result.status });
}
