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
  const isAction = body.action === "reel" || body.action === "give" || body.action === "brace";
  if (!isStart && !isAction) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: isStart
      ? "v2:dangerous-fishing:start"
      : "v2:dangerous-fishing:action",
    userLimit: isStart ? 45 : 120,
    ipLimit: isStart ? 240 : 720,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const result = isStart
    ? await withDangerousFishingTransaction((tx) =>
        startEncounterInTx(tx, userId, {
          baitId: body.baitId,
          now: Date.now(),
          random: Math.random,
        }),
      )
    : await withDangerousFishingTransaction((tx) =>
        actOnEncounterInTx(tx, userId, {
          action: body.action as DangerousFishingAction,
          encounterId: body.encounterId,
          revision: body.revision,
          now: Date.now(),
          random: Math.random,
        }),
      );
  return Response.json(result, { status: result.status });
}
