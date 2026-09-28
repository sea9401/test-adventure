import { describe, expect, it } from "vitest";
import {
  normalizePvPMultiplier,
  scalePvPDamage,
  scalePvPHealing,
  scalePvPShield,
} from "./engine.pvpScaling";

describe("PvP 표면 배율", () => {
  it.each([
    [undefined, undefined],
    [0, undefined],
    [-1, undefined],
    [Number.NaN, undefined],
    [Number.POSITIVE_INFINITY, undefined],
    [0.5, 0.5],
    [1, 1],
    [2, 2],
  ])("배율 %s의 유효성을 확인해 %s로 정규화한다", (value, expected) => {
    expect(normalizePvPMultiplier(value)).toBe(expected);
  });

  it("피해 배율을 내림하고 양수 피해는 최소 1로 유지한다", () => {
    expect(scalePvPDamage({ damageMultiplier: 0.65 }, 101)).toBe(65);
    expect(scalePvPDamage({ damageMultiplier: 0.01 }, 1)).toBe(1);
  });

  it("회복과 보호막에 같은 생존 배율을 적용한다", () => {
    const state = { sustainMultiplier: 0.65 };
    expect(scalePvPHealing(state, 101)).toBe(65);
    expect(scalePvPShield(state, 101)).toBe(65);
  });

  it("별도 회복 배율을 주면 보호막 배율과 독립적으로 적용한다", () => {
    const state = { healingMultiplier: 0.5, sustainMultiplier: 0.65 };
    expect(scalePvPHealing(state, 101)).toBe(50);
    expect(scalePvPShield(state, 101)).toBe(65);
  });

  it("배율이 없거나 값이 양수가 아니면 원래 값을 보존한다", () => {
    expect(scalePvPDamage({}, 100)).toBe(100);
    expect(scalePvPHealing({ sustainMultiplier: 0.5 }, 0)).toBe(0);
    expect(scalePvPShield({ sustainMultiplier: 0.5 }, -1)).toBe(-1);
  });
});
