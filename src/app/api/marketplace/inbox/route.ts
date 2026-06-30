import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceInbox, users } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";

// 기록(history) 모드에서 한 번에 돌려주는 이미 읽은 우편 수 — 받은 우편 기록 보관용 상한.
const HISTORY_LIMIT = 100;

// GET /api/marketplace/inbox — 미수령 우편함 (전체). claimed_at IS NULL, created_at DESC.
//   ?count=1   → 경량 카운트 모드(미수령 수만 반환, 우편 배지 폴링용 — 전체 행 fetch 회피).
//   ?history=1 → 기록 모드(이미 읽은/수령한 우편 최근 N개). 받은 우편이 사라지지 않고
//                기록으로 남도록. 미수령 모드와 달리 상한(HISTORY_LIMIT)을 둔다.
//   ?sent=1    → 보낸 우편 기록. marketplace_inbox.from_user_id 로 최근 N개를 조회한다.
export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const params = new URL(req.url).searchParams;

  // 경량 카운트 모드 — 배지 폴링(MailboxBell).
  if (params.get("count") === "1") {
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

  const history = params.get("history") === "1";
  const sent = params.get("sent") === "1";

  if (sent) {
    const rows = await db
      .select({
        id: marketplaceInbox.id,
        kind: marketplaceInbox.kind,
        payload: marketplaceInbox.payload,
        message: marketplaceInbox.message,
        listingId: marketplaceInbox.listingId,
        fromName: marketplaceInbox.fromName,
        recipientName: users.gameName,
        createdAt: marketplaceInbox.createdAt,
        claimedAt: marketplaceInbox.claimedAt,
      })
      .from(marketplaceInbox)
      .leftJoin(users, eq(users.id, marketplaceInbox.userId))
      .where(eq(marketplaceInbox.fromUserId, userId))
      .orderBy(desc(marketplaceInbox.createdAt))
      .limit(HISTORY_LIMIT);

    return Response.json({
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        payload: r.payload,
        message: r.message,
        listingId: r.listingId,
        fromName: r.fromName,
        recipientName: r.recipientName,
        direction: "sent" as const,
        createdAt: r.createdAt.toISOString(),
        claimedAt: r.claimedAt ? r.claimedAt.toISOString() : null,
      })),
      unclaimedCount: 0,
    });
  }

  // 기록 모드는 이미 읽은(claimed) 우편을, 기본 모드는 미수령(unclaimed) 우편을 반환.
  // 기본 모드는 상한 없음 — 수령 안 한 보상 우편이 잘려 영구 손실되는 걸 막는다.
  const base = db
    .select({
      id: marketplaceInbox.id,
      kind: marketplaceInbox.kind,
      payload: marketplaceInbox.payload,
      message: marketplaceInbox.message,
      listingId: marketplaceInbox.listingId,
      fromName: marketplaceInbox.fromName,
      recipientName: sql<string | null>`null`,
      createdAt: marketplaceInbox.createdAt,
      claimedAt: marketplaceInbox.claimedAt,
    })
    .from(marketplaceInbox)
    .where(
      and(
        eq(marketplaceInbox.userId, userId),
        history
          ? isNotNull(marketplaceInbox.claimedAt)
          : isNull(marketplaceInbox.claimedAt),
      ),
    )
    .orderBy(desc(marketplaceInbox.createdAt));

  const rows = history ? await base.limit(HISTORY_LIMIT) : await base;

  return Response.json({
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      payload: r.payload,
      message: r.message,
      listingId: r.listingId,
      fromName: r.fromName,
      recipientName: r.recipientName,
      direction: "received" as const,
      createdAt: r.createdAt.toISOString(),
      claimedAt: r.claimedAt ? r.claimedAt.toISOString() : null,
    })),
    unclaimedCount: history ? 0 : rows.length,
  });
}
