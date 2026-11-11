// GET  /api/v2/events/winter-board — 겨울 말판 상태(그날 주사위 적립 포함)
// POST /api/v2/events/winter-board —
//   { action: "roll", requestId, all? } | { action: "claim_milestone", laps } | { action: "buy", itemId }

import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  buyWinterBoardItem,
  claimWinterBoardMilestone,
  readWinterBoard,
  rollWinterBoard,
  validWinterRequestId,
  type WinterBoardFailure,
} from "@/lib/server/winterBoard";

const fail = (error: string, status: number) =>
  Response.json({ ok: false, error }, { status });

function respond(result: { ok: true } | WinterBoardFailure): Response {
  return result.ok ? Response.json(result) : fail(result.error, result.status);
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return fail("unauthorized", 401);
  try {
    return respond(await readWinterBoard(userId, new Date()));
  } catch (error) {
    console.error("[winter-board] read failed", error);
    return fail("server_error", 500);
  }
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return fail("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:winter-board",
    userLimit: 60,
    ipLimit: 300,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("invalid_json", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail("bad_request", 400);
  }
  const { action, requestId, all, laps, itemId } = body as Record<string, unknown>;
  const now = new Date();

  try {
    if (action === "roll") {
      if (!validWinterRequestId(requestId)) return fail("bad_request_id", 400);
      return respond(
        await rollWinterBoard(userId, { requestId, all: all === true }, now),
      );
    }
    if (action === "claim_milestone") {
      if (typeof laps !== "number" || !Number.isInteger(laps)) {
        return fail("bad_request", 400);
      }
      return respond(await claimWinterBoardMilestone(userId, laps, now));
    }
    if (action === "buy") {
      if (typeof itemId !== "string" || !itemId) return fail("bad_request", 400);
      return respond(await buyWinterBoardItem(userId, itemId, now));
    }
    return fail("bad_request", 400);
  } catch (error) {
    console.error("[winter-board] action failed", error);
    return fail("server_error", 500);
  }
}
