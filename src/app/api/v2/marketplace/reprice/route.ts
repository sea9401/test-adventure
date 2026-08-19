import { eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListingsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  MARKETPLACE_V2_PRICE_MAX,
  isStackableMarketplaceItem,
  isValidPrice,
  marketplaceListingPhase,
} from "@/lib/server/marketplaceV2";
import {
  lockMarketplaceMatchOrdersForItem,
  matchMarketplaceBuyOrdersForItem,
  prepareMarketplaceMatchScope,
  recordMarketplaceAutoMatchFills,
  requireMarketplaceMatchParticipants,
  triggerMarketplacePriceAlertsForListing,
} from "@/lib/server/marketplaceBuyOrdersV2";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import {
  TradeSuspendedError,
  requireTradeParticipants,
  tradeSuspendedResponse,
} from "@/lib/server/tradeSuspension";

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:reprice",
    userLimit: 40,
    ipLimit: 240,
    windowMs: 60_000,
  });
  if (limited) return limited;
  let body: { listingId?: unknown; price?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  if (typeof body.listingId !== "number" || !Number.isInteger(body.listingId)) {
    return bad("bad_listingId");
  }
  if (!isValidPrice(body.price)) return bad("bad_price");
  const requestedPrice = body.price;
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [probe] = await tx
      .select({
        sellerId: marketplaceListingsV2.sellerId,
        kind: marketplaceListingsV2.kind,
        itemId: marketplaceListingsV2.itemId,
      })
      .from(marketplaceListingsV2)
      .where(eq(marketplaceListingsV2.id, body.listingId as number))
      .limit(1);
    if (!probe) {
      await requireTradeParticipants(tx, [userId], now);
      return { status: 404, body: { ok: false as const, error: "not_found" } };
    }
    const stackableProbe = isStackableMarketplaceItem(
      probe.kind as "equip" | "material" | "consumable",
      probe.itemId,
    );
    const matchScope = stackableProbe
      ? await prepareMarketplaceMatchScope(tx, {
          kind: probe.kind,
          itemId: probe.itemId,
          now,
          participantIds: [userId, probe.sellerId],
        })
      : null;
    if (matchScope) requireMarketplaceMatchParticipants(matchScope, [userId]);
    else await requireTradeParticipants(tx, [userId], now);
    if (matchScope) {
      await lockMarketplaceMatchOrdersForItem(tx, {
        scope: matchScope,
        kind: probe.kind,
        itemId: probe.itemId,
        now,
      });
    }
    const [listing] = await tx
      .select()
      .from(marketplaceListingsV2)
      .where(eq(marketplaceListingsV2.id, body.listingId as number))
      .for("update");
    if (!listing) return { status: 404, body: { ok: false as const, error: "not_found" } };
    if (
      listing.sellerId !== probe.sellerId ||
      listing.kind !== probe.kind ||
      listing.itemId !== probe.itemId
    ) {
      return { status: 409, body: { ok: false as const, error: "not_active" } };
    }
    if (listing.sellerId !== userId) {
      return { status: 403, body: { ok: false as const, error: "not_owner" } };
    }
    if (listing.status !== "active") {
      return { status: 409, body: { ok: false as const, error: "not_active" } };
    }
    if (listing.bidCount > 0 || marketplaceListingPhase(listing, now) !== "fixed") {
      return { status: 409, body: { ok: false as const, error: "cannot_reprice" } };
    }
    const stackable = isStackableMarketplaceItem(
      listing.kind as "equip" | "material" | "consumable",
      listing.itemId,
    );
    const totalPrice = stackable
      ? requestedPrice * listing.quantity
      : requestedPrice;
    if (
      !Number.isSafeInteger(totalPrice) ||
      totalPrice < 1 ||
      totalPrice > MARKETPLACE_V2_PRICE_MAX
    ) {
      return { status: 400, body: { ok: false as const, error: "bad_price" } };
    }
    await tx
      .update(marketplaceListingsV2)
      .set({ price: totalPrice })
      .where(eq(marketplaceListingsV2.id, listing.id));
    matchScope?.listingIds.add(listing.id);
    const autoMatchFills = stackable
      ? await matchMarketplaceBuyOrdersForItem(
          tx,
          listing.kind,
          listing.itemId,
          now,
          matchScope!,
        )
      : [];
    await triggerMarketplacePriceAlertsForListing(tx, listing.id, now);
    return {
      status: 200,
      autoMatchFills,
      body: { ok: true as const, totalPrice },
    };
  }).catch((error) => {
    if (error instanceof TradeSuspendedError) return tradeSuspendedResponse(error);
    throw error;
  });
  if (result instanceof Response) return result;
  if (result.status === 200 && "autoMatchFills" in result) {
    recordEconomyEventSoon({
      userId,
      eventType: "marketplace.reprice",
      goldDelta: 0,
      detail: { listingId: body.listingId, requestedPrice },
    });
    recordMarketplaceAutoMatchFills(result.autoMatchFills ?? []);
  }
  return Response.json(result.body, { status: result.status });
}
