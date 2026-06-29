import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { feedbackReports } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { resolveActor } from "@/lib/server/resolveActor";

const CONTENT_MIN = 5;
const CONTENT_MAX = 1000;
const PATH_MAX = 240;
const RATE_LIMIT_MS = 60_000;
const CATEGORIES = new Set(["suggestion", "bug", "balance", "ui", "other"]);

function normalizeCategory(value: unknown) {
  return typeof value === "string" && CATEGORIES.has(value)
    ? value
    : "suggestion";
}

function normalizePath(value: unknown) {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path || !path.startsWith("/")) return null;
  return path.slice(0, PATH_MAX);
}

// POST /api/feedback — 설정 메뉴의 건의사항 접수.
// 로그인 유저만 가능하며, 원문/카테고리/현재 경로/당시 표시 이름을 보존한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { category?: unknown; content?: unknown; path?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const content =
    typeof body.content === "string" ? body.content.trim() : "";
  if (content.length < CONTENT_MIN) {
    return Response.json({ ok: false, error: "too_short" }, { status: 400 });
  }
  if (content.length > CONTENT_MAX) {
    return Response.json({ ok: false, error: "too_long" }, { status: 400 });
  }

  const [last] = await db
    .select({ createdAt: feedbackReports.createdAt })
    .from(feedbackReports)
    .where(eq(feedbackReports.userId, userId))
    .orderBy(desc(feedbackReports.createdAt))
    .limit(1);
  if (last && last.createdAt.getTime() > Date.now() - RATE_LIMIT_MS) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const actor = await resolveActor(userId);
  const [inserted] = await db
    .insert(feedbackReports)
    .values({
      userId,
      actorName: actor.name,
      category: normalizeCategory(body.category),
      content,
      path: normalizePath(body.path),
    })
    .returning({ id: feedbackReports.id });

  return Response.json({ ok: true, id: inserted.id });
}
