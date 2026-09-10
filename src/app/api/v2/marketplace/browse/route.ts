import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  marketplaceBidsV2,
  marketplaceListingsV2,
  savesKv,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { listedEquipBound } from "@/adventure/data/v2/v2EquipMint";
import {
  MARKETPLACE_V2_AUCTION_HOURS,
  MARKETPLACE_V2_AUCTION_MODE_VERSION,
  MARKETPLACE_V2_BROWSE_LIMIT,
  MARKETPLACE_V2_BID_EXTENSION_MINUTES,
  MARKETPLACE_V2_BID_EXTENSION_WINDOW_MINUTES,
  currentMarketplaceItemName,
  isMarketKind,
  isTradableMarketplaceMaterial,
  marketplacePublicListing,
} from "@/lib/server/marketplaceV2";

// GET /api/v2/marketplace/browse — 활성 매물 목록.
//   ?kind=equip|material  종류 필터(생략 시 전체)
//   ?mine=1               내 활성 매물만(취소 UI 용)
//   ?sort=ending_asc|ending_desc 실제 입찰 마감순
//   ?watchIds=1,2          관심 매물 등록 번호(최대 200개)
// 기본 최신순, 최대 MARKETPLACE_V2_BROWSE_LIMIT. 판매자 식별자는 숨기고 isMine 만 반환한다.
// viewerGold = 뷰어 현재 골드(구매 가능 여부·구매 확인 표시용 — UI 가 browse 만으로 골드도 최신 유지).

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:browse",
    userLimit: 180,
    ipLimit: 1_000,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind");
  const mine = url.searchParams.get("mine") === "1";

  const watchParam = url.searchParams.get("watchIds");
  const watchIds = watchParam === null ? null : watchParam.split(",").filter(Boolean).map(Number);
  if (watchIds && (watchIds.length > 200 || watchIds.some(id => !Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647))) {
    return Response.json({ ok: false, error: "invalid_watch_ids" }, { status: 400 });
  }
  const sort = url.searchParams.get("sort");
  const conds = [
    eq(marketplaceListingsV2.status, "active"),
    eq(
      marketplaceListingsV2.auctionModeVersion,
      MARKETPLACE_V2_AUCTION_MODE_VERSION,
    ),
  ];
  if (kindParam && isMarketKind(kindParam)) {
    conds.push(eq(marketplaceListingsV2.kind, kindParam));
  }
  if (mine) conds.push(eq(marketplaceListingsV2.sellerId, userId));

  if (watchIds !== null) conds.push(inArray(marketplaceListingsV2.id, watchIds));

  const rows = await db
    .select({
      id: marketplaceListingsV2.id,
      sellerId: marketplaceListingsV2.sellerId,
      kind: marketplaceListingsV2.kind,
      itemId: marketplaceListingsV2.itemId,
      itemName: marketplaceListingsV2.itemName,
      quantity: marketplaceListingsV2.quantity,
      price: marketplaceListingsV2.price,
      auctionModeVersion: marketplaceListingsV2.auctionModeVersion,
      instancePayload: marketplaceListingsV2.instancePayload,
      createdAt: marketplaceListingsV2.createdAt,
      bidEndsAt: marketplaceListingsV2.bidEndsAt,
      expiresAt: marketplaceListingsV2.expiresAt,
      highestBid: marketplaceListingsV2.highestBid,
      highestBidderId: marketplaceListingsV2.highestBidderId,
      bidCount: marketplaceListingsV2.bidCount,
      bidResolvedAt: marketplaceListingsV2.bidResolvedAt,
    })
    .from(marketplaceListingsV2)
    .where(and(...conds))
    .orderBy(
      sort === "ending_asc" ? asc(marketplaceListingsV2.bidEndsAt)
        : sort === "ending_desc" ? desc(marketplaceListingsV2.bidEndsAt)
        : desc(marketplaceListingsV2.createdAt),
      asc(marketplaceListingsV2.id),
    )
    .limit(MARKETPLACE_V2_BROWSE_LIMIT);

  const participatedRows = rows.length === 0
    ? []
    : await db
        .select({ listingId: marketplaceBidsV2.listingId })
        .from(marketplaceBidsV2)
        .where(
          and(
            eq(marketplaceBidsV2.bidderId, userId),
            inArray(
              marketplaceBidsV2.listingId,
              rows.map((row) => row.id),
            ),
          ),
        )
        .groupBy(marketplaceBidsV2.listingId);
  const participatedIds = new Set(
    participatedRows.map((row) => row.listingId),
  );

  // 뷰어 골드(character.v2.gold) — 비잠금 단순 read(표시용, 권위는 buy tx).
  const [charRow] = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "character.v2")))
    .limit(1);
  const rawGold = Number(
    (charRow?.value as { gold?: unknown } | undefined)?.gold ?? 0,
  );
  const viewerGold = Number.isFinite(rawGold) ? Math.max(0, Math.floor(rawGold)) : 0;

  return Response.json({
    ok: true,
    viewerGold,
    serverNow: Date.now(),
    auctionHours: MARKETPLACE_V2_AUCTION_HOURS,
    bidExtensionWindowMinutes: MARKETPLACE_V2_BID_EXTENSION_WINDOW_MINUTES,
    bidExtensionMinutes: MARKETPLACE_V2_BID_EXTENSION_MINUTES,
    listings: rows
      .filter(
        (row) =>
          row.auctionModeVersion === MARKETPLACE_V2_AUCTION_MODE_VERSION &&
          (mine ||
            (row.kind === "equip"
              ? !listedEquipBound(row.instancePayload)
              : row.kind !== "material" ||
                isTradableMarketplaceMaterial(row.itemId))),
      )
      .map((row) =>
        marketplacePublicListing(
          {
            ...row,
            itemName: currentMarketplaceItemName(
              row.kind,
              row.itemId,
              row.itemName,
            ),
          },
          userId,
          participatedIds.has(row.id),
        ),
      ),
  });
}
