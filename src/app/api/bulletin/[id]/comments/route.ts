import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bulletinComments } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { resolveActor } from "@/lib/server/resolveActor";
import { canAccessBulletinPost } from "@/lib/server/bulletinAccess";
import {
  BULLETIN_COMMENT_MAX_LENGTH,
  BULLETIN_COMMENT_RATE_LIMIT_MS,
} from "@/lib/bulletin-config";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/bulletin/[id]/comments — 댓글 목록 (오래된 → 최신).
export async function GET(_req: Request, ctx: Ctx) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const { id: idStr } = await ctx.params;
  const postId = Number(idStr);
  if (!Number.isInteger(postId) || postId <= 0) {
    return new Response("invalid id", { status: 400 });
  }
  if (!(await canAccessBulletinPost(db, postId, userId))) {
    return new Response("not found", { status: 404 });
  }

  const rows = await db
    .select({
      id: bulletinComments.id,
      userId: bulletinComments.userId,
      name: bulletinComments.name,
      className: bulletinComments.className,
      content: bulletinComments.content,
      createdAt: bulletinComments.createdAt,
    })
    .from(bulletinComments)
    .where(eq(bulletinComments.postId, postId))
    .orderBy(asc(bulletinComments.createdAt));

  const result = rows.map((r) => ({
    id: r.id,
    name: r.name,
    className: r.className,
    content: r.content,
    createdAt: r.createdAt.getTime(),
    mine: r.userId === userId,
  }));

  return Response.json(result);
}

// POST /api/bulletin/[id]/comments — 댓글 작성. body: { content }.
export async function POST(req: Request, ctx: Ctx) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const { id: idStr } = await ctx.params;
  const postId = Number(idStr);
  if (!Number.isInteger(postId) || postId <= 0) {
    return new Response("invalid id", { status: 400 });
  }

  let body: { content?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return new Response("empty content", { status: 400 });
  if (content.length > BULLETIN_COMMENT_MAX_LENGTH) {
    return new Response(`too long (max ${BULLETIN_COMMENT_MAX_LENGTH})`, {
      status: 400,
    });
  }

  // 글 존재 + 접근권 확인 — 길드 전용 글은 같은 길드원만 댓글 가능.
  if (!(await canAccessBulletinPost(db, postId, userId))) {
    return new Response("not found", { status: 404 });
  }

  // rate limit — 본인 마지막 댓글 시각 기준. 글 작성보다 짧은 10초.
  const since = new Date(Date.now() - BULLETIN_COMMENT_RATE_LIMIT_MS);
  const [lastRow] = await db
    .select({ createdAt: bulletinComments.createdAt })
    .from(bulletinComments)
    .where(eq(bulletinComments.userId, userId))
    .orderBy(desc(bulletinComments.createdAt))
    .limit(1);
  if (lastRow && lastRow.createdAt > since) {
    return new Response("rate limited", { status: 429 });
  }

  const { name, className } = await resolveActor(userId);
  const [inserted] = await db
    .insert(bulletinComments)
    .values({ postId, userId, name, className, content })
    .returning({
      id: bulletinComments.id,
      createdAt: bulletinComments.createdAt,
    });

  return Response.json({
    id: inserted.id,
    name,
    className,
    content,
    createdAt: inserted.createdAt.getTime(),
    mine: true,
  });
}
