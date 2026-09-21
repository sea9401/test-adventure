import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceInbox } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";

// 목록의 최근 100개 상한과 무관하게 읽음·처리가 모두 끝난 본인 우편을 숨긴다.
export async function POST() {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const deleted = await db
    .update(marketplaceInbox)
    .set({ recipientDeletedAt: new Date() })
    .where(
      and(
        eq(marketplaceInbox.userId, userId),
        isNotNull(marketplaceInbox.readAt),
        isNotNull(marketplaceInbox.claimedAt),
        isNull(marketplaceInbox.recipientDeletedAt),
      ),
    )
    .returning({ id: marketplaceInbox.id });

  return Response.json({ ok: true, deletedIds: deleted.map((row) => row.id) });
}
