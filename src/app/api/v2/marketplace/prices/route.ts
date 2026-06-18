import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListingsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { MARKETPLACE_V2_PRICE_HISTORY_DAYS } from "@/lib/server/marketplaceV2";

// GET /api/v2/marketplace/prices — 시세(최근 거래가). 종목별 판매 완료(sold) 집계.
//   최근 N일(MARKETPLACE_V2_PRICE_HISTORY_DAYS) 동안 status='sold' 인 매물을 itemId 로 묶어
//   건수·평균·최저·최고가 반환. UI 가 itemId 로 조회해 가격 판단 참고로 표시.
// ⚠️ 장비는 굴림(품질) 무관하게 itemId 로 묶음 → 거친 참고치(같은 종류라도 품질 따라 실거래가 편차).
//    재료는 매물 전체가(수량 N) 기준이라 수량 다르면 비교 부정확하나, 재료 거래는 현재 비활성.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const since = new Date(Date.now() - MARKETPLACE_V2_PRICE_HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      itemId: marketplaceListingsV2.itemId,
      n: sql<number>`cast(count(*) as int)`,
      avg: sql<number>`cast(round(avg(${marketplaceListingsV2.price})) as int)`,
      min: sql<number>`cast(min(${marketplaceListingsV2.price}) as int)`,
      max: sql<number>`cast(max(${marketplaceListingsV2.price}) as int)`,
    })
    .from(marketplaceListingsV2)
    .where(
      and(
        eq(marketplaceListingsV2.status, "sold"),
        gte(marketplaceListingsV2.closedAt, since),
      ),
    )
    .groupBy(marketplaceListingsV2.itemId);

  const prices: Record<string, { n: number; avg: number; min: number; max: number }> = {};
  for (const r of rows) {
    prices[r.itemId] = { n: r.n, avg: r.avg, min: r.min, max: r.max };
  }
  return Response.json({ ok: true, days: MARKETPLACE_V2_PRICE_HISTORY_DAYS, prices });
}
