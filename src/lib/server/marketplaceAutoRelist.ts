import "server-only";

import { and, eq } from "drizzle-orm";
import { marketplaceListingsV2 } from "@/db/schema";
import type { DbExecutor } from "@/lib/server/savesKv";
import {
  marketplaceAutoRelistCutPct,
  marketplaceAutoRelistPrice,
} from "@/adventure/v2/marketplace/autoRelist";
import { MARKETPLACE_V2_AUCTION_MODE_VERSION } from "@/lib/server/marketplaceV2";
import type { MarketplaceListingRow } from "@/lib/server/marketplaceEscrow";

export type MarketplaceAutoRelistResult = {
  listingId: number;
  price: number;
  cutPct: number;
  bidEndsAt: Date;
};

/**
 * 입찰 없이 끝난 매물을 가격을 낮춘 새 매물로 넘긴다.
 * 물품은 판매자에게 돌려주지 않고 보관한 채로 새 매물에 묶는다. 그래서 가방 세이브를 건드리지 않고,
 * 판매자의 활성 매물 수도 그대로다. 호출하는 쪽이 이 매물 행을 FOR UPDATE 로 잠근 상태여야 한다.
 * 옵션이 꺼져 있거나 입찰이 있었거나 더 낮출 수 없으면 null — 그때는 기존 유찰 처리로 돌려준다.
 */
export async function autoRelistUnsoldListing(
  tx: DbExecutor,
  listing: MarketplaceListingRow,
  now: Date,
): Promise<MarketplaceAutoRelistResult | null> {
  if (listing.status !== "active") return null;
  if (listing.auctionModeVersion !== MARKETPLACE_V2_AUCTION_MODE_VERSION) return null;
  // 값이 없거나 0이면 꺼진 것으로 본다.
  if (!(listing.autoRelistLeft > 0)) return null;
  // 입찰이 한 번이라도 있었던 매물은 대상이 아니다(환불·낙찰 정산은 기존 경로가 맡는다).
  if (listing.highestBidderId || (listing.highestBid ?? 0) > 0 || listing.bidCount > 0) {
    return null;
  }
  // 인하 폭은 판매자가 등록할 때 정한 값이다.
  const cutPct = marketplaceAutoRelistCutPct(listing.autoRelistCutPct);
  const price = marketplaceAutoRelistPrice(listing.price, cutPct);
  if (price === null) return null;

  // 입찰이 없었으니 마감 연장도 없었다. 처음 고른 등록 시간을 그대로 쓴다.
  const durationMs = Math.max(
    60 * 60 * 1000,
    listing.bidEndsAt.getTime() - listing.createdAt.getTime(),
  );
  const bidEndsAt = new Date(now.getTime() + durationMs);

  // 이 유찰 건을 먼저 닫는다. 이미 다른 정산이 닫았으면 아무것도 하지 않는다.
  const [closed] = await tx
    .update(marketplaceListingsV2)
    .set({ status: "expired", closedAt: now, bidResolvedAt: now })
    .where(
      and(
        eq(marketplaceListingsV2.id, listing.id),
        eq(marketplaceListingsV2.status, "active"),
      ),
    )
    .returning({ id: marketplaceListingsV2.id });
  if (!closed) return null;

  const [row] = await tx
    .insert(marketplaceListingsV2)
    .values({
      sellerId: listing.sellerId,
      sellerName: listing.sellerName,
      kind: listing.kind,
      itemId: listing.itemId,
      itemName: listing.itemName,
      quantity: listing.quantity,
      price,
      auctionModeVersion: MARKETPLACE_V2_AUCTION_MODE_VERSION,
      instancePayload: listing.instancePayload,
      createdAt: now,
      bidEndsAt,
      expiresAt: new Date(bidEndsAt.getTime() + 1),
      autoRelistLeft: listing.autoRelistLeft - 1,
      autoRelistCutPct: cutPct,
    })
    .returning({ id: marketplaceListingsV2.id });
  return { listingId: row.id, price, cutPct, bidEndsAt };
}
