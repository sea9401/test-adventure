export type FeedbackEditState = {
  status: string;
  reviewedAt: unknown;
  repliedAt: unknown;
  adminReply: string | null;
};
export function canEditFeedback(entry: FeedbackEditState): boolean {
  return entry.status === "open" && entry.reviewedAt == null && entry.repliedAt == null && entry.adminReply == null;
}

const CATEGORIES = new Set(["suggestion", "bug", "balance", "ui", "other"]);
export function parseFeedbackUserEdit(raw: unknown):
  | {ok: true; value: {category: string; content: string}}
  | {ok: false; error: string} {
  if (!raw || typeof raw !== "object") return {ok:false,error:"invalid_request"};
  const body = raw as {category?: unknown; content?: unknown};
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (content.length < 5) return {ok:false,error:"too_short"};
  if (content.length > 1000) return {ok:false,error:"too_long"};
  if (typeof body.category !== "string" || !CATEGORIES.has(body.category)) return {ok:false,error:"bad_category"};
  return {ok:true,value:{category:body.category,content}};
}
