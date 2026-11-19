// 행상 파견의 세이브와 상태 전이. 산물 차감과 교환 품목 지급은 서버가 하고, 여기서는 행상 세이브만 다룬다.
// 화면도 읽는 순수 모듈.

import { PEDDLER_MASTER_TITLE_ID, PEDDLER_REGULAR_TITLE_ID } from "@/adventure/data/titles";
import {
  PEDDLER_MASTER_TITLE_TOTAL_RANK,
  PEDDLER_MIN_CARGO_POINTS,
  PEDDLER_REGULAR_TITLE_TOTAL_RANK,
  PEDDLER_ROUTE_IDS,
  PEDDLER_ROUTES,
  PEDDLER_SHOP_QUANTITY_LIMIT,
  isPeddlerDispatchHours,
  peddlerCapacityForRank,
  peddlerRankForPoints,
  peddlerShopItem,
  peddlerTokenReward,
  type PeddlerDispatchHours,
  type PeddlerRouteId,
  type PeddlerShopItem,
  type PeddlerShopItemId,
} from "./peddlerRules";

export const PEDDLER_SAVE_KEY = "peddler.v1";

const HOUR_MS = 60 * 60 * 1000;

export type PeddlerDispatch = {
  hours: PeddlerDispatchHours;
  startedAt: number;
  readyAt: number;
  /** 실은 적재 점수. 받을 때 교역 점수로 들어온다. */
  points: number;
  /** 출발할 때 정해 둔 증표. */
  tokens: number;
};

export type PeddlerRouteState = { standingPoints: number; dispatch: PeddlerDispatch | null };

export type PeddlerState = {
  version: 1;
  tokens: number;
  tokensEarnedTotal: number;
  /** 증표 계산의 나머지. 다음 파견에 이월한다. */
  tokenCarry: number;
  routes: Record<PeddlerRouteId, PeddlerRouteState>;
  shop: { weekId: string; purchases: Partial<Record<PeddlerShopItemId, number>> };
  dispatchCount: number;
};

export function emptyPeddlerState(weekId: string): PeddlerState {
  return {
    version: 1,
    tokens: 0,
    tokensEarnedTotal: 0,
    tokenCarry: 0,
    routes: Object.fromEntries(
      PEDDLER_ROUTE_IDS.map((id) => [id, { standingPoints: 0, dispatch: null }]),
    ) as Record<PeddlerRouteId, PeddlerRouteState>,
    shop: { weekId, purchases: {} },
    dispatchCount: 0,
  };
}

