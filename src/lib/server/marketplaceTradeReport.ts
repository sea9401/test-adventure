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

export async function resolveMarketplaceTradeReportSource(
  reporterUserId: string,
  listingId: number,
): Promise<MarketplaceTradeReportSource | null> {
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
      closedAt: marketplaceListingsV2.closedAt,
      highestBid: marketplaceListingsV2.highestBid,
      bidCount: marketplaceListingsV2.bidCount,
      bidResolvedAt: marketplaceListingsV2.bidResolvedAt,
    })
    .from(marketplaceListingsV2)
    .where(eq(marketplaceListingsV2.id, listingId))
    .limit(1);
  if (!row || row.status !== "sold" || !row.closedAt) return null;

  const buyerName = row.buyerId
    ? (await resolveActor(row.buyerId)).name
    : null;
  return buildMarketplaceTradeReportSource(row, reporterUserId, buyerName);
}
