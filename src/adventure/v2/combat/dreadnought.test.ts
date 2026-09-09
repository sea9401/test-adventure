import { describe, expect, it } from "vitest";
import { dreadnoughtCounterHit, dreadnoughtImpactSpend } from "./dreadnought";

describe("드레드노트 충격과 반격 전이", () => {
  it("충격 3 소비 적중으로 반격 한 번을 준비하고 소비량에 비례해 회복한다", () => {
    const spent = dreadnoughtImpactSpend({ consumed: 3, landed: true, maxHp: 1000, healPctPerStack: 2, counterBoostPct: 50 });
    expect(spent).toEqual({ state: { counterBoostPct: 50 }, heal: 60 });
    const counter = dreadnoughtCounterHit({ state: spent.state, impact: 0, gain: 1, actionId: 1, landed: true });
    expect(counter).toMatchObject({ impact: 1, damageMult: 1.5, state: { counterBoostPct: 0, lastImpactAction: 1 } });
    expect(dreadnoughtCounterHit({ state: counter.state, impact: counter.impact, gain: 1, actionId: 1, landed: true })).toMatchObject({ impact: 1, damageMult: 1 });
    expect(dreadnoughtCounterHit({ state: counter.state, impact: counter.impact, gain: 1, actionId: 2, landed: true }).impact).toBe(2);
  });

  it("계승 공격도 회복하고 충격 0~2는 새 반격 강화를 만들지 않는다", () => {
    for (const consumed of [0, 1, 2]) {
      expect(dreadnoughtImpactSpend({ consumed, landed: true, maxHp: 1000, healPctPerStack: 2, counterBoostPct: 50 })).toEqual({ state: undefined, heal: consumed * 20 });
    }
    expect(dreadnoughtImpactSpend({ consumed: 3, landed: true, maxHp: 1000, healPctPerStack: 2 }).heal).toBe(60);
  });

  it("빗나감은 회복·충격·준비한 반격을 변경하지 않는다", () => {
    const state = { counterBoostPct: 50 };
    expect(dreadnoughtImpactSpend({ state, consumed: 3, landed: false, maxHp: 1000, healPctPerStack: 2, counterBoostPct: 50 })).toEqual({ state, heal: 0 });
    expect(dreadnoughtCounterHit({ state, impact: 1, gain: 1, actionId: 1, landed: false })).toEqual({ state, impact: 1, damageMult: 1 });
  });

  it("충격 최대3과 중복 강화 금지, 같은 행동 중 소비 후 재획득 금지를 유지한다", () => {
    const first = dreadnoughtCounterHit({ impact: 3, gain: 1, actionId: 7, landed: true });
    expect(first.impact).toBe(3);
    expect(dreadnoughtCounterHit({ state: first.state, impact: 0, gain: 1, actionId: 7, landed: true }).impact).toBe(0);
    const state = { counterBoostPct: 50, lastImpactAction: 7 };
    expect(dreadnoughtImpactSpend({ state, consumed: 3, landed: true, maxHp: 1000, counterBoostPct: 50 }).state).toEqual(state);
    expect(dreadnoughtImpactSpend({ consumed: 99, landed: true, maxHp: 1000, healPctPerStack: 2 }).heal).toBe(60);
  });
});
