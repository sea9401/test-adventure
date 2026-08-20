import { eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListingsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { cancelMarketplaceListingEscrow } from "@/lib/server/marketplaceEscrow";
import { lockTradeParticipantStatuses } from "@/lib/server/tradeSuspension";

// POST /api/v2/marketplace/cancel — 내 활성 매물 취소(에스크로 반환).
//   body: { listingId:int }
// listing FOR UPDATE → 본인·활성 확인 → 아이템을 판매자 save 로 반환(장비=새 개체, 재료=수량 복원)
//   → cancelled 마킹. (판매자 본인이 온라인이라 직접 save 반환 — 우편 불필요.)

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:cancel",
    userLimit: 60,
    ipLimit: 360,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { listingId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  if (typeof body.listingId !== "number" || !Number.isInteger(body.listingId)) {
    return bad("bad_listingId");
  }
  const listingId = body.listingId;

  const result = await db.transaction(async (tx) => {
    const now = new Date();
    // Cancellation is always allowed, including while suspended. The user
    // lock only establishes the canonical users-before-assets order.
    await lockTradeParticipantStatuses(tx, [userId], now);
    const [listing] = await tx
      .select()
      .from(marketplaceListingsV2)
      .where(eq(marketplaceListingsV2.id, listingId))
      .for("update");
    if (!listing) return { status: 404, body: { ok: false as const, error: "not_found" } };
    if (listing.sellerId !== userId) {
      return { status: 403, body: { ok: false as const, error: "not_owner" } };
    }
    if (listing.status !== "active") {
      return { status: 409, body: { ok: false as const, error: "not_active" } };
    }
    if (listing.bidCount > 0) {
      return { status: 409, body: { ok: false as const, error: "has_bids" } };
    }

    await cancelMarketplaceListingEscrow(tx, listing, {
      now,
      refundHighestBid: false,
      reason: "user_cancel",
    });

    return {
      status: 200,
      log: {
        itemKind: listing.kind,
        itemId: listing.itemId,
        quantity: listing.quantity,
        price: listing.price,
        listingId,
      },
      body: { ok: true as const },
    };
  });

  const economyLog = result.status === 200 && "log" in result ? result.log : null;
  if (economyLog) {
    recordEconomyEventSoon({
      userId,
      eventType: "marketplace.cancel",
      goldDelta: 0,
      itemKind: economyLog.itemKind,
      itemId: economyLog.itemId,
      quantity: economyLog.quantity,
      detail: {
        listingId: economyLog.listingId,
        price: economyLog.price,
      },
    });
  }

  return Response.json(result.body, { status: result.status });
}
