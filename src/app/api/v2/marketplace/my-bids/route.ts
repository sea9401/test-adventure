import { desc, eq, max } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceBidsV2, marketplaceListingsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  MARKETPLACE_V2_MY_BIDS_LIMIT,
  currentMarketplaceItemName,
  marketplaceNextBidMinimum,
} from "@/lib/server/marketplaceV2";

// GET /api/v2/marketplace/my-bids — 본인이 참여한 공개 입찰을 매물별로 집계한다.
// 참여자 ID는 같은 행의 본인 여부를 계산할 때만 사용하고 응답에는 포함하지 않는다.
export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:my-bids",
    userLimit: 120,
    ipLimit: 800,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const myBids = db
    .select({
      listingId: marketplaceBidsV2.listingId,
      myHighestBid: max(marketplaceBidsV2.amount)
        .mapWith(Number)
        .as("my_highest_bid"),
      lastBidAt: max(marketplaceBidsV2.createdAt).as("last_bid_at"),
    })
    .from(marketplaceBidsV2)
    .where(eq(marketplaceBidsV2.bidderId, userId))
    .groupBy(marketplaceBidsV2.listingId)
    .as("my_bids");

  const rows = await db
    .select({
      id: marketplaceListingsV2.id,
      sellerId: marketplaceListingsV2.sellerId,
      buyerId: marketplaceListingsV2.buyerId,
      highestBidderId: marketplaceListingsV2.highestBidderId,
      kind: marketplaceListingsV2.kind,
      itemId: marketplaceListingsV2.itemId,
      itemName: marketplaceListingsV2.itemName,
      quantity: marketplaceListingsV2.quantity,
      price: marketplaceListingsV2.price,
      instancePayload: marketplaceListingsV2.instancePayload,
      status: marketplaceListingsV2.status,
      createdAt: marketplaceListingsV2.createdAt,
      bidEndsAt: marketplaceListingsV2.bidEndsAt,
      expiresAt: marketplaceListingsV2.expiresAt,
      closedAt: marketplaceListingsV2.closedAt,
      highestBid: marketplaceListingsV2.highestBid,
      bidResolvedAt: marketplaceListingsV2.bidResolvedAt,
      myHighestBid: myBids.myHighestBid,
      lastBidAt: myBids.lastBidAt,
    })
    .from(myBids)
    .innerJoin(
      marketplaceListingsV2,
      eq(marketplaceListingsV2.id, myBids.listingId),
    )
    .orderBy(desc(myBids.lastBidAt))
    .limit(MARKETPLACE_V2_MY_BIDS_LIMIT);

  return Response.json({
    ok: true,
    bids: rows.map(
      ({ sellerId: _sellerId, buyerId, highestBidderId, ...row }) => ({
        ...row,
        itemName: currentMarketplaceItemName(
          row.kind,
          row.itemId,
          row.itemName,
        ),
        myHighestBid: Number(row.myHighestBid),
        isHighestBidder: highestBidderId === userId,
        isBuyer: buyerId === userId,
        nextBid: marketplaceNextBidMinimum(row.price, row.highestBid),
      }),
    ),
  });
}
