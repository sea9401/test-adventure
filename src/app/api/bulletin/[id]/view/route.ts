import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bulletinViews } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { canAccessBulletinPost } from "@/lib/server/bulletinAccess";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/bulletin/[id]/view — 조회 기록(유저당 1회). 응답: { count }.
// 같은 유저 재방문은 (postId,userId) PK 충돌 → onConflictDoNothing 으로 흡수해
// 고유 조회수만 누적. 글이 없으면 404.
export async function POST(_req: Request, ctx: Ctx) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const { id: idStr } = await ctx.params;
  const postId = Number(idStr);
  if (!Number.isInteger(postId) || postId <= 0) {
    return new Response("invalid id", { status: 400 });
  }

  // 글 존재 + 접근권 확인 — 길드 전용 글은 같은 길드원만 조회 가능.
  if (!(await canAccessBulletinPost(db, postId, userId))) {
    return new Response("not found", { status: 404 });
  }

  await db
    .insert(bulletinViews)
    .values({ postId, userId })
    .onConflictDoNothing();

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(bulletinViews)
    .where(eq(bulletinViews.postId, postId));

  return Response.json({ count });
}
