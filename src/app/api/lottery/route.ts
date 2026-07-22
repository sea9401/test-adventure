import { ensureUser } from "@/lib/server/ensureUser";
import { resolveActor } from "@/lib/server/resolveActor";
import {
  getLotterySnapshot,
  purchaseLotteryTickets,
} from "@/lib/server/lotteryService";
import { clientIpFromRequest, recordAbuseEventSoon } from "@/lib/server/abuseLog";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });
  return Response.json(await getLotterySnapshot(userId));
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });
  let body: { ticketCount?: unknown; requestId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid_json", { status: 400 });
  }
  const ticketCount = Number(body.ticketCount);
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const actor = await resolveActor(userId);
  const result = await purchaseLotteryTickets({
    userId,
    actorName: actor.name,
    ticketCount,
    requestId,
  });
  if (!result.ok) {
    const status =
      result.error === "purchase_rate_limited"
        ? 429
        : result.error === "round_ticket_limit" || result.error === "insufficient_gold"
          ? 409
          : 400;
    if (result.error === "purchase_rate_limited") {
      recordAbuseEventSoon({
        userId,
        ip: clientIpFromRequest(req),
        action: "lottery.purchase",
        reason: "rate_limited",
        detail: { ticketCount },
      });
    }
    return Response.json(result, { status });
  }
  return Response.json(result);
}
