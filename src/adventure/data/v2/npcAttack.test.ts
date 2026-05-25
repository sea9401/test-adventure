import { describe, it, expect } from "vitest";
import { ATTACK_INTERVAL_HOURS, computeNextAttackAt } from "./npcAttack";

describe("NPC 공격 주기", () => {
  it("tier 별 interval 단조 증가 (약한 거점일수록 자주)", () => {
    expect(ATTACK_INTERVAL_HOURS[1]).toBeLessThan(ATTACK_INTERVAL_HOURS[2]);
    expect(ATTACK_INTERVAL_HOURS[2]).toBeLessThan(ATTACK_INTERVAL_HOURS[3]);
    expect(ATTACK_INTERVAL_HOURS[3]).toBeLessThan(ATTACK_INTERVAL_HOURS[4]);
  });

  it("computeNextAttackAt — base + interval 시간", () => {
    const base = 1000_000_000_000;
    for (const tier of [1, 2, 3, 4] as const) {
      const r = computeNextAttackAt(tier, base);
      expect(r.getTime()).toBe(
        base + ATTACK_INTERVAL_HOURS[tier] * 3600_000,
      );
    }
  });
});
