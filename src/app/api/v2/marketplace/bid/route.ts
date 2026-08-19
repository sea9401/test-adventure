import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  marketplaceBidsV2,
  marketplaceInbox,
  marketplaceListingsV2,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { inboxValues } from "@/lib/server/inboxPayload";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { spendGold } from "@/adventure/data/v2/coreLoopConfig";
import {
  isValidPrice,
  marketplaceNextBidMinimum,
} from "@/lib/server/marketplaceV2";
import {
  TradeSuspendedError,
  requireTradeParticipants,
  tradeSuspendedResponse,
} from "@/lib/server/tradeSuspension";

type CharSave = {
  gold?: number;
  bankedGold?: number;
  [key: string]: unknown;
};

function bad(error: string, status = 400, detail?: Record<string, unknown>) {
  return Response.json({ ok: false, error, ...detail }, { status });
}

// POST /api/v2/marketplace/bid — 공개 입찰. 현재 참여자 user 행을 먼저 잠근 뒤 listing을
// 재잠그고 구매자의 입찰금을 character.v2에서 에스크로 차감한다. 다른 선두를 밀어내면
// 이전 입찰금은 우편으로 반환한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:bid",
    userLimit: 40,
    ipLimit: 240,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { listingId?: unknown; amount?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  if (
    typeof body.listingId !== "number" ||
    !Number.isInteger(body.listingId)
  ) {
    return bad("bad_listingId");
  }
  if (!isValidPrice(body.amount)) return bad("bad_bid");

  const listingId = body.listingId;
  const amount = body.amount;
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [probe] = await tx
      .select({
        sellerId: marketplaceListingsV2.sellerId,
        highestBidderId: marketplaceListingsV2.highestBidderId,
      })
      .from(marketplaceListingsV2)
      .where(eq(marketplaceListingsV2.id, listingId))
      .limit(1);
    if (!probe) {
      await requireTradeParticipants(tx, [userId], now);
      return { status: 404, body: { ok: false as const, error: "not_found" } };
    }
    const participantIds = [
      userId,
      probe.sellerId,
      ...(probe.highestBidderId ? [probe.highestBidderId] : []),
    ];
    await requireTradeParticipants(tx, participantIds, now);

    const [listing] = await tx
      .select()
      .from(marketplaceListingsV2)
      .where(eq(marketplaceListingsV2.id, listingId))
      .for("update");
    if (!listing) {
      return { status: 404, body: { ok: false as const, error: "not_found" } };
    }
    if (
      listing.sellerId !== probe.sellerId ||
      (listing.highestBidderId != null &&
        !participantIds.includes(listing.highestBidderId))
    ) {
      return {
        status: 409,
        body: { ok: false as const, error: "not_available" },
      };
    }
    if (listing.status !== "active") {
      return {
        status: 409,
        body: { ok: false as const, error: "not_available" },
      };
    }
    if (listing.sellerId === userId) {
      return {
        status: 400,
        body: { ok: false as const, error: "own_listing" },
      };
    }
    if (now >= listing.bidEndsAt) {
      return {
        status: 409,
        body: { ok: false as const, error: "bidding_closed" },
      };
    }

    const currentBid = listing.highestBid;
    const nextBid = marketplaceNextBidMinimum(currentBid);
    if ((currentBid != null && amount <= currentBid) || amount < nextBid) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "bid_too_low",
          nextBid,
        },
      };
    }

    const sameLeader = listing.highestBidderId === userId;
    const escrowCharge = sameLeader ? amount - (currentBid ?? 0) : amount;
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const gold = Math.max(0, Math.floor(Number(charSave.gold) || 0));
    const bankedGold = Math.max(
      0,
      Math.floor(Number(charSave.bankedGold) || 0),
    );
    const spend = spendGold(gold, bankedGold, escrowCharge);
    if (!spend.ok) {
      return {
        status: 400,
        body: { ok: false as const, error: "insufficient_gold" },
      };
    }
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: spend.gold,
      bankedGold: spend.bankedGold,
    });

    if (
      !sameLeader &&
      listing.highestBidderId &&
      currentBid != null &&
      currentBid > 0
    ) {
      await tx.insert(marketplaceInbox).values(
        inboxValues({
          userId: listing.highestBidderId,
          payload: { kind: "bid_refund", gold: currentBid },
          message: `${listing.itemName} 상위 입찰 발생 · ${currentBid.toLocaleString()}골드 반환`,
        }),
      );
    }

    const createdAt = new Date();
    await tx.insert(marketplaceBidsV2).values({
      listingId,
      bidderId: userId,
      amount,
      createdAt,
    });
    await tx
      .update(marketplaceListingsV2)
      .set({
        highestBid: amount,
        highestBidderId: userId,
        bidCount: listing.bidCount + 1,
      })
      .where(eq(marketplaceListingsV2.id, listingId));

    return {
      status: 200,
      log: {
        itemKind: listing.kind,
        itemId: listing.itemId,
        quantity: listing.quantity,
        escrowCharge,
      },
      body: {
        ok: true as const,
        highestBid: amount,
        nextBid: marketplaceNextBidMinimum(amount),
        gold: spend.gold,
        bankedGold: spend.bankedGold,
      },
    };
  }).catch((error) => {
    if (error instanceof TradeSuspendedError) return tradeSuspendedResponse(error);
    throw error;
  });
  if (result instanceof Response) return result;

  const economyLog = "log" in result ? result.log : null;
  if (result.status === 200 && economyLog) {
    recordEconomyEventSoon({
      userId,
      eventType: "marketplace.bid.escrow",
      goldDelta: -economyLog.escrowCharge,
      itemKind: economyLog.itemKind,
      itemId: economyLog.itemId,
      quantity: economyLog.quantity,
      detail: { listingId, bidAmount: amount },
    });
  }
  return Response.json(result.body, { status: result.status });
}