function record(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function count(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
}

function parseDispatch(raw: unknown): PeddlerDispatch | null {
  const value = record(raw);
  const points = count(value.points);
  const startedAt = count(value.startedAt);
  const readyAt = count(value.readyAt);
  if (!isPeddlerDispatchHours(value.hours) || points <= 0 || readyAt <= 0 || readyAt < startedAt) return null;
  return { hours: value.hours, startedAt, readyAt, points, tokens: count(value.tokens) };
}

/** 주가 바뀌었으면 주간 구매 기록만 비운다. 증표와 교역 점수는 남는다. */
export function parsePeddlerState(raw: unknown, weekId: string): PeddlerState {
  const value = record(raw);
  const routesRaw = record(value.routes);
  const shopRaw = record(value.shop);
  const purchasesRaw = shopRaw.weekId === weekId ? record(shopRaw.purchases) : {};
  const purchases: PeddlerState["shop"]["purchases"] = {};
  for (const [id, bought] of Object.entries(purchasesRaw)) {
    const item = peddlerShopItem(id);
    if (item && count(bought) > 0) purchases[item.id] = count(bought);
  }
  return {
    version: 1,
    tokens: count(value.tokens),
    tokensEarnedTotal: count(value.tokensEarnedTotal),
    tokenCarry: count(value.tokenCarry),
    routes: Object.fromEntries(
      PEDDLER_ROUTE_IDS.map((id) => {
        const route = record(routesRaw[id]);
        return [id, { standingPoints: count(route.standingPoints), dispatch: parseDispatch(route.dispatch) }];
      }),
    ) as Record<PeddlerRouteId, PeddlerRouteState>,
    shop: { weekId, purchases },
    dispatchCount: count(value.dispatchCount),
  };
}

export function peddlerRouteRank(state: PeddlerState, routeId: PeddlerRouteId): number {
  return peddlerRankForPoints(state.routes[routeId].standingPoints);
}

export function peddlerTotalRank(state: PeddlerState): number {
  return PEDDLER_ROUTE_IDS.reduce((sum, id) => sum + peddlerRouteRank(state, id), 0);
}

export function peddlerRouteCapacity(state: PeddlerState, routeId: PeddlerRouteId): number {
  return peddlerCapacityForRank(peddlerRouteRank(state, routeId));
}

export function peddlerRouteUnlocked(state: PeddlerState, routeId: PeddlerRouteId): boolean {
  const unlock = PEDDLER_ROUTES.find((route) => route.id === routeId)!.unlock;
  switch (unlock.kind) {
    case "start":
      return true;
    case "route_rank":
      return peddlerRouteRank(state, unlock.routeId) >= unlock.rank;
    case "total_rank":
      return peddlerTotalRank(state) >= unlock.rank;
  }
}

export type PeddlerDispatchError = "route_locked" | "route_busy" | "cargo_too_small" | "over_capacity";

/** 수레를 보낸다. 받을 증표를 여기서 정하고 나머지는 이월한다. 산물 차감은 호출부가 한다. */
export function startPeddlerDispatch(
  state: PeddlerState,
  input: {
    routeId: PeddlerRouteId;
    hours: PeddlerDispatchHours;
    points: number;
    preferredPoints: number;
    now: number;
  },
): { state: PeddlerState; tokens: number } | { error: PeddlerDispatchError } {
  const route = state.routes[input.routeId];
  if (!peddlerRouteUnlocked(state, input.routeId)) return { error: "route_locked" };
  if (route.dispatch) return { error: "route_busy" };
  if (input.points < PEDDLER_MIN_CARGO_POINTS) return { error: "cargo_too_small" };
  if (input.points > peddlerRouteCapacity(state, input.routeId)) return { error: "over_capacity" };

  const reward = peddlerTokenReward({
    points: input.points,
    preferredPoints: Math.min(input.points, Math.max(0, input.preferredPoints)),
    hours: input.hours,
    carry: state.tokenCarry,
  });
  return {
    tokens: reward.tokens,
    state: {
      ...state,
      tokenCarry: reward.carry,
      routes: {
        ...state.routes,
        [input.routeId]: {
          ...route,
          dispatch: {
            hours: input.hours,
            startedAt: input.now,
            readyAt: input.now + input.hours * HOUR_MS,
            points: input.points,
            tokens: reward.tokens,
          },
        },
      },
    },
  };
}

export type PeddlerClaimResult = {
  state: PeddlerState;
  tokens: number;
  points: number;
  rankBefore: number;
  rankAfter: number;
  totalRankBefore: number;
  totalRankAfter: number;
};

/** 도착한 수레의 증표와 교역 점수를 받는다. */
export function claimPeddlerDispatch(
  state: PeddlerState,
  routeId: PeddlerRouteId,
  now: number,
): PeddlerClaimResult | { error: "no_dispatch" | "not_ready" } {
  const route = state.routes[routeId];
  const dispatch = route.dispatch;
  if (!dispatch) return { error: "no_dispatch" };
  if (now < dispatch.readyAt) return { error: "not_ready" };

  const next: PeddlerState = {
    ...state,
    tokens: state.tokens + dispatch.tokens,
    tokensEarnedTotal: state.tokensEarnedTotal + dispatch.tokens,
    dispatchCount: state.dispatchCount + 1,
    routes: {
      ...state.routes,
      [routeId]: { standingPoints: route.standingPoints + dispatch.points, dispatch: null },
    },
  };
  return {
    state: next,
    tokens: dispatch.tokens,
    points: dispatch.points,
    rankBefore: peddlerRouteRank(state, routeId),
    rankAfter: peddlerRouteRank(next, routeId),
    totalRankBefore: peddlerTotalRank(state),
    totalRankAfter: peddlerTotalRank(next),
  };
}

export type PeddlerBuyError = "unknown_item" | "invalid_quantity" | "not_enough_tokens" | "weekly_limit";

/** 증표로 교환한다. 지급은 호출부가 한다. state는 이번 주로 파싱된 값이어야 한다. */
export function buyPeddlerShopItem(
  state: PeddlerState,
  itemId: unknown,
  quantity: unknown,
): { state: PeddlerState; item: PeddlerShopItem; quantity: number } | { error: PeddlerBuyError } {
  const item = peddlerShopItem(itemId);
  if (!item) return { error: "unknown_item" };
  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > PEDDLER_SHOP_QUANTITY_LIMIT
  ) {
    return { error: "invalid_quantity" };
  }
  const bought = state.shop.purchases[item.id] ?? 0;
  if (item.weeklyLimit !== null && bought + quantity > item.weeklyLimit) return { error: "weekly_limit" };
  const cost = item.tokenCost * quantity;
  if (state.tokens < cost) return { error: "not_enough_tokens" };
  return {
    item,
    quantity,
    state: {
      ...state,
      tokens: state.tokens - cost,
      shop: { ...state.shop, purchases: { ...state.shop.purchases, [item.id]: bought + quantity } },
    },
  };
}

/** 교역 등급 합계로 얻는 칭호. */
export function peddlerEarnedTitleIds(totalRank: number): string[] {
  return [
    ...(totalRank >= PEDDLER_REGULAR_TITLE_TOTAL_RANK ? [PEDDLER_REGULAR_TITLE_ID] : []),
    ...(totalRank >= PEDDLER_MASTER_TITLE_TOTAL_RANK ? [PEDDLER_MASTER_TITLE_ID] : []),
  ];
}
