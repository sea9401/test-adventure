import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  bulletinComments,
  bulletinLikes,
  bulletinPosts,
  bulletinViews,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { resolveActor } from "@/lib/server/resolveActor";
import { isCurrentUserAdmin } from "@/lib/server/isAdmin";
import {
  BULLETIN_FETCH_LIMIT,
  BULLETIN_MAX_LENGTH,
  BULLETIN_RATE_LIMIT_MS,
  BULLETIN_TITLE_MAX_LENGTH,
  isBulletinCategory,
  USER_WRITABLE_CATEGORIES,
  type BulletinCategory,
} from "@/lib/bulletin-config";

// GET /api/bulletin?category=<cat>&q=<search>
//   category 미지정 — 전체 (탭 "전체" 용도, 클라가 안 쓰면 그대로 둠)
//   q — title/content 부분일치(ILIKE %q%). 짧은 입력은 클라에서 막아도 됨.
// 응답 — like/comment 카운트와 likedByMe 를 서브쿼리로 동봉 (N+1 회피).
export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const categoryParam = url.searchParams.get("category");
  const q = (url.searchParams.get("q") ?? "").trim();

  const filters: SQL[] = [];
  if (categoryParam && isBulletinCategory(categoryParam)) {
    filters.push(eq(bulletinPosts.category, categoryParam));
  }
  if (q) {
    // PG `ILIKE` 는 대소문자 무시. % 와 _ 는 사용자 입력 그대로 패턴 메타가 되므로
    // 안전을 위해 이스케이프해 리터럴 매칭으로 강제 — drizzle 의 ilike 도 결국 raw 패턴이라
    // 이 처리가 없으면 '%' 입력이 와일드카드처럼 동작한다.
    const escaped = q.replace(/[\\%_]/g, (m) => "\\" + m);
    const pattern = `%${escaped}%`;
    const titleMatch = ilike(bulletinPosts.title, pattern);
    const contentMatch = ilike(bulletinPosts.content, pattern);
    const combined = or(titleMatch, contentMatch);
    if (combined) filters.push(combined);
  }

  const where =
    filters.length === 0
      ? undefined
      : filters.length === 1
        ? filters[0]
        : and(...filters);

  // 글 본문 먼저 페치 — 카운트/likedByMe 는 postId 묶음으로 별도 쿼리.
  // (이전엔 각 행마다 3개 상관 서브쿼리가 돌아 N=30 글이면 90+ 쿼리. 4개로 정리.)
  const posts = await db
    .select({
      id: bulletinPosts.id,
      name: bulletinPosts.name,
      className: bulletinPosts.className,
      category: bulletinPosts.category,
      title: bulletinPosts.title,
      content: bulletinPosts.content,
      createdAt: bulletinPosts.createdAt,
      mine: bulletinPosts.userId,
    })
    .from(bulletinPosts)
    .where(where)
    .orderBy(desc(bulletinPosts.createdAt))
    .limit(BULLETIN_FETCH_LIMIT);

  if (posts.length === 0) return Response.json([]);

  const postIds = posts.map((p) => p.id);
  // 인덱스: bulletin_likes 는 PK(postId,userId), bulletin_comments 는
  // (postId, createdAt) — 셋 다 postId 가 선행 컬럼이라 GROUP/IN 모두 인덱스 스캔.
  const [likeCountRows, commentCountRows, viewCountRows, likedByMeRows] =
    await Promise.all([
      db
        .select({
          postId: bulletinLikes.postId,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(bulletinLikes)
        .where(inArray(bulletinLikes.postId, postIds))
        .groupBy(bulletinLikes.postId),
      db
        .select({
          postId: bulletinComments.postId,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(bulletinComments)
        .where(inArray(bulletinComments.postId, postIds))
        .groupBy(bulletinComments.postId),
      db
        .select({
          postId: bulletinViews.postId,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(bulletinViews)
        .where(inArray(bulletinViews.postId, postIds))
        .groupBy(bulletinViews.postId),
      db
        .select({ postId: bulletinLikes.postId })
        .from(bulletinLikes)
        .where(
          and(
            eq(bulletinLikes.userId, userId),
            inArray(bulletinLikes.postId, postIds),
          ),
        ),
    ]);

  const likeCountMap = new Map(likeCountRows.map((r) => [r.postId, r.count]));
  const commentCountMap = new Map(
    commentCountRows.map((r) => [r.postId, r.count]),
  );
  const viewCountMap = new Map(viewCountRows.map((r) => [r.postId, r.count]));
  const likedSet = new Set(likedByMeRows.map((r) => r.postId));

  const result = posts.map((r) => ({
    id: r.id,
    name: r.name,
    className: r.className,
    category: r.category as BulletinCategory,
    title: r.title,
    content: r.content,
    createdAt: r.createdAt.getTime(),
    mine: r.mine === userId,
    likeCount: likeCountMap.get(r.id) ?? 0,
    commentCount: commentCountMap.get(r.id) ?? 0,
    viewCount: viewCountMap.get(r.id) ?? 0,
    likedByMe: likedSet.has(r.id),
  }));

  return Response.json(result);
}

// POST /api/bulletin — 글 작성. body: { category, title?, content }
// notice 카테고리는 admin 만 가능 (403). 그 외 카테고리는 USER_WRITABLE_CATEGORIES 검증.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  let body: { category?: unknown; title?: unknown; content?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  if (!isBulletinCategory(body.category)) {
    return new Response("invalid category", { status: 400 });
  }
  const category: BulletinCategory = body.category;

  if (category === "notice") {
    const admin = await isCurrentUserAdmin();
    if (!admin) return new Response("forbidden", { status: 403 });
  } else if (!USER_WRITABLE_CATEGORIES.includes(category)) {
    // 방어 — 만약 notice/free/guide 외 신규 카테고리가 추가되고 USER_WRITABLE_CATEGORIES
    // 에 안 들어가 있으면 admin only 정책으로 기본 보수적 처리.
    const admin = await isCurrentUserAdmin();
    if (!admin) return new Response("forbidden", { status: 403 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return new Response("empty content", { status: 400 });
  if (content.length > BULLETIN_MAX_LENGTH) {
    return new Response(`too long (max ${BULLETIN_MAX_LENGTH})`, {
      status: 400,
    });
  }

  // title — 필수. 제목 + 본문 분리(목록 — 상세) UI 의 전제라 빈 제목 작성을 차단.
  // (옛 코드는 비우면 actor.title 로 fallback 했으나, 유저 의도가 반영된 제목만 받음.)
  const rawTitle =
    typeof body.title === "string" ? body.title.trim() : "";
  if (!rawTitle) return new Response("empty title", { status: 400 });
  if (rawTitle.length > BULLETIN_TITLE_MAX_LENGTH) {
    return new Response(`title too long (max ${BULLETIN_TITLE_MAX_LENGTH})`, {
      status: 400,
    });
  }
  const title = rawTitle;

  const { name, className } = await resolveActor(userId);

  // rate limit — 본인 마지막 글 시각 기준 X ms 이내면 차단.
  const since = new Date(Date.now() - BULLETIN_RATE_LIMIT_MS);
  const [lastRow] = await db
    .select({ createdAt: bulletinPosts.createdAt })
    .from(bulletinPosts)
    .where(eq(bulletinPosts.userId, userId))
    .orderBy(desc(bulletinPosts.createdAt))
    .limit(1);
  if (lastRow && lastRow.createdAt > since) {
    return new Response("rate limited", { status: 429 });
  }

  const [inserted] = await db
    .insert(bulletinPosts)
    .values({ userId, name, className, category, title, content })
    .returning({
      id: bulletinPosts.id,
      createdAt: bulletinPosts.createdAt,
    });

  return Response.json({
    id: inserted.id,
    name,
    className,
    category,
    title,
    content,
    createdAt: inserted.createdAt.getTime(),
    mine: true,
    likeCount: 0,
    commentCount: 0,
    viewCount: 0,
    likedByMe: false,
  });
}

// DELETE /api/bulletin?id=123 — 본인 글 + admin 은 모든 글 삭제 가능.
export async function DELETE(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const idStr = url.searchParams.get("id");
  const id = idStr ? Number(idStr) : NaN;
  if (!Number.isInteger(id) || id <= 0) {
    return new Response("invalid id", { status: 400 });
  }

  const admin = await isCurrentUserAdmin();
  const where = admin
    ? eq(bulletinPosts.id, id)
    : and(eq(bulletinPosts.id, id), eq(bulletinPosts.userId, userId));

  const result = await db
    .delete(bulletinPosts)
    .where(where)
    .returning({ id: bulletinPosts.id });

  if (result.length === 0) {
    return new Response("not found or not owner", { status: 404 });
  }

  return Response.json({ ok: true });
}
