// 생활 축제 화면이 쓰는 응답 타입·요청·오류 문구. 서버 응답 모양은 /api/v2/life-festival 과 같다.

import type {
  LifeFestivalActivity,
  LifeFestivalRequirement,
  LifeFestivalThemeId,
} from "@/adventure/data/v2/lifeFestival";

export type LifeFestivalOrderView = {
  id: string;
  pool: LifeFestivalThemeId | "general";
  requirement: LifeFestivalRequirement;
  label: string;
  baseTokens: number;
  delivered: number;
  nextMultiplier: number;
  held: number;
};

export type LifeFestivalDishOptionView = {
  foodId: string;
  name: string;
  tier: number;
  quality: "normal" | "careful" | "masterpiece" | "signature";
  count: number;
};

export type LifeFestivalShopView = {
  id: string;
  name: string;
  description: string;
  tokenCost: number;
  weeklyLimit: number | null;
  purchased: number;
  owned: boolean;
};

export type LifeFestivalViewData = {
  weekId: string;
  endsAt: string;
  theme: {
    id: LifeFestivalThemeId;
    name: string;
    activity: LifeFestivalActivity;
    activityName: string;
    effectText: string;
  };
  tokens: number;
  weeklyScore: number;
  myRank: number | null;
  orders: LifeFestivalOrderView[];
  dishOptions: Record<string, LifeFestivalDishOptionView[]>;
  shop: LifeFestivalShopView[];
};

export type LifeFestivalRankingData = {
  weekId: string;
  top: { rank: number; userId: string; name: string; score: number }[];
  me: { rank: number; score: number } | null;
};

const ERROR_LABELS: Record<string, string> = {
  not_enough_items: "재료가 부족합니다.",
  invalid_food_selection: "고른 요리가 주문 조건과 맞지 않습니다.",
  order_not_active: "이번 주 주문이 바뀌었습니다. 새로고침해 주세요.",
  invalid_times: "납품 횟수를 다시 확인해 주세요.",
  not_enough_tokens: "축제 증표가 부족합니다.",
  weekly_limit: "이번 주 구매 한도에 닿았습니다.",
  already_owned: "이미 가지고 있습니다.",
  unknown_item: "판매하지 않는 상품입니다.",
};

export function lifeFestivalErrorLabel(error: unknown): string {
  return (typeof error === "string" && ERROR_LABELS[error]) || "요청을 처리하지 못했습니다.";
}

export function remainingTimeLabel(endsAt: string, now: number): string {
  const ms = Math.max(0, Date.parse(endsAt) - now);
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}일 ${hours % 24}시간 남음`;
  if (hours > 0) return `${hours}시간 남음`;
  return `${Math.max(1, Math.ceil(ms / 60_000))}분 남음`;
}

/** 걸작은 주문이 걸작을 요구할 때만 기본 선택에 넣는다. */
export function defaultDishSelection(
  options: readonly LifeFestivalDishOptionView[],
  quantity: number,
  allowMasterpiece: boolean,
): Record<string, number> {
  const selection: Record<string, number> = {};
  let remaining = quantity;
  for (const option of options) {
    if (remaining <= 0) break;
    if ((option.quality === "masterpiece" || option.quality === "signature") && !allowMasterpiece) continue;
    const take = Math.min(option.count, remaining);
    selection[option.foodId] = take;
    remaining -= take;
  }
  return selection;
}
