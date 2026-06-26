import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListingsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { MARKETPLACE_V2_HISTORY_LIMIT } from "@/lib/server/marketplaceV2";

// GET /api/v2/marketplace/history — 최근 체결된 거래(거래소 "최근 거래" 탭).
//   status='sold' 매물을 체결 시각(closedAt) 최신순, 최대 MARKETPLACE_V2_HISTORY_LIMIT.
//   공개 정보(판매자명·아이템·체결가·시각)만 — 구매자(buyerId)는 비노출(프라이버시).
export async function GET() {
  const userId = await ensureUser();
  if (!userId)
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: marketplaceListingsV2.id,
      sellerName: marketplaceListingsV2.sellerName,
      kind: marketplaceListingsV2.kind,
      itemId: marketplaceListingsV2.itemId,
      itemName: marketplaceListingsV2.itemName,
      quantity: marketplaceListingsV2.quantity,
      price: marketplaceListingsV2.price,
      instancePayload: marketplaceListingsV2.instancePayload,
      closedAt: marketplaceListingsV2.closedAt,
    })
    .from(marketplaceListingsV2)
    .where(
      and(
        eq(marketplaceListingsV2.status, "sold"),
        isNotNull(marketplaceListingsV2.closedAt),
      ),
    )
    .orderBy(desc(marketplaceListingsV2.closedAt))
    .limit(MARKETPLACE_V2_HISTORY_LIMIT);

  return Response.json({ ok: true, trades: rows });
}
