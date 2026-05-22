import { describe, expect, it } from "vitest";
import { BASE_GOLD_RATE, monsterGoldReward } from "./monsterGold";

describe("monsterGoldReward", () => {
  it("exp × BASE_GOLD_RATE 반올림, 최소 1 보장", () => {
    expect(BASE_GOLD_RATE).toBe(0.01);
    expect(monsterGoldReward({ exp: 300 })).toBe(3); // 3.0
    expect(monsterGoldReward({ exp: 250 })).toBe(3); // 2.5 → round-half-up
    expect(monsterGoldReward({ exp: 5000 })).toBe(50); // 보스급
    expect(monsterGoldReward({ exp: 60 })).toBe(1); // 0.6 → 1
    expect(monsterGoldReward({ exp: 8 })).toBe(1); // 0.08 → 0 → floor 1
    expect(monsterGoldReward({ exp: 0 })).toBe(1); // exp 0 몬스터도 1
  });

  it("exp 에 단조 증가 (강한 몹일수록 더 많은 골드)", () => {
    expect(monsterGoldReward({ exp: 1000 })).toBeGreaterThan(
      monsterGoldReward({ exp: 100 }),
    );
  });
});
