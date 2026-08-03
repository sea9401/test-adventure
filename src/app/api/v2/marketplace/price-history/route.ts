import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListingsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { isMarketKind } from "@/lib/server/marketplaceV2";

const DAYS = 30;

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:price-history",
    userLimit: 120,
    ipLimit: 800,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const itemId = url.searchParams.get("itemId");
  if (!kind || !isMarketKind(kind) || !itemId) {
    return Response.json({ ok: false, error: "bad_item" }, { status: 400 });
  }
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      price: marketplaceListingsV2.price,
      quantity: marketplaceListingsV2.quantity,
      closedAt: marketplaceListingsV2.closedAt,
    })
    .from(marketplaceListingsV2)
    .where(
      and(
        eq(marketplaceListingsV2.status, "sold"),
        eq(marketplaceListingsV2.kind, kind),
        eq(marketplaceListingsV2.itemId, itemId),
        gte(marketplaceListingsV2.closedAt, since),
      ),
    )
    .orderBy(asc(marketplaceListingsV2.closedAt));
  const daily = new Map<
    string,
    { date: string; volume: number; trades: number; unitPrices: number[] }
  >();
  for (const row of rows) {
    if (!row.closedAt) continue;
    const date = row.closedAt.toISOString().slice(0, 10);
    const bucket = daily.get(date) ?? { date, volume: 0, trades: 0, unitPrices: [] };
    bucket.volume += row.quantity;
    bucket.trades++;
    bucket.unitPrices.push(row.price / Math.max(1, row.quantity));
    daily.set(date, bucket);
  }
  return Response.json({
    ok: true,
    days: DAYS,
    points: [...daily.values()].map((bucket) => ({
      date: bucket.date,
      volume: bucket.volume,
      trades: bucket.trades,
      averageUnitPrice: Math.max(
        1,
        Math.round(
          bucket.unitPrices.reduce((sum, value) => sum + value, 0) /
            bucket.unitPrices.length,
        ),
      ),
      minUnitPrice: Math.max(1, Math.round(Math.min(...bucket.unitPrices))),
      maxUnitPrice: Math.max(1, Math.round(Math.max(...bucket.unitPrices))),
    })),
  });
}
