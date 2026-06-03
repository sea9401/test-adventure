import { describe, expect, it } from "vitest";
import { BASE_GOLD_RATE, monsterGoldReward } from "./monsterGold";

describe("monsterGoldReward", () => {
  it("exp × BASE_GOLD_RATE (4.0 으로 추가 2× 인상 — 2026-06-04)", () => {
    expect(BASE_GOLD_RATE).toBe(4.0);
    expect(monsterGoldReward({ exp: 300 })).toBe(1200);
    expect(monsterGoldReward({ exp: 25 })).toBe(100);
    expect(monsterGoldReward({ exp: 5000 })).toBe(20000); // 보스급
    expect(monsterGoldReward({ exp: 0 })).toBe(1); // exp 0 몬스터도 1 보장
  });

  it("exp 에 단조 증가 (강한 몹일수록 더 많은 골드)", () => {
    expect(monsterGoldReward({ exp: 1000 })).toBeGreaterThan(
      monsterGoldReward({ exp: 100 }),
    );
  });
});
