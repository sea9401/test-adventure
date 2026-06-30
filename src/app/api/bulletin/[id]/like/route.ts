import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bulletinLikes } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { canAccessBulletinPost } from "@/lib/server/bulletinAccess";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/bulletin/[id]/like — toggle. 응답: { liked, count }.
// 글이 없으면 404. 본인 글에도 좋아요 가능 (트위터/디시 류와 동일).
export async function POST(_req: Request, ctx: Ctx) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const { id: idStr } = await ctx.params;
  const postId = Number(idStr);
  if (!Number.isInteger(postId) || postId <= 0) {
    return new Response("invalid id", { status: 400 });
  }

  // 글 존재 + 접근권 확인 — 길드 전용 글은 같은 길드원만 좋아요 가능.
  if (!(await canAccessBulletinPost(db, postId, userId))) {
    return new Response("not found", { status: 404 });
  }

  // toggle — 삭제 시도 → 행 0개면 INSERT.
  const deleted = await db
    .delete(bulletinLikes)
    .where(
      and(eq(bulletinLikes.postId, postId), eq(bulletinLikes.userId, userId)),
    )
    .returning({ postId: bulletinLikes.postId });

  if (deleted.length === 0) {
    // 동시 클릭 등으로 PK 충돌 가능 — onConflictDoNothing 으로 흡수.
    await db
      .insert(bulletinLikes)
      .values({ postId, userId })
      .onConflictDoNothing();
  }

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(bulletinLikes)
    .where(eq(bulletinLikes.postId, postId));

  return Response.json({ liked: deleted.length === 0, count });
}
