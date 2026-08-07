import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { bulletinPosts, bulletinViews } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";

// GET /api/bulletin/notices/unread — 상단바 신규 점을 위한 경량 존재 여부 조회.
// 상단 점은 "새 공지가 올라왔는가"를 알리는 용도라 최신 공지 하나만 판정한다.
// 최근 50개를 모두 요구하면 기능 도입 전의 옛 공지까지 전부 열어야 점이 사라진다.
// 목록 안의 공지별 미열람 점은 GET /api/bulletin의 viewedByMe로 계속 따로 표시한다.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const latestNotices = await db
    .select({ id: bulletinPosts.id })
    .from(bulletinPosts)
    .where(
      and(
        eq(bulletinPosts.category, "notice"),
        isNull(bulletinPosts.guildId),
      ),
    )
    .orderBy(desc(bulletinPosts.createdAt))
    .limit(1);

  const latestNotice = latestNotices[0];
  if (!latestNotice) return unreadResponse(false);

  const viewed = await db
    .select({ postId: bulletinViews.postId })
    .from(bulletinViews)
    .where(
      and(
        eq(bulletinViews.userId, userId),
        eq(bulletinViews.postId, latestNotice.id),
      ),
    );

  return unreadResponse(viewed.length === 0);
}

function unreadResponse(hasUnread: boolean) {
  return Response.json(
    { hasUnread },
    { headers: { "cache-control": "private, no-store" } },
  );
}
