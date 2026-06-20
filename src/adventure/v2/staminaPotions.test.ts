import { describe, it, expect } from "vitest";
import {
  STAMINA_POTIONS_KEY,
  STAMINA_POTION_RESTORE,
  parseStaminaPotions,
  staminaPotionCount,
} from "./staminaPotions";

describe("staminaPotions", () => {
  it("키·회복량 상수", () => {
    expect(STAMINA_POTIONS_KEY).toBe("stamina-potions.v1");
    expect(STAMINA_POTION_RESTORE).toBeGreaterThan(0);
  });

  it("정상/손상/음수/소수/비숫자 방어", () => {
    expect(parseStaminaPotions({ count: 3 })).toEqual({ count: 3 });
    expect(staminaPotionCount({ count: 3 })).toBe(3);
    expect(staminaPotionCount(null)).toBe(0);
    expect(staminaPotionCount("x")).toBe(0);
    expect(staminaPotionCount({})).toBe(0);
    expect(staminaPotionCount({ count: -5 })).toBe(0);
    expect(staminaPotionCount({ count: 2.9 })).toBe(2);
    expect(staminaPotionCount({ count: "5" })).toBe(0);
    expect(staminaPotionCount({ count: Infinity })).toBe(0);
  });
});
