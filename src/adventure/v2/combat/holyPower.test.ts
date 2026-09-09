import { describe, expect, it } from "vitest";
import { castHolyPower, tickHolyPower, holyJudgmentCoefficient, normalizeHolyPower } from "./holyPower";

describe("성력", () => {
  it("성역은 4행동 동안 정확히 40 성력을 생성한다", () => {
    let state = castHolyPower(undefined, "sanctuary");
    for (let i = 1; i <= 4; i++) {
      const tick = tickHolyPower(state);
      expect(tick.healPct).toBe(4);
      state = tick.state;
      expect(state).toEqual({ power: i * 10, sanctuaryTurns: 4 - i });
    }
    expect(tickHolyPower(state)).toEqual({ state, healPct: 0, gained: 0 });
  });
  it("성역 갱신은 자원을 보존하고 지속시간만 갱신한다", () => {
    expect(castHolyPower({ power: 80, sanctuaryTurns: 1 }, "sanctuary"))
      .toEqual({ power: 80, sanctuaryTurns: 4 });
    expect(tickHolyPower({ power: 98, sanctuaryTurns: 1 }).state.power).toBe(100);
  });
  it("심판은 성력만 소모하고 성역은 보존한다", () => {
    expect(castHolyPower({ power: 100, sanctuaryTurns: 2 }, "judgment"))
      .toEqual({ power: 0, sanctuaryTurns: 2 });
  });
  it.each([[0, 2], [40, 3.2], [100, 5]])("성력 %i에서 실제 공격력·힘·정신 계수는 %f", (power, coefficient) => {
    expect(holyJudgmentCoefficient({ power, sanctuaryTurns: 0 })).toBe(coefficient);
  });
  it("누락·비정상 자원을 안전하게 정규화한다", () => {
    expect(normalizeHolyPower(undefined)).toEqual({ power: 0, sanctuaryTurns: 0 });
    expect(normalizeHolyPower({ power: Infinity, sanctuaryTurns: -1 })).toEqual({ power: 0, sanctuaryTurns: 0 });
  });
});
