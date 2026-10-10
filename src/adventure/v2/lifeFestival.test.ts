import { describe, expect, it } from "vitest";
import {
  LIFE_FESTIVAL_ORDERS,
  LIFE_FESTIVAL_SHOP_ITEMS,
} from "@/adventure/data/v2/lifeFestival";
import {
  buyLifeFestivalShopItem,
  dishMatchesRequirement,
  grantLifeFestivalTokens,
  lifeFestivalBonus,
  lifeFestivalBonusXp,
  lifeFestivalDeliveryReward,
  lifeFestivalMultiplier,
  lifeFestivalOrdersForWeek,
  lifeFestivalThemeForWeek,
  parseLifeFestivalState,
  validateDishSelection,
  type LifeFestivalDishRequirement,
} from "./lifeFestival";

function weekIdsFrom(startMonday: string, count: number): string[] {
  const start = Date.parse(`${startMonday}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) =>
    new Date(start + index * 7 * 86_400_000).toISOString().slice(0, 10),
  );
}

describe("생활 축제 주간 테마", () => {
  it("기준 월요일부터 다섯 테마를 고정 순서로 순환한다", () => {
    expect(lifeFestivalThemeForWeek("2026-01-05").id).toBe("harvest");
    expect(lifeFestivalThemeForWeek("2026-01-12").id).toBe("forest");
    expect(lifeFestivalThemeForWeek("2026-01-19").id).toBe("vein");
    expect(lifeFestivalThemeForWeek("2026-01-26").id).toBe("fishing");
    expect(lifeFestivalThemeForWeek("2026-02-02").id).toBe("feast");
    expect(lifeFestivalThemeForWeek("2026-02-09").id).toBe("harvest");
  });

  it("기준 이전 주차도 음수 없이 순환한다", () => {
    expect(lifeFestivalThemeForWeek("2025-12-29").id).toBe("feast");
  });

  it("이번 주 테마 대상 활동에만 보너스를 준다", () => {
    const monday = new Date("2026-01-05T00:00:00+09:00");
    expect(lifeFestivalBonus("farming", monday)).toEqual({
      themeId: "harvest",
      chancePct: 10,
      xpPct: 25,
    });
    expect(lifeFestivalBonus("mining", monday)).toEqual({
      themeId: null,
      chancePct: 0,
      xpPct: 0,
    });
  });

  it("월요일 00:00 KST 경계에서 테마가 바뀐다", () => {
    const sundayEnd = new Date("2026-01-11T23:59:59+09:00");
    const nextMonday = new Date("2026-01-12T00:00:00+09:00");
    expect(lifeFestivalBonus("farming", sundayEnd).themeId).toBe("harvest");
    expect(lifeFestivalBonus("farming", nextMonday).themeId).toBeNull();
    expect(lifeFestivalBonus("woodcutting", nextMonday)).toEqual({
      themeId: "forest",
      chancePct: 10,
      xpPct: 25,
    });
  });

  it("테마별 산출 보너스 수치는 명세 값이다", () => {
    expect(lifeFestivalBonus("fishing", new Date("2026-01-26T12:00:00+09:00")).chancePct).toBe(2);
    expect(lifeFestivalBonus("cooking", new Date("2026-02-02T12:00:00+09:00")).chancePct).toBe(5);
    expect(lifeFestivalBonus("mining", new Date("2026-01-19T12:00:00+09:00")).chancePct).toBe(10);
  });

  it("경험치 보너스는 내림한다", () => {
    expect(lifeFestivalBonusXp(10, 25)).toBe(2);
    expect(lifeFestivalBonusXp(10, 0)).toBe(0);
    expect(lifeFestivalBonusXp(0, 25)).toBe(0);
  });
});

describe("생활 축제 주문 편성", () => {
  it("주문 풀은 테마별 4건과 일반 8건이다", () => {
    for (const pool of ["harvest", "forest", "vein", "fishing", "feast"]) {
      expect(LIFE_FESTIVAL_ORDERS.filter((order) => order.pool === pool)).toHaveLength(4);
    }
    expect(LIFE_FESTIVAL_ORDERS.filter((order) => order.pool === "general")).toHaveLength(8);
    expect(new Set(LIFE_FESTIVAL_ORDERS.map((order) => order.id)).size).toBe(
      LIFE_FESTIVAL_ORDERS.length,
    );
  });

  it("테마 주문 3건과 일반 주문 3건을 결정적으로 고른다", () => {
    const first = lifeFestivalOrdersForWeek("2026-10-12");
    const second = lifeFestivalOrdersForWeek("2026-10-12");
    const theme = lifeFestivalThemeForWeek("2026-10-12").id;
    expect(first).toHaveLength(6);
    expect(first.map((order) => order.id)).toEqual(second.map((order) => order.id));
    expect(first.slice(0, 3).every((order) => order.pool === theme)).toBe(true);
    expect(first.slice(3).every((order) => order.pool === "general")).toBe(true);
  });

  it("52주 동안 한 주 안에 같은 요건의 주문이 겹치지 않는다", () => {
    for (const weekId of weekIdsFrom("2026-01-05", 52)) {
      const orders = lifeFestivalOrdersForWeek(weekId);
      const requirements = orders.map((order) => JSON.stringify(order.requirement));
      expect(new Set(requirements).size).toBe(6);
    }
  });
});

describe("생활 축제 납품 보상", () => {
  it("회차별 체감 배율", () => {
    expect(lifeFestivalMultiplier(1)).toBe(1);
    expect(lifeFestivalMultiplier(5)).toBe(1);
    expect(lifeFestivalMultiplier(6)).toBe(0.5);
    expect(lifeFestivalMultiplier(15)).toBe(0.5);
    expect(lifeFestivalMultiplier(16)).toBe(0.2);
  });

  it("묶음 납품은 회차마다 배율을 따로 적용한다", () => {
    expect(lifeFestivalDeliveryReward(6, 0, 1)).toEqual({ tokens: 6, score: 60 });
    expect(lifeFestivalDeliveryReward(6, 4, 2)).toEqual({ tokens: 9, score: 90 });
    expect(lifeFestivalDeliveryReward(4, 15, 1)).toEqual({ tokens: 0, score: 8 });
  });
});

describe("생활 축제 세이브", () => {
  it("지난 주차 세이브는 주간 기록만 비우고 증표와 1회 상품은 유지한다", () => {
    const state = parseLifeFestivalState(
      {
        weekId: "2026-10-05",
        tokens: 50,
        tokensEarnedTotal: 120,
        deliveries: { a: 3 },
        weeklyPurchases: { feed_bundle: 5 },
        ownedOnceItemIds: ["title_regular"],
      },
      "2026-10-12",
    );
    expect(state).toEqual({
      version: 1,
      weekId: "2026-10-12",
      tokens: 50,
      tokensEarnedTotal: 120,
      deliveries: {},
      weeklyPurchases: {},
      ownedOnceItemIds: ["title_regular"],
    });
  });

  it("손상된 값은 0 이상 정수로 정리한다", () => {
    const state = parseLifeFestivalState(
      {
        weekId: "2026-10-12",
        tokens: -5,
        tokensEarnedTotal: "abc",
        deliveries: { a: 2.7, b: -1, c: "x" },
        weeklyPurchases: { feed_bundle: 1.9 },
        ownedOnceItemIds: ["title_regular", 3, "title_regular", "unknown"],
      },
      "2026-10-12",
    );
    expect(state.tokens).toBe(0);
    expect(state.tokensEarnedTotal).toBe(0);
    expect(state.deliveries).toEqual({ a: 2 });
    expect(state.weeklyPurchases).toEqual({ feed_bundle: 1 });
    expect(state.ownedOnceItemIds).toEqual(["title_regular"]);
  });

  it("증표 지급은 보유와 누적을 함께 올린다", () => {
    const state = grantLifeFestivalTokens(parseLifeFestivalState({}, "2026-10-12"), 30);
    expect(state.tokens).toBe(30);
    expect(state.tokensEarnedTotal).toBe(30);
  });
});

describe("생활 축제 요리 요건", () => {
  const req: LifeFestivalDishRequirement = {
    kind: "dish",
    quantity: 2,
    minTier: 3,
    tag: "offense",
    minQuality: "careful",
  };
  const dish = (tier: 1 | 2 | 3 | 4 | 5, tags: string[], quality: "normal" | "careful" | "masterpiece" | "signature") => ({
    tier,
    effectTags: tags,
    quality,
  });

  it("등급·태그·품질을 모두 만족해야 한다", () => {
    expect(dishMatchesRequirement(dish(3, ["offense"], "careful"), req)).toBe(true);
    expect(dishMatchesRequirement(dish(4, ["offense"], "masterpiece"), req)).toBe(true);
    expect(dishMatchesRequirement(dish(2, ["offense"], "careful"), req)).toBe(false);
    expect(dishMatchesRequirement(dish(3, ["defense"], "careful"), req)).toBe(false);
    expect(dishMatchesRequirement(dish(3, ["offense"], "normal"), req)).toBe(false);
    expect(dishMatchesRequirement(dish(3, ["offense"], "signature"), { ...req, minQuality: "masterpiece" })).toBe(true);
  });

  const lookup = (foodId: string) =>
    ({
      good: dish(3, ["offense"], "careful"),
      great: dish(5, ["offense"], "masterpiece"),
      weak: dish(1, ["offense"], "careful"),
    })[foodId] ?? null;

  it("선택 수량이 요건×묶음과 정확히 같아야 한다", () => {
    const inventory = { good: 5, great: 1, weak: 3 };
    expect(validateDishSelection({ good: 4 }, inventory, req, 2, lookup)).toEqual({ ok: true });
    expect(validateDishSelection({ good: 3, great: 1 }, inventory, req, 2, lookup)).toEqual({ ok: true });
    expect(validateDishSelection({ good: 3 }, inventory, req, 2, lookup)).toEqual({ ok: false });
    expect(validateDishSelection({ good: 5 }, inventory, req, 2, lookup)).toEqual({ ok: false });
  });

  it("보유 초과·요건 미달·알 수 없는 요리·잘못된 수는 거절한다", () => {
    const inventory = { good: 1, great: 1, weak: 3 };
    expect(validateDishSelection({ good: 2 }, inventory, req, 1, lookup)).toEqual({ ok: false });
    expect(validateDishSelection({ good: 1, weak: 1 }, inventory, req, 1, lookup)).toEqual({ ok: false });
    expect(validateDishSelection({ good: 1, ghost: 1 }, { ...inventory, ghost: 1 }, req, 1, lookup)).toEqual({ ok: false });
    expect(validateDishSelection({ good: 1.5, great: 0.5 }, inventory, req, 1, lookup)).toEqual({ ok: false });
  });
});

describe("생활 축제 상점", () => {
  const base = (tokens: number) => ({
    ...parseLifeFestivalState({}, "2026-10-12"),
    tokens,
  });

  it("상점 상품은 명세의 10건이다", () => {
    expect(LIFE_FESTIVAL_SHOP_ITEMS.map((item) => [item.id, item.tokenCost, item.weeklyLimit])).toEqual([
      ["fertilizer_bundle", 15, 5],
      ["feed_bundle", 12, 5],
      ["wedge_advanced", 20, 3],
      ["probe_advanced", 20, 3],
      ["mastery_certificate", 40, 3],
      ["stamina_potion", 50, 2],
      ["mithril_shard", 80, 2],
      ["title_regular", 200, null],
      ["title_master", 1_000, null],
      ["title_legend", 3_000, null],
    ]);
  });

  it("증표를 차감하고 주간 구매 횟수를 올린다", () => {
    const result = buyLifeFestivalShopItem(base(20), "feed_bundle");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.state.tokens).toBe(8);
    expect(result.state.weeklyPurchases.feed_bundle).toBe(1);
    expect(result.item.id).toBe("feed_bundle");
  });

  it("증표 부족·주간 한도·이미 보유·알 수 없는 상품을 거절한다", () => {
    expect(buyLifeFestivalShopItem(base(10), "feed_bundle")).toEqual({ error: "not_enough_tokens" });
    expect(
      buyLifeFestivalShopItem({ ...base(100), weeklyPurchases: { feed_bundle: 5 } }, "feed_bundle"),
    ).toEqual({ error: "weekly_limit" });
    expect(
      buyLifeFestivalShopItem({ ...base(500), ownedOnceItemIds: ["title_regular"] }, "title_regular"),
    ).toEqual({ error: "already_owned" });
    expect(buyLifeFestivalShopItem(base(500), "nope")).toEqual({ error: "unknown_item" });
  });

  it("1회 상품은 보유 목록에 기록한다", () => {
    const result = buyLifeFestivalShopItem(base(250), "title_regular");
    if ("error" in result) throw new Error(result.error);
    expect(result.state.tokens).toBe(50);
    expect(result.state.ownedOnceItemIds).toEqual(["title_regular"]);
    expect(result.state.weeklyPurchases).toEqual({});
  });
});
