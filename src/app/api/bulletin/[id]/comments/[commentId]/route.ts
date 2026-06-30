import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bulletinComments } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { isCurrentUserAdmin } from "@/lib/server/isAdmin";
import { canAccessBulletinPost } from "@/lib/server/bulletinAccess";

type Ctx = { params: Promise<{ id: string; commentId: string }> };

// DELETE /api/bulletin/[id]/comments/[commentId] — 본인 + admin 가능.
// 경로의 [id] (postId) 는 URL 일관성 + 클라 호출 편의용. 실제 검증은 commentId.userId.
export async function DELETE(_req: Request, ctx: Ctx) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const { id: postIdStr, commentId: idStr } = await ctx.params;
  const postId = Number(postIdStr);
  const commentId = Number(idStr);
  if (
    !Number.isInteger(postId) ||
    postId <= 0 ||
    !Number.isInteger(commentId) ||
    commentId <= 0
  ) {
    return new Response("invalid id", { status: 400 });
  }

  const admin = await isCurrentUserAdmin();
  if (!admin && !(await canAccessBulletinPost(db, postId, userId))) {
    return new Response("not found or not owner", { status: 404 });
  }
  const where = admin
    ? eq(bulletinComments.id, commentId)
    : and(
        eq(bulletinComments.postId, postId),
        eq(bulletinComments.id, commentId),
        eq(bulletinComments.userId, userId),
      );

  const result = await db
    .delete(bulletinComments)
    .where(where)
    .returning({ id: bulletinComments.id });

  if (result.length === 0) {
    return new Response("not found or not owner", { status: 404 });
  }

  return Response.json({ ok: true });
}
