import { describe, expect, it } from "vitest";
import { createPain, deferPain, deferPainHits, castPainRitual, repayPain } from "./darkPriest";

describe("고통 의식", () => {
  it("직접 피해를 정수로 유예하고 상한 초과는 즉시 지불한다", () => {
    const initial = createPain(10000);
    expect(deferPain(initial, 1000, false)).toMatchObject({ immediate: 800, deferred: 200, state: { debt: 200 } });
    expect(deferPain({ ...initial, debt: 1800 }, 2000, false)).toMatchObject({ immediate: 1800, deferred: 200, state: { debt: 2000 } });
    expect(deferPain(initial, 1000, true).deferred).toBe(120);
    expect(deferPain(undefined, 1000, false).immediate).toBe(1000);
  });
  it("사죄는 고통을 지우고 독립 회복, 단죄는 고통을 위력으로 쓴다", () => {
    const pain = { ...createPain(10000), debt: 200 };
    expect(castPainRitual(pain, "absolve", false, false)).toMatchObject({ spent: 200, heal: 250, damageMult: 1, state: { debt: 0 } });
    expect(castPainRitual(pain, "condemn", false, false).damageMult).toBeCloseTo(1.1);
    expect(castPainRitual(createPain(10000), "prayer", false, false).heal).toBe(100);
  });
  it("순환은 실제 고통 소비로만 준비되고 반대 의식에서 한 번 쓴다", () => {
    const a = castPainRitual({ ...createPain(10000), debt: 800 }, "absolve", true, false);
    expect(a.state.next).toBe("condemn");
    const b = castPainRitual(a.state, "condemn", true, false);
    expect(b.damageMult).toBe(1.15);
    expect(b.state.next).toBe(null);
    expect(castPainRitual(createPain(10000), "absolve", true, false).state.next).toBe(null);
  });
  it("성역은 네 번의 행동 뒤 잔여 고통을 전액 상환하고 재사용할 수 없다", () => {
    const cast = castPainRitual({ ...createPain(10000), debt: 1200 }, "sanctuary", false, true);
    expect(cast.state.sanctuary).toBe(4);
    let state = cast.state;
    for (let i = 0; i < 3; i++) { const tick = repayPain(state); expect(tick.damage).toBe(0); state = tick.state; }
    expect(repayPain(state)).toMatchObject({ damage: 1200, state: { debt: 0, sanctuary: 0, used: true } });
    expect(castPainRitual(state, "sanctuary", false, false).allowed).toBe(false);
  });
  it("성역 집전자는 소비 한도만 늘리고 단죄 배율 상한은 유지한다", () => {
    const pain = { ...createPain(10000), debt: 2000, sanctuary: 3 };
    const result = castPainRitual(pain, "sentence", false, true);
    expect(result.spent).toBe(1250);
    expect(result.damageMult).toBe(1.4);
    expect(repayPain({ ...pain, sanctuary: 0 }).damage).toBe(500);
  });
});

it("다단 피격은 보호막을 앞 타격부터 소모하고 타격별 소수점을 버린다", () => {
  expect(deferPainHits(createPain(10000), [103, 103, 103], 100, false)).toMatchObject({ immediate: 169, deferred: 40, state: { debt: 40 } });
});
