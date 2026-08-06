import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  marketplaceBuyOrdersV2,
  marketplaceInbox,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { inboxValues } from "@/lib/server/inboxPayload";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";

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
    if (order.goldEscrow > 0) {
      await tx.insert(marketplaceInbox).values(
        inboxValues({
          userId,
          payload: { kind: "buy_order_refund", gold: order.goldEscrow },
          message: `${order.itemName} 구매 주문 취소 · ${order.goldEscrow.toLocaleString()}골드 반환`,
        }),
      );
    }
    await tx
      .update(marketplaceBuyOrdersV2)
      .set({ status: "cancelled", goldEscrow: 0, closedAt: new Date() })
      .where(eq(marketplaceBuyOrdersV2.id, order.id));
    return {
      status: 200,
      refund: order.goldEscrow,
      body: { ok: true as const, refund: order.goldEscrow },
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
