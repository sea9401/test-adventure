import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListingsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { MARKETPLACE_V2_PRICE_HISTORY_DAYS } from "@/lib/server/marketplaceV2";
import { marketplacePriceKeyForPayload } from "@/adventure/data/v2/marketplacePriceKeys";

// GET /api/v2/marketplace/prices — 시세(최근 거래가). 종목별 판매 완료(sold) 집계.
//   최근 N일(MARKETPLACE_V2_PRICE_HISTORY_DAYS) 동안 status='sold' 인 매물을 itemId 로 묶어
//   건수·평균·최저·최고가 반환. UI 가 itemId 로 조회해 가격 판단 참고로 표시.
// 장비는 itemId 전체 평균과 함께 제작 상태별 키(itemId#crafted/#quality1/#quality2/#masterwork/#craftOnly)를
// 같이 내려준다. UI 는 동급 키를 우선 쓰고 없으면 기존 itemId 평균으로 fallback 한다.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const since = new Date(Date.now() - MARKETPLACE_V2_PRICE_HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      itemId: marketplaceListingsV2.itemId,
      kind: marketplaceListingsV2.kind,
      price: marketplaceListingsV2.price,
      instancePayload: marketplaceListingsV2.instancePayload,
    })
    .from(marketplaceListingsV2)
    .where(
      and(
        eq(marketplaceListingsV2.status, "sold"),
        gte(marketplaceListingsV2.closedAt, since),
      ),
    );

  const prices: Record<string, { n: number; avg: number; min: number; max: number }> = {};
  const buckets = new Map<string, number[]>();
  for (const r of rows) {
    const keys = new Set([r.itemId]);
    if (r.kind === "equip") {
      keys.add(marketplacePriceKeyForPayload(r.itemId, r.instancePayload));
    }
    for (const key of keys) {
      const bucket = buckets.get(key) ?? [];
      bucket.push(r.price);
      buckets.set(key, bucket);
    }
  }
  for (const [key, values] of buckets) {
    prices[key] = {
      n: values.length,
      avg: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }
  return Response.json({
    ok: true,
    days: MARKETPLACE_V2_PRICE_HISTORY_DAYS,
    prices,
  });
}
