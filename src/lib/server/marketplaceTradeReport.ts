import { eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListingsV2 } from "@/db/schema";
import { resolveActor } from "./resolveActor";

export type MarketplaceTradeReportRow = {
  id: number;
  sellerId: string;
  sellerName: string;
  buyerId: string | null;
  kind: string;
  itemId: string;
  itemName: string;
  quantity: number;
  price: number;
  instancePayload: unknown;
  status: string;
  createdAt: Date;
  bidEndsAt: Date;
  closedAt: Date | null;
  highestBid: number | null;
  bidCount: number;
  bidResolvedAt: Date | null;
};

export type MarketplaceTradeReportSource = {
  sourceType: "marketplace_trade";
  sourceId: string;
  targetUserId: string;
  targetName: string;
  contentSnapshot: string;
  contextSnapshot: Record<string, unknown>;
  relatedAccounts: Array<{ userId: string; name: string }>;
};

export type MarketplaceListingReportSource = Omit<
  MarketplaceTradeReportSource,
  "sourceType"
> & {
  sourceType: "marketplace_listing";
};

export function buildMarketplaceTradeReportSource(
  row: MarketplaceTradeReportRow,
  reporterUserId: string,
  buyerName: string | null,
): MarketplaceTradeReportSource | null {
  if (row.status !== "sold" || !row.closedAt) return null;

  const seller = { userId: row.sellerId, name: row.sellerName };
  const buyer =
    row.buyerId && buyerName
      ? { userId: row.buyerId, name: buyerName }
      : null;
  const target = reporterUserId === row.sellerId ? buyer : seller;
  if (!target || target.userId === reporterUserId) return null;

  const relatedAccounts = [seller, buyer]
    .filter((account): account is { userId: string; name: string } => Boolean(account))
    .filter(
      (account, index, accounts) =>
        accounts.findIndex((candidate) => candidate.userId === account.userId) ===
        index,
    );
  const unitPrice = Math.max(
    1,
    Math.ceil(row.price / Math.max(1, row.quantity)),
  );

  return {
    sourceType: "marketplace_trade",
    sourceId: String(row.id),
    targetUserId: target.userId,
    targetName: target.name,
    contentSnapshot: [
      `거래 번호: ${row.id}`,
      `품목: ${row.itemName} (${row.kind}:${row.itemId})`,
      `수량: ${row.quantity.toLocaleString("ko-KR")}`,
      `총 거래가: ${row.price.toLocaleString("ko-KR")} G`,
      `개당 가격: ${unitPrice.toLocaleString("ko-KR")} G`,
      `체결 시각: ${row.closedAt.toISOString()}`,
    ].join("\n"),
    contextSnapshot: {
      listingId: row.id,
      seller,
      buyer,
      kind: row.kind,
      itemId: row.itemId,
      itemName: row.itemName,
      quantity: row.quantity,
      price: row.price,
      unitPrice,
      instancePayload: row.instancePayload,
      closedAt: row.closedAt.toISOString(),
      highestBid: row.highestBid,
      bidCount: row.bidCount,
      bidResolvedAt: row.bidResolvedAt?.toISOString() ?? null,
      relatedAccounts,
    },
    relatedAccounts,
  };
}

export function buildMarketplaceListingReportSource(
  row: MarketplaceTradeReportRow,
  reporterUserId: string,
): MarketplaceListingReportSource | null {
  if (row.status !== "active" || row.sellerId === reporterUserId) return null;

  const seller = { userId: row.sellerId, name: row.sellerName };
  const currentPrice = row.highestBid ?? row.price;
  const unitPrice = Math.max(
    1,
    Math.ceil(currentPrice / Math.max(1, row.quantity)),
  );
  const highestBidLabel =
    row.highestBid == null
      ? "없음"
      : `${row.highestBid.toLocaleString("ko-KR")} G`;

  return {
    sourceType: "marketplace_listing",
    sourceId: String(row.id),
    targetUserId: seller.userId,
    targetName: seller.name,
    contentSnapshot: [
      `매물 번호: ${row.id}`,
      `품목: ${row.itemName} (${row.kind}:${row.itemId})`,
      `수량: ${row.quantity.toLocaleString("ko-KR")}`,
      `시작 입찰가: ${row.price.toLocaleString("ko-KR")} G`,
      `현재 최고 입찰가: ${highestBidLabel}`,
      `현재 기준 개당 가격: ${unitPrice.toLocaleString("ko-KR")} G`,
      `등록 시각: ${row.createdAt.toISOString()}`,
      `입찰 마감 시각: ${row.bidEndsAt.toISOString()}`,
    ].join("\n"),
    contextSnapshot: {
      listingId: row.id,
      status: row.status,
      seller,
      kind: row.kind,
      itemId: row.itemId,
      itemName: row.itemName,
      quantity: row.quantity,
      price: row.price,
      currentPrice,
      unitPrice,
      instancePayload: row.instancePayload,
      createdAt: row.createdAt.toISOString(),
      bidEndsAt: row.bidEndsAt.toISOString(),
      highestBid: row.highestBid,
      bidCount: row.bidCount,
      relatedAccounts: [seller],
    },
    relatedAccounts: [seller],
  };
}

async function readMarketplaceReportRow(
  listingId: number,
): Promise<MarketplaceTradeReportRow | null> {
  const [row] = await db
    .select({
      id: marketplaceListingsV2.id,
      sellerId: marketplaceListingsV2.sellerId,
      sellerName: marketplaceListingsV2.sellerName,
      buyerId: marketplaceListingsV2.buyerId,
      kind: marketplaceListingsV2.kind,
      itemId: marketplaceListingsV2.itemId,
      itemName: marketplaceListingsV2.itemName,
      quantity: marketplaceListingsV2.quantity,
      price: marketplaceListingsV2.price,
      instancePayload: marketplaceListingsV2.instancePayload,
      status: marketplaceListingsV2.status,
      createdAt: marketplaceListingsV2.createdAt,
      bidEndsAt: marketplaceListingsV2.bidEndsAt,
      closedAt: marketplaceListingsV2.closedAt,
      highestBid: marketplaceListingsV2.highestBid,
      bidCount: marketplaceListingsV2.bidCount,
      bidResolvedAt: marketplaceListingsV2.bidResolvedAt,
    })
    .from(marketplaceListingsV2)
    .where(eq(marketplaceListingsV2.id, listingId))
    .limit(1);
  return row ?? null;
}

export async function resolveMarketplaceTradeReportSource(
  reporterUserId: string,
  listingId: number,
): Promise<MarketplaceTradeReportSource | null> {
  const row = await readMarketplaceReportRow(listingId);
  if (!row || row.status !== "sold" || !row.closedAt) return null;

  const buyerName = row.buyerId
    ? (await resolveActor(row.buyerId)).name
    : null;
  return buildMarketplaceTradeReportSource(row, reporterUserId, buyerName);
}

export async function resolveMarketplaceListingReportSource(
  reporterUserId: string,
  listingId: number,
): Promise<MarketplaceListingReportSource | null> {
  const row = await readMarketplaceReportRow(listingId);
  if (!row) return null;
  return buildMarketplaceListingReportSource(row, reporterUserId);
}
