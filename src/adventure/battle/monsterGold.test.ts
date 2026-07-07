import { describe, expect, it } from "vitest";
import { BASE_GOLD_RATE, monsterGoldReward } from "../v2/combat/monsterGold";

describe("monsterGoldReward", () => {
  it("exp × BASE_GOLD_RATE (2.5 로 후반 골드 생산량 완화 — 2026-07-07)", () => {
    expect(BASE_GOLD_RATE).toBe(2.5);
    expect(monsterGoldReward({ exp: 300 })).toBe(750);
    expect(monsterGoldReward({ exp: 25 })).toBe(63);
    expect(monsterGoldReward({ exp: 5000 })).toBe(12500); // 보스급
    expect(monsterGoldReward({ exp: 0 })).toBe(1); // exp 0 몬스터도 1 보장
  });

  it("exp 에 단조 증가 (강한 몹일수록 더 많은 골드)", () => {
    expect(monsterGoldReward({ exp: 1000 })).toBeGreaterThan(
      monsterGoldReward({ exp: 100 }),
    );
  });
});
