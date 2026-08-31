import { describe, it, expect } from "vitest";
import {
  STAMINA_POTIONS_KEY,
  STAMINA_POTION_RESTORE,
  consumeStaminaPotions,
  grantStaminaPotions,
  parseStaminaPotions,
  staminaPotionCount,
} from "./staminaPotions";

describe("staminaPotions", () => {
  it("키·회복량 상수", () => {
    expect(STAMINA_POTIONS_KEY).toBe("stamina-potions.v1");
    expect(STAMINA_POTION_RESTORE).toBeGreaterThan(0);
  });

  it("정상/손상/음수/소수/비숫자 방어", () => {
    expect(parseStaminaPotions({ count: 3 })).toEqual({ count: 3, boundCount: 0 });
    expect(parseStaminaPotions({ count: 3, boundCount: 2 })).toEqual({
      count: 3,
      boundCount: 2,
    });
    expect(parseStaminaPotions({ count: 3, boundCount: 9 })).toEqual({
      count: 3,
      boundCount: 3,
    });
    expect(parseStaminaPotions({ count: 3, boundCount: -1 })).toEqual({
      count: 3,
      boundCount: 0,
    });
    expect(staminaPotionCount({ count: 3 })).toBe(3);
    expect(staminaPotionCount(null)).toBe(0);
    expect(staminaPotionCount("x")).toBe(0);
    expect(staminaPotionCount({})).toBe(0);
    expect(staminaPotionCount({ count: -5 })).toBe(0);
    expect(staminaPotionCount({ count: 2.9 })).toBe(2);
    expect(staminaPotionCount({ count: "5" })).toBe(0);
    expect(staminaPotionCount({ count: Infinity })).toBe(0);
  });

  it("귀속 지급은 총수량과 귀속 수량을 함께 늘리고 일반 지급은 귀속 수량을 보존한다", () => {
    expect(
      grantStaminaPotions({ count: 5, boundCount: 2 }, 3, { bound: true }),
    ).toEqual({ count: 8, boundCount: 5 });
    expect(grantStaminaPotions({ count: 5, boundCount: 2 }, 3)).toEqual({
      count: 8,
      boundCount: 2,
    });
  });

  it("사용할 때 귀속 회복약을 먼저 차감한다", () => {
    expect(consumeStaminaPotions({ count: 5, boundCount: 2 }, 1)).toEqual({
      count: 4,
      boundCount: 1,
    });
    expect(consumeStaminaPotions({ count: 5, boundCount: 2 }, 3)).toEqual({
      count: 2,
      boundCount: 0,
    });
  });
});
