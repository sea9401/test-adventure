import "server-only";

// 거래소 체결 상대는 공개 매물·거래 내역과 마찬가지로 우편함에서도 익명이다.
// 과거 데이터에는 구매자/판매자가 fromUserId/fromName 으로 저장돼 있을 수 있으므로
// 쓰기 경로뿐 아니라 조회 응답에서도 함께 가린다.
export const ANONYMOUS_MARKETPLACE_MAIL_KINDS = [
  "sale_proceeds",
  "purchase_item",
  "buy_order_equipment",
] as const;

export function isAnonymousMarketplaceMail(kind: string): boolean {
  return ANONYMOUS_MARKETPLACE_MAIL_KINDS.some(
    (anonymousKind) => anonymousKind === kind,
  );
}

export function visibleInboxSenderName(
  kind: string,
  fromName: string | null,
): string | null {
  return isAnonymousMarketplaceMail(kind) ? null : fromName;
}
