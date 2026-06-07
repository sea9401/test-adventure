import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListingsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  MARKETPLACE_V2_BROWSE_LIMIT,
  isMarketKind,
} from "@/lib/server/marketplaceV2";

// GET /api/v2/marketplace/browse — 활성 매물 목록.
//   ?kind=equip|material  종류 필터(생략 시 전체)
//   ?mine=1               내 활성 매물만(취소 UI 용)
// 최신순, 최대 MARKETPLACE_V2_BROWSE_LIMIT. sellerId 포함(UI 가 본인 매물 표시·구매 비활성).

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind");
  const mine = url.searchParams.get("mine") === "1";

  const conds = [eq(marketplaceListingsV2.status, "active")];
  if (kindParam && isMarketKind(kindParam)) {
    conds.push(eq(marketplaceListingsV2.kind, kindParam));
  }
  if (mine) conds.push(eq(marketplaceListingsV2.sellerId, userId));

  const rows = await db
    .select({
      id: marketplaceListingsV2.id,
      sellerId: marketplaceListingsV2.sellerId,
      sellerName: marketplaceListingsV2.sellerName,
      kind: marketplaceListingsV2.kind,
      itemId: marketplaceListingsV2.itemId,
      itemName: marketplaceListingsV2.itemName,
      quantity: marketplaceListingsV2.quantity,
      price: marketplaceListingsV2.price,
      instancePayload: marketplaceListingsV2.instancePayload,
      createdAt: marketplaceListingsV2.createdAt,
    })
    .from(marketplaceListingsV2)
    .where(and(...conds))
    .orderBy(desc(marketplaceListingsV2.createdAt))
    .limit(MARKETPLACE_V2_BROWSE_LIMIT);

  return Response.json({ ok: true, viewerId: userId, listings: rows });
}
