import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceInbox } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";

// GET /api/marketplace/inbox — 미수령 우편함 (전체). claimed_at IS NULL, created_at DESC.
//   ?count=1 → 경량 카운트 모드(미수령 수만 반환, 우편 배지 폴링용 — 전체 행 fetch 회피).
export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  // 경량 카운트 모드 — 배지 폴링(MailboxBell).
  if (new URL(req.url).searchParams.get("count") === "1") {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(marketplaceInbox)
      .where(
        and(
          eq(marketplaceInbox.userId, userId),
          isNull(marketplaceInbox.claimedAt),
        ),
      );
    return Response.json({ ok: true, unclaimedCount: row?.n ?? 0 });
  }

  const rows = await db
    .select({
      id: marketplaceInbox.id,
      kind: marketplaceInbox.kind,
      payload: marketplaceInbox.payload,
      message: marketplaceInbox.message,
      listingId: marketplaceInbox.listingId,
      fromName: marketplaceInbox.fromName,
      createdAt: marketplaceInbox.createdAt,
    })
    .from(marketplaceInbox)
    .where(
      and(
        eq(marketplaceInbox.userId, userId),
        isNull(marketplaceInbox.claimedAt),
      ),
    )
    .orderBy(desc(marketplaceInbox.createdAt));

  return Response.json({
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      payload: r.payload,
      message: r.message,
      listingId: r.listingId,
      fromName: r.fromName,
      createdAt: r.createdAt.toISOString(),
    })),
    unclaimedCount: rows.length,
  });
}
