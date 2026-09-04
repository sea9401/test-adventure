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
  own_listing: "내 경매에는 입찰할 수 없어요.",
  not_available: "이미 팔리거나 취소된 매물이에요.",
  not_found: "매물을 찾을 수 없어요.",
  not_active: "이미 종료된 매물이에요.",
  not_owner: "내 매물이 아니에요.",
  bad_price: "가격은 1~999,999,999골드 사이여야 해요.",
  bad_bid: "입찰 금액을 확인해 주세요.",
  bid_too_low: "다음 최소 입찰가 이상을 입력하세요.",
  bidding_closed: "경매 입찰이 종료됐어요.",
  has_bids: "입찰이 시작된 매물은 취소할 수 없어요.",
  alert_limit: "활성 가격 알림은 최대 20개까지 등록할 수 있어요.",
  marketplace_feature_retired: "이 거래 기능은 종료됐어요. 경매를 이용해 주세요.",
};

export type MarketplaceActionErrorPayload = {
  error?: string;
  reason?: string;
  expiresAt?: string;
  permanent?: boolean;
  retryAfterSec?: number;
  slotLimit?: number;
  nextBid?: number;
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
  if (error === "bid_too_low" && typeof payload?.nextBid === "number") {
    return `다음 최소 입찰가는 ${payload.nextBid.toLocaleString()}골드예요.`;
  }
  return ERROR_LABELS[error ?? ""] ?? error ?? `실패 (${status})`;
}
