import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { feedbackReports } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { FEEDBACK_IMAGE_MAX_BYTES } from "@/lib/feedbackImage";
import { processFeedbackImage } from "@/lib/server/feedbackImage";
import {
  deleteFeedbackImage,
  isFeedbackImageStorageConfigured,
  uploadFeedbackImage,
} from "@/lib/server/feedbackImageStorage";
import { resolveActor } from "@/lib/server/resolveActor";

const CONTENT_MIN = 5;
const CONTENT_MAX = 1000;
const PATH_MAX = 240;
const RATE_LIMIT_MS = 60_000;
const MAX_MULTIPART_BYTES = FEEDBACK_IMAGE_MAX_BYTES + 256 * 1024;
const CATEGORIES = new Set(["suggestion", "bug", "balance", "ui", "other"]);
const FEEDBACK_SELECTION = {
  id: feedbackReports.id,
  category: feedbackReports.category,
  content: feedbackReports.content,
  imageKey: feedbackReports.imageKey,
  status: feedbackReports.status,
  adminReply: feedbackReports.adminReply,
  reviewedAt: feedbackReports.reviewedAt,
  repliedAt: feedbackReports.repliedAt,
  createdAt: feedbackReports.createdAt,
};

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

// GET /api/feedback — 로그인 유저 본인의 최근 건의와 공개 답변을 조회한다.
export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const rawTargetId = new URL(req.url).searchParams.get("targetId");
  const parsedTargetId = Number(rawTargetId);
  const targetId =
    rawTargetId !== null &&
    Number.isSafeInteger(parsedTargetId) &&
    parsedTargetId > 0
      ? parsedTargetId
      : null;
  const recentEntries = await db
    .select(FEEDBACK_SELECTION)
    .from(feedbackReports)
    .where(eq(feedbackReports.userId, userId))
    .orderBy(desc(feedbackReports.id))
    .limit(50);
  let entries = recentEntries;
  if (targetId && !recentEntries.some((entry) => entry.id === targetId)) {
    const [target] = await db
      .select(FEEDBACK_SELECTION)
      .from(feedbackReports)
      .where(
        and(
          eq(feedbackReports.userId, userId),
          eq(feedbackReports.id, targetId),
        ),
      )
      .limit(1);
    if (target) {
      entries = [...recentEntries, target].sort((left, right) => right.id - left.id);
    }
  }

  return Response.json({
    ok: true,
    entries: entries.map(({ imageKey, ...entry }) => ({
      ...entry,
      hasImage: Boolean(imageKey),
    })),
  });
}

// POST /api/feedback — 설정 메뉴의 건의사항 접수.
// 로그인 유저만 가능하며, 원문/카테고리/현재 경로/당시 표시 이름을 보존한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let body: {
    category?: unknown;
    content?: unknown;
    path?: unknown;
    image?: unknown;
  };
  try {
    if (contentType.startsWith("multipart/form-data")) {
      const contentLength = Number(req.headers.get("content-length"));
      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_MULTIPART_BYTES
      ) {
        return Response.json(
          { ok: false, error: "image_too_large" },
          { status: 413 },
        );
      }
      const formData = await req.formData();
      body = {
        category: formData.get("category"),
        content: formData.get("content"),
        path: formData.get("path"),
        image: formData.get("image"),
      };
    } else {
      body = (await req.json()) as typeof body;
    }
  } catch {
    return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
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

  let imageKey: string | null = null;
  if (body.image instanceof File && body.image.size > 0) {
    if (!isFeedbackImageStorageConfigured()) {
      return Response.json(
        { ok: false, error: "storage_unavailable" },
        { status: 503 },
      );
    }
    const processed = await processFeedbackImage(body.image);
    if (!processed.ok) {
      return Response.json(
        { ok: false, error: processed.error },
        { status: processed.error === "image_too_large" ? 413 : 400 },
      );
    }
    try {
      imageKey = await uploadFeedbackImage(processed.bytes);
    } catch (error) {
      console.error("feedback image R2 upload failed", error);
      return Response.json(
        { ok: false, error: "storage_error" },
        { status: 502 },
      );
    }
  }

  const actor = await resolveActor(userId);
  let inserted: { id: number };
  try {
    [inserted] = await db
      .insert(feedbackReports)
      .values({
        userId,
        actorName: actor.name,
        category: normalizeCategory(body.category),
        content,
        imageKey,
        path: normalizePath(body.path),
      })
      .returning({ id: feedbackReports.id });
  } catch (error) {
    if (imageKey) {
      try {
        await deleteFeedbackImage(imageKey);
      } catch (cleanupError) {
        console.error("feedback image cleanup failed", cleanupError);
      }
    }
    throw error;
  }

  return Response.json({ ok: true, id: inserted.id });
}
