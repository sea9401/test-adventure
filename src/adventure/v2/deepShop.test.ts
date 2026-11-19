import { describe, expect, it } from "vitest";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import {
  DEEP_SHOP_ENTRIES,
  addDeepTokens,
  parseDeepShopState,
  planDeepShopPurchase,
} from "./deepShop";

const MONDAY = new Date("2026-11-16T03:00:00+09:00");
const NEXT_MONDAY = new Date("2026-11-23T00:00:00+09:00");

describe("심층 교환소 품목", () => {
  it("승인된 네 품목과 가격, 주간 한도를 판다", () => {
    expect(
      DEEP_SHOP_ENTRIES.map((entry) => [
        entry.name,
        entry.count,
        entry.tokenCost,
        entry.goldCost,
        entry.weeklyLimit,
      ]),
    ).toEqual([
      ["완벽한 보석", 1, 400, 5_000_000, 2],
      ["정교한 보석", 1, 120, 1_000_000, 5],
      ["보스 소환서", 10, 60, 500_000, 5],
      ["푸른 강화석", 10, 40, 200_000, 10],
    ]);
  });

  it("품목은 모두 실제 재료다", () => {
    for (const entry of DEEP_SHOP_ENTRIES) {
      expect(V2_MATERIALS[entry.materialId]?.name).toBe(entry.name);
    }
  });
});

describe("심층 교환소 세이브", () => {
  it("빈 세이브는 증표 0개와 이번 주 기록으로 읽는다", () => {
    expect(parseDeepShopState(null, MONDAY)).toEqual({
      tokens: 0,
      weekKey: "2026-11-16",
      purchased: {},
    });
  });

  it("주가 바뀌면 구매 기록만 비우고 증표는 남긴다", () => {
    const saved = { tokens: 900, weekKey: "2026-11-16", purchased: { flawless_gem: 2 } };

    expect(parseDeepShopState(saved, MONDAY).purchased).toEqual({ flawless_gem: 2 });
    expect(parseDeepShopState(saved, NEXT_MONDAY)).toEqual({
      tokens: 900,
      weekKey: "2026-11-23",
      purchased: {},
    });
  });

  it("모르는 품목과 잘못된 수량은 버린다", () => {
    const state = parseDeepShopState(
      { tokens: -5, weekKey: "2026-11-16", purchased: { flawless_gem: 1.9, gone: 3, refined_gem: -1 } },
      MONDAY,
    );
    expect(state).toEqual({ tokens: 0, weekKey: "2026-11-16", purchased: { flawless_gem: 1 } });
  });

  it("증표를 더한다", () => {
    const state = parseDeepShopState({ tokens: 10 }, MONDAY);
    expect(addDeepTokens(state, 32).tokens).toBe(42);
    expect(addDeepTokens(state, 0)).toBe(state);
  });
});

describe("심층 교환소 구매", () => {
  // 손에 든 골드로 낸다(은행 우선 차감 여부는 spendGold 의 설정을 따른다).
  const rich = { gold: 50_000_000, bankedGold: 0 };
  const state = parseDeepShopState({ tokens: 1_000, weekKey: "2026-11-16", purchased: { flawless_gem: 1 } }, MONDAY);

  it("증표와 골드를 함께 내고 재료를 받는다", () => {
    const plan = planDeepShopPurchase(state, "boss_summon_scroll", 2, rich);
    if (!plan.ok) throw new Error(plan.error);

    expect(plan.tokenCost).toBe(120);
    expect(plan.goldCost).toBe(1_000_000);
    expect(plan.materials).toEqual({ v2_boss_summon_scroll: 20 });
    expect(plan.state.tokens).toBe(880);
    expect(plan.state.purchased).toEqual({ flawless_gem: 1, boss_summon_scroll: 2 });
    expect(plan.wallet).toEqual({ gold: 49_000_000, bankedGold: 0 });
  });

  it("주간 한도를 넘겨 살 수 없다", () => {
    expect(planDeepShopPurchase(state, "flawless_gem", 2, rich)).toEqual({
      ok: false,
      error: "weekly_limit",
    });
    expect(planDeepShopPurchase(state, "flawless_gem", 1, rich).ok).toBe(true);
  });

  it("증표나 골드가 모자라면 살 수 없다", () => {
    const poorTokens = parseDeepShopState({ tokens: 399 }, MONDAY);
    expect(planDeepShopPurchase(poorTokens, "flawless_gem", 1, rich)).toEqual({
      ok: false,
      error: "insufficient_tokens",
    });
    expect(planDeepShopPurchase(state, "flawless_gem", 1, { gold: 4_999_999, bankedGold: 0 })).toEqual({
      ok: false,
      error: "insufficient_gold",
    });
  });

  it("모르는 품목과 잘못된 수량을 거절한다", () => {
    expect(planDeepShopPurchase(state, "reforge_stone", 1, rich)).toEqual({
      ok: false,
      error: "unknown_item",
    });
    for (const quantity of [0, -1, 1.5, NaN]) {
      expect(planDeepShopPurchase(state, "refined_gem", quantity, rich)).toEqual({
        ok: false,
        error: "invalid_quantity",
      });
    }
  });
});
