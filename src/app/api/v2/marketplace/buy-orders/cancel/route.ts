import { eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceBuyOrdersV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { cancelMarketplaceBuyOrderEscrow } from "@/lib/server/marketplaceEscrow";

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:buy-orders:cancel",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;
  let body: { orderId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  if (typeof body.orderId !== "number" || !Number.isInteger(body.orderId)) {
    return bad("bad_order");
  }
  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(marketplaceBuyOrdersV2)
      .where(eq(marketplaceBuyOrdersV2.id, body.orderId as number))
      .for("update");
    if (!order) return { status: 404, body: { ok: false as const, error: "not_found" } };
    if (order.buyerId !== userId) {
      return { status: 403, body: { ok: false as const, error: "not_owner" } };
    }
    if (order.status !== "active") {
      return { status: 409, body: { ok: false as const, error: "not_active" } };
    }
    const escrow = await cancelMarketplaceBuyOrderEscrow(
      tx,
      order,
      new Date(),
      "user_cancel",
    );
    return {
      status: 200,
      refund: escrow.refundedGold,
      body: { ok: true as const, refund: escrow.refundedGold },
    };
  });
  if (result.status === 200 && "refund" in result && (result.refund ?? 0) > 0) {
    recordEconomyEventSoon({
      userId,
      eventType: "marketplace.buy_order.refund",
      goldDelta: result.refund ?? 0,
      detail: { orderId: body.orderId, reason: "cancelled" },
    });
  }
  return Response.json(result.body, { status: result.status });
}
