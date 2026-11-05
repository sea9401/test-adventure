// 교환소 수량 구매 공용 규칙. 서버 검증과 화면 입력칸이 같은 값을 쓴다.

export const SHOP_MAX_QUANTITY = 999;

/** 요청 본문의 수량. 없으면 1개, 잘못된 값이면 null(400 응답). */
export function parseShopQuantity(raw: unknown): number | null {
  if (raw === undefined) return 1;
  return typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= 1 &&
    raw <= SHOP_MAX_QUANTITY
    ? raw
    : null;
}

/** 재화로 살 수 있는 수·남은 횟수 등 상한들 중 가장 작은 정수. */
export function maxShopQuantity(...caps: number[]): number {
  return Math.max(0, Math.floor(Math.min(SHOP_MAX_QUANTITY, ...caps)));
}

export function clampShopQuantity(value: number, max: number): number {
  return Math.max(1, Math.min(value, max));
}

export function staminaPotionPurchaseMessage(response: {
  quantity?: unknown;
}): string {
  return typeof response.quantity === "number" && response.quantity > 1
    ? `스태미나 회복약 ${response.quantity}개를 구매했다.`
    : "스태미나 회복약을 구매했다.";
}
