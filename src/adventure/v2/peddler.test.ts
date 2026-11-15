import { describe, expect, it } from "vitest";
import {
  buyPeddlerShopItem,
  claimPeddlerDispatch,
  emptyPeddlerState,
  parsePeddlerState,
  peddlerEarnedTitleIds,
  peddlerRouteCapacity,
  peddlerRouteRank,
  peddlerRouteUnlocked,
  peddlerTotalRank,
  startPeddlerDispatch,
  type PeddlerState,
} from "./peddler";
import { PEDDLER_MASTER_TITLE_ID, PEDDLER_REGULAR_TITLE_ID } from "@/adventure/data/titles";

const WEEK = "2026-11-09";
const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

function withStanding(points: Partial<Record<"river" | "ridge" | "harbor", number>>): PeddlerState {
  const state = emptyPeddlerState(WEEK);
  return {
    ...state,
    routes: {
      river: { ...state.routes.river, standingPoints: points.river ?? 0 },
      ridge: { ...state.routes.ridge, standingPoints: points.ridge ?? 0 },
      harbor: { ...state.routes.harbor, standingPoints: points.harbor ?? 0 },
    },
  };
}

function started(state: PeddlerState, input: Partial<Parameters<typeof startPeddlerDispatch>[1]> = {}) {
  const result = startPeddlerDispatch(state, {
    routeId: "river",
    hours: 8,
    points: 2_000,
    preferredPoints: 0,
    now: NOW,
    ...input,
  });
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("행상 세이브 파싱", () => {
  it("빈 값은 처음 상태가 된다", () => {
    expect(parsePeddlerState(null, WEEK)).toEqual(emptyPeddlerState(WEEK));
  });

  it("주가 바뀌면 주간 구매 기록만 비운다", () => {
    const state: PeddlerState = {
      ...withStanding({ river: 7_000 }),
      tokens: 55,
      shop: { weekId: "2026-11-02", purchases: { master_crop: 5 } },
    };
    const parsed = parsePeddlerState(state, WEEK);
    expect(parsed.shop).toEqual({ weekId: WEEK, purchases: {} });
    expect(parsed.tokens).toBe(55);
    expect(parsed.routes.river.standingPoints).toBe(7_000);
  });

  it("깨진 파견 기록은 버린다", () => {
    const parsed = parsePeddlerState(
      { routes: { river: { standingPoints: -5, dispatch: { hours: 5, readyAt: "x" } } }, tokens: "9" },
      WEEK,
    );
    expect(parsed.routes.river).toEqual({ standingPoints: 0, dispatch: null });
    expect(parsed.tokens).toBe(0);
  });
});

describe("행상 교역로", () => {
  it("단골 점수로 등급과 적재량이 정해진다", () => {
    const state = withStanding({ river: 32_000, ridge: 6_000 });
    expect(peddlerRouteRank(state, "river")).toBe(3);
    expect(peddlerRouteCapacity(state, "river")).toBe(2_600);
    expect(peddlerTotalRank(state)).toBe(4);
  });

  it("둘째 교역로는 첫 교역로 3등급, 셋째는 합계 10등급에 열린다", () => {
    expect(peddlerRouteUnlocked(emptyPeddlerState(WEEK), "river")).toBe(true);
    expect(peddlerRouteUnlocked(withStanding({ river: 31_999 }), "ridge")).toBe(false);
    expect(peddlerRouteUnlocked(withStanding({ river: 32_000 }), "ridge")).toBe(true);
    expect(peddlerRouteUnlocked(withStanding({ river: 90_000, ridge: 56_000 }), "harbor")).toBe(false);
    expect(peddlerRouteUnlocked(withStanding({ river: 90_000, ridge: 90_000 }), "harbor")).toBe(true);
  });
});

describe("행상 파견", () => {
  it("출발하면 받을 증표와 도착 시각을 굳힌다", () => {
    const { state, tokens } = started(emptyPeddlerState(WEEK));
    expect(tokens).toBe(14);
    expect(state.routes.river.dispatch).toEqual({
      hours: 8,
      startedAt: NOW,
      readyAt: NOW + 8 * HOUR,
      points: 2_000,
      tokens: 14,
    });
    // 증표와 단골 점수는 받을 때 들어온다.
    expect(state.tokens).toBe(0);
    expect(state.routes.river.standingPoints).toBe(0);
  });

  it("증표 나머지를 다음 파견으로 이월한다", () => {
    const first = started(emptyPeddlerState(WEEK), { hours: 4, points: 300 });
    expect(first.tokens).toBe(1);
    const claimed = claimPeddlerDispatch(first.state, "river", NOW + 4 * HOUR);
    if ("error" in claimed) throw new Error(claimed.error);
    const second = started(claimed.state, { hours: 4, points: 300, now: NOW + 4 * HOUR });
    expect(second.tokens).toBe(2);
    expect(second.state.tokenCarry).toBe(0);
  });

  it("잠긴 교역로, 진행 중인 교역로, 모자라거나 넘치는 짐은 거절한다", () => {
    const base = emptyPeddlerState(WEEK);
    const attempt = (input: Partial<Parameters<typeof startPeddlerDispatch>[1]>, state = base) =>
      startPeddlerDispatch(state, { routeId: "river", hours: 8, points: 2_000, preferredPoints: 0, now: NOW, ...input });
    expect(attempt({ routeId: "ridge" })).toEqual({ error: "route_locked" });
    expect(attempt({}, started(base).state)).toEqual({ error: "route_busy" });
    expect(attempt({ points: 199 })).toEqual({ error: "cargo_too_small" });
    expect(attempt({ points: 2_001 })).toEqual({ error: "over_capacity" });
    expect(attempt({ points: 2_600 }, withStanding({ river: 32_000 }))).toMatchObject({ tokens: 18 });
  });
});

describe("행상 수령", () => {
  it("도착 전에는 받을 수 없다", () => {
    const { state } = started(emptyPeddlerState(WEEK));
    expect(claimPeddlerDispatch(state, "river", NOW + 8 * HOUR - 1)).toEqual({ error: "not_ready" });
    expect(claimPeddlerDispatch(emptyPeddlerState(WEEK), "river", NOW)).toEqual({ error: "no_dispatch" });
  });

  it("받으면 증표와 단골 점수가 들어오고 수레가 빈다", () => {
    const { state } = started(withStanding({ river: 5_000 }), { preferredPoints: 1_000 });
    const result = claimPeddlerDispatch(state, "river", NOW + 8 * HOUR);
    if ("error" in result) throw new Error(result.error);
    expect(result.tokens).toBe(17);
    expect(result.points).toBe(2_000);
    expect(result.rankBefore).toBe(0);
    expect(result.rankAfter).toBe(1);
    expect(result.state.tokens).toBe(17);
    expect(result.state.tokensEarnedTotal).toBe(17);
    expect(result.state.routes.river).toEqual({ standingPoints: 7_000, dispatch: null });
    expect(result.state.dispatchCount).toBe(1);
  });
});

describe("행상 증표 교환", () => {
  const rich: PeddlerState = { ...emptyPeddlerState(WEEK), tokens: 500 };

  it("증표를 쓰고 주간 구매 기록을 남긴다", () => {
    const result = buyPeddlerShopItem(rich, "master_alloy", 3);
    if ("error" in result) throw new Error(result.error);
    expect(result.state.tokens).toBe(410);
    expect(result.state.shop.purchases.master_alloy).toBe(3);
    expect(result.item.id).toBe("master_alloy");
  });

  it("증표가 모자라거나 주간 한도를 넘으면 거절한다", () => {
    expect(buyPeddlerShopItem({ ...rich, tokens: 29 }, "master_crop", 1)).toEqual({ error: "not_enough_tokens" });
    expect(buyPeddlerShopItem(rich, "master_crop", 6)).toEqual({ error: "weekly_limit" });
    const bought = buyPeddlerShopItem(rich, "cut_gem_refined", 1);
    if ("error" in bought) throw new Error(bought.error);
    expect(buyPeddlerShopItem(bought.state, "cut_gem_refined", 1)).toEqual({ error: "weekly_limit" });
  });

  it("한도 없는 품목은 여러 번 살 수 있다", () => {
    const result = buyPeddlerShopItem(rich, "compound_feed", 20);
    if ("error" in result) throw new Error(result.error);
    expect(result.state.tokens).toBe(300);
    expect(buyPeddlerShopItem(result.state, "compound_feed", 30)).toMatchObject({ state: { tokens: 0 } });
  });

  it("없는 품목과 잘못된 수량은 거절한다", () => {
    expect(buyPeddlerShopItem(rich, "nope", 1)).toEqual({ error: "unknown_item" });
    expect(buyPeddlerShopItem(rich, "compound_feed", 0)).toEqual({ error: "invalid_quantity" });
    expect(buyPeddlerShopItem(rich, "compound_feed", 1.5)).toEqual({ error: "invalid_quantity" });
    expect(buyPeddlerShopItem(rich, "compound_feed", 101)).toEqual({ error: "invalid_quantity" });
  });
});

describe("행상 칭호", () => {
  it("단골 등급 합계 15와 30에 칭호를 얻는다", () => {
    expect(peddlerEarnedTitleIds(14)).toEqual([]);
    expect(peddlerEarnedTitleIds(15)).toEqual([PEDDLER_REGULAR_TITLE_ID]);
    expect(peddlerEarnedTitleIds(30)).toEqual([PEDDLER_REGULAR_TITLE_ID, PEDDLER_MASTER_TITLE_ID]);
  });
});
