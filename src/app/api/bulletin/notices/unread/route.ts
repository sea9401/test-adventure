import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { bulletinPosts, bulletinViews } from "@/db/schema";
import { BULLETIN_FETCH_LIMIT } from "@/lib/bulletin-config";
import { ensureUser } from "@/lib/server/ensureUser";

// GET /api/bulletin/notices/unread — 상단바 신규 점을 위한 경량 존재 여부 조회.
// 공지 화면에서 실제로 제공하는 최근 글 범위 안에 조회하지 않은 글이 있으면 true다.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const recentNotices = await db
    .select({ id: bulletinPosts.id })
    .from(bulletinPosts)
    .where(
      and(
        eq(bulletinPosts.category, "notice"),
        isNull(bulletinPosts.guildId),
      ),
    )
    .orderBy(desc(bulletinPosts.createdAt))
    .limit(BULLETIN_FETCH_LIMIT);

  if (recentNotices.length === 0) return unreadResponse(false);

  const recentIds = recentNotices.map((notice) => notice.id);
  const viewed = await db
    .select({ postId: bulletinViews.postId })
    .from(bulletinViews)
    .where(
      and(
        eq(bulletinViews.userId, userId),
        inArray(bulletinViews.postId, recentIds),
      ),
    );

  return unreadResponse(viewed.length < recentNotices.length);
}

function unreadResponse(hasUnread: boolean) {
  return Response.json(
    { hasUnread },
    { headers: { "cache-control": "private, no-store" } },
  );
}
