import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceBidsV2, marketplaceListingsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

// GET /api/v2/marketplace/bids?listingId=N — 금액·시각만 공개한다.
// bidderId는 서버에서 본인 표시 계산에만 사용하고 응답에는 절대 포함하지 않는다.
export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:bids",
    userLimit: 180,
    ipLimit: 1_000,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const listingId = Number(new URL(req.url).searchParams.get("listingId"));
  if (!Number.isInteger(listingId) || listingId <= 0) {
    return Response.json({ ok: false, error: "bad_listingId" }, { status: 400 });
  }
  const [listing] = await db
    .select({ id: marketplaceListingsV2.id })
    .from(marketplaceListingsV2)
    .where(eq(marketplaceListingsV2.id, listingId))
    .limit(1);
  if (!listing) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const rows = await db
    .select({
      id: marketplaceBidsV2.id,
      amount: marketplaceBidsV2.amount,
      bidderId: marketplaceBidsV2.bidderId,
      createdAt: marketplaceBidsV2.createdAt,
    })
    .from(marketplaceBidsV2)
    .where(and(eq(marketplaceBidsV2.listingId, listingId)))
    .orderBy(
      desc(marketplaceBidsV2.createdAt),
      desc(marketplaceBidsV2.id),
    )
    .limit(200);

  return Response.json({
    ok: true,
    // 최신 200건을 가져온 뒤 화면이 시간순으로 다룰 수 있게 오래된 순서로 반환한다.
    bids: rows.reverse().map((row) => ({
      amount: row.amount,
      createdAt: row.createdAt,
      isMine: row.bidderId === userId,
    })),
  });
}
