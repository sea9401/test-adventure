import {
  isTradeSuspensionMessagePayload,
  tradeSuspensionMessage,
} from "@/lib/tradeSuspension";

const ERROR_LABELS: Record<string, string> = {
  slot_full: "활성 매물이 가득 찼어요.",
  not_owned: "보유하지 않은 장비예요.",
  not_tradable: "거래할 수 없는 품목이에요.",
  secret_shop_used: "품목을 구매한 비밀상점 지도는 등록할 수 없어요.",
  bound: "귀속된 장비는 거래할 수 없어요.",
  locked: "잠긴 장비는 등록할 수 없어요.",
  equipped: "장착 중인 장비는 등록할 수 없어요.",
  insufficient_material: "재료 수량이 부족해요.",
  insufficient_gold: "골드가 부족해요.",
  own_listing: "내 매물은 구매할 수 없어요.",
  not_available: "이미 팔리거나 취소된 매물이에요.",
  not_found: "매물을 찾을 수 없어요.",
  not_active: "이미 종료된 매물이에요.",
  not_owner: "내 매물이 아니에요.",
  bad_grace_hours: "판매 방식 또는 입찰 유예 시간을 확인해 주세요.",
  bad_price: "가격은 1~999,999,999골드 사이여야 해요.",
  insufficient_stock: "구매 가능한 수량이 부족해요.",
  price_changed: "가격이나 재고가 바뀌었어요. 새 견적을 확인해 주세요.",
  bad_bid: "입찰 금액을 확인해 주세요.",
  bid_too_low: "현재 최고가보다 최소 5% 높은 금액을 입력하세요.",
  bidding_closed: "입찰 유예가 종료됐어요.",
  buy_pending: "입찰 유예 중에는 즉시구매할 수 없어요.",
  auction_locked: "즉시구매가를 초과해 입찰 판매가 확정된 매물이에요.",
  has_bids: "입찰이 시작된 매물은 취소할 수 없어요.",
  cannot_reprice: "입찰이 시작됐거나 경매 중인 매물은 가격을 바꿀 수 없어요.",
  order_limit: "활성 구매 주문은 최대 10개까지 등록할 수 있어요.",
  alert_limit: "활성 가격 알림은 최대 20개까지 등록할 수 있어요.",
  bad_days: "주문 기간은 1~7일로 설정해 주세요.",
  bad_quantity: "주문 수량을 확인해 주세요.",
  bad_min_power: "최소 위력은 1 이상의 정수로 입력해 주세요.",
  bad_min_quality: "최소 품질은 0~100 사이의 정수로 입력해 주세요.",
  no_matching_order: "이 장비 조건에 맞는 구매 주문이 없거나 이미 체결됐어요.",
  bad_iids: "일괄 판매할 장비는 한 번에 1~10개까지 선택해 주세요.",
};

export type MarketplaceActionErrorPayload = {
  error?: string;
  reason?: string;
  expiresAt?: string;
  permanent?: boolean;
  retryAfterSec?: number;
  slotLimit?: number;
  minimumPrice?: number;
};

export function marketplaceActionErrorLabel(
  payload: MarketplaceActionErrorPayload | null,
  status: number,
): string {
  if (isTradeSuspensionMessagePayload(payload)) {
    return tradeSuspensionMessage(payload);
  }
  const error = payload?.error;
  if (error === "rate_limited") {
    return `요청이 많아요. ${Math.max(1, Math.floor(payload?.retryAfterSec ?? 1))}초 후 다시 시도하세요.`;
  }
  if (error === "slot_full" && typeof payload?.slotLimit === "number") {
    return `활성 매물이 가득 찼어요 (최대 ${payload.slotLimit}개).`;
  }
  if (
    error === "price_below_floor" &&
    typeof payload?.minimumPrice === "number"
  ) {
    return `장비 구매 주문은 NPC 매입가 ${payload.minimumPrice.toLocaleString()}골드 이상이어야 해요.`;
  }
  return ERROR_LABELS[error ?? ""] ?? error ?? `실패 (${status})`;
}
