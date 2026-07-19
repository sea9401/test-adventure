import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { feedbackReports, users } from "@/db/schema";
import {
  currentAdminCapabilities,
  currentAdminEmail,
  requireAdmin,
} from "@/lib/server/isAdmin";
import { logAdminAction } from "@/lib/server/adminAudit";
import {
  deriveFeedbackAdminState,
  parseFeedbackAdminPatch,
  shouldNotifyFeedbackReply,
} from "@/lib/feedbackAdminUpdate";
import { insertNotification } from "@/lib/server/v2Notifications";

// GET /api/admin/feedback — 유저 건의사항 최신순 조회. requireAdmin 게이트.
//   ?limit=  (기본 100, 최대 500)
export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 100, 1), 500);

  const entries = await db
    .select({
      id: feedbackReports.id,
      userId: feedbackReports.userId,
      actorName: feedbackReports.actorName,
      currentGameName: users.gameName,
      email: users.email,
      category: feedbackReports.category,
      content: feedbackReports.content,
      imageKey: feedbackReports.imageKey,
      path: feedbackReports.path,
      status: feedbackReports.status,
      adminReply: feedbackReports.adminReply,
      reviewedAt: feedbackReports.reviewedAt,
      repliedAt: feedbackReports.repliedAt,
      createdAt: feedbackReports.createdAt,
    })
    .from(feedbackReports)
    .leftJoin(users, eq(users.id, feedbackReports.userId))
    .orderBy(desc(feedbackReports.id))
    .limit(limit);

  return Response.json({
    ok: true,
    entries: entries.map(({ imageKey, ...entry }) => ({
      ...entry,
      hasImage: Boolean(imageKey),
    })),
  });
}

// PATCH /api/admin/feedback — 확인 체크와 유저에게 공개되는 답변을 저장한다.
export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;
  const capabilities = await currentAdminCapabilities();
  if (!capabilities.reward && !capabilities.sanction) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const parsed = parseFeedbackAdminPatch(await req.json().catch(() => null));
  if (!parsed.ok) {
    return Response.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const [current] = await db
    .select({
      userId: feedbackReports.userId,
      adminReply: feedbackReports.adminReply,
      reviewedAt: feedbackReports.reviewedAt,
      repliedAt: feedbackReports.repliedAt,
      resolvedAt: feedbackReports.resolvedAt,
      status: feedbackReports.status,
    })
    .from(feedbackReports)
    .where(eq(feedbackReports.id, parsed.value.id))
    .limit(1);
  if (!current) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const next = deriveFeedbackAdminState(
    {
      adminReply: current.adminReply,
      reviewedAt: current.reviewedAt,
      repliedAt: current.repliedAt,
      resolvedAt: current.resolvedAt,
      status:
        current.status === "reviewed" || current.status === "resolved"
          ? current.status
          : "open",
    },
    parsed.value,
  );
  const [entry] = await db
    .update(feedbackReports)
    .set(next)
    .where(eq(feedbackReports.id, parsed.value.id))
    .returning({
      id: feedbackReports.id,
      status: feedbackReports.status,
      adminReply: feedbackReports.adminReply,
      reviewedAt: feedbackReports.reviewedAt,
      repliedAt: feedbackReports.repliedAt,
    });

  if (
    shouldNotifyFeedbackReply(
      current.adminReply,
      parsed.value,
      next.adminReply,
    )
  ) {
    await insertNotification(current.userId, "feedback_replied", {
      feedbackId: parsed.value.id,
    });
  }

  await logAdminAction({
    adminEmail: await currentAdminEmail(),
    action: parsed.value.reply === undefined ? "feedback.review" : "feedback.reply",
    targetUserId: current.userId,
    detail: {
      feedbackId: parsed.value.id,
      status: next.status,
      hasReply: Boolean(next.adminReply),
    },
  });
  return Response.json({ ok: true, entry });
}
