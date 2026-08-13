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
  returnVoyageInTx,
  startVoyageInTx,
  withDangerousFishingTransaction,
} from "@/lib/server/dangerousFishingService";

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
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:dangerous-fishing:voyage",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const result = await withDangerousFishingTransaction((tx) =>
    body.action === "start"
      ? startVoyageInTx(tx, userId, {
          zoneId: body.zoneId,
          depthId: body.depthId,
          now: Date.now(),
        })
      : body.action === "return"
        ? returnVoyageInTx(tx, userId)
        : Promise.resolve({ ok: false as const, error: "bad_request", status: 400 }),
  );
  return Response.json(result, { status: result.status });
}
