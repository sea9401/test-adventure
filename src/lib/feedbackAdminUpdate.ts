export const FEEDBACK_ADMIN_REPLY_MAX = 2_000;

export type FeedbackAdminPatch = {
  id: number;
  reviewed?: boolean;
  reply?: string;
};

export type FeedbackAdminState = {
  adminReply: string | null;
  reviewedAt: Date | null;
  repliedAt: Date | null;
  resolvedAt: Date | null;
  status: "open" | "reviewed" | "resolved";
};

export function parseFeedbackAdminPatch(
  raw: unknown,
): { ok: true; value: FeedbackAdminPatch } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "bad_request" };
  const body = raw as { id?: unknown; reviewed?: unknown; reply?: unknown };
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "bad_id" };

  const hasReviewed = Object.prototype.hasOwnProperty.call(body, "reviewed");
  const hasReply = Object.prototype.hasOwnProperty.call(body, "reply");
  if (!hasReviewed && !hasReply) return { ok: false, error: "no_changes" };
  if (hasReviewed && typeof body.reviewed !== "boolean") {
    return { ok: false, error: "bad_reviewed" };
  }
  if (hasReply && typeof body.reply !== "string") {
    return { ok: false, error: "bad_reply" };
  }

  const reply = typeof body.reply === "string" ? body.reply.trim() : undefined;
  if (reply !== undefined && reply.length > FEEDBACK_ADMIN_REPLY_MAX) {
    return { ok: false, error: "reply_too_long" };
  }
  return {
    ok: true,
    value: {
      id,
      ...(hasReviewed ? { reviewed: body.reviewed as boolean } : {}),
      ...(hasReply ? { reply } : {}),
    },
  };
}

export function deriveFeedbackAdminState(
  current: FeedbackAdminState,
  patch: FeedbackAdminPatch,
  now = new Date(),
): FeedbackAdminState {
  const replyChanged = patch.reply !== undefined;
  const patchedReply = patch.reply?.trim();
  const adminReply = replyChanged ? patchedReply || null : current.adminReply;
  let reviewedAt =
    patch.reviewed === undefined
      ? current.reviewedAt
      : patch.reviewed
        ? current.reviewedAt ?? now
        : null;

  if (adminReply) reviewedAt ??= now;
  const repliedAt = replyChanged
    ? adminReply
      ? now
      : null
    : current.repliedAt;
  const status = adminReply ? "resolved" : reviewedAt ? "reviewed" : "open";
  const resolvedAt = adminReply ? current.resolvedAt ?? now : null;

  return { adminReply, reviewedAt, repliedAt, resolvedAt, status };
}

export function shouldNotifyFeedbackReply(
  currentReply: string | null,
  patch: FeedbackAdminPatch,
  nextReply: string | null,
): boolean {
  return (
    patch.reply !== undefined &&
    nextReply !== null &&
    nextReply !== currentReply
  );
}
