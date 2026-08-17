export const UGC_SOURCE_TYPES = [
  "bulletin_post",
  "bulletin_comment",
  "chat_message",
  "inbox_message",
  "profile",
  "guild_profile",
  "chat_room",
  "marketplace_trade",
] as const;

export type UgcSourceType = (typeof UGC_SOURCE_TYPES)[number];
export type UgcReportSubject = "content" | "user";

// 정책 문구가 실질적으로 바뀔 때만 올린다. 서버 기록과 클라이언트 표시가 이 값을 공유한다.
export const UGC_POLICY_VERSION = "2026-08-08.v1";

export const CONTENT_REPORT_REASONS = [
  "harassment",
  "hate",
  "sexual",
  "violence",
  "spam",
  "fraud",
  "personal_info",
  "other",
] as const;

export const MARKETPLACE_TRADE_REPORT_REASONS = [
  "abnormal_price",
  "market_manipulation",
  "real_money_trade",
  "other",
] as const;

export const UGC_REPORT_REASONS = [
  "harassment",
  "hate",
  "sexual",
  "violence",
  "spam",
  "fraud",
  "personal_info",
  "abnormal_price",
  "market_manipulation",
  "real_money_trade",
  "other",
] as const;

export type UgcReportReason = (typeof UGC_REPORT_REASONS)[number];

export const UGC_REPORT_REASON_LABELS: Record<UgcReportReason, string> = {
  harassment: "괴롭힘 또는 모욕",
  hate: "혐오 표현",
  sexual: "성적 콘텐츠",
  violence: "폭력적이거나 위협적인 내용",
  spam: "도배 또는 광고",
  fraud: "사기 또는 기만",
  personal_info: "개인정보 노출",
  abnormal_price: "비정상적으로 높거나 낮은 가격",
  market_manipulation: "시세 조작 의심",
  real_money_trade: "현금 거래·계정 간 자산 이전 의심",
  other: "기타",
};

export function isUgcSourceType(value: unknown): value is UgcSourceType {
  return (
    typeof value === "string" &&
    UGC_SOURCE_TYPES.includes(value as UgcSourceType)
  );
}

export function normalizeUgcSourceId(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}

export function isUgcReportSubject(
  value: unknown,
): value is UgcReportSubject {
  return value === "content" || value === "user";
}

export function isUgcReportReason(value: unknown): value is UgcReportReason {
  return (
    typeof value === "string" &&
    UGC_REPORT_REASONS.includes(value as UgcReportReason)
  );
}

export function isAllowedUgcReportReason(
  sourceType: UgcSourceType,
  value: unknown,
): value is UgcReportReason {
  if (typeof value !== "string") return false;
  const allowed: readonly string[] =
    sourceType === "marketplace_trade"
      ? MARKETPLACE_TRADE_REPORT_REASONS
      : CONTENT_REPORT_REASONS;
  return allowed.includes(value);
}
