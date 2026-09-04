import { describe, expect, it } from "vitest";
import {
  scalePvPDamage,
  scalePvPHealing,
  scalePvPShield,
} from "./engine.pvpScaling";

describe("PvP 표면 배율", () => {
  it("피해 배율을 내림하고 양수 피해는 최소 1로 유지한다", () => {
    expect(scalePvPDamage({ damageMultiplier: 0.65 }, 101)).toBe(65);
    expect(scalePvPDamage({ damageMultiplier: 0.01 }, 1)).toBe(1);
  });

  it("회복과 보호막에 같은 생존 배율을 적용한다", () => {
    const state = { sustainMultiplier: 0.65 };
    expect(scalePvPHealing(state, 101)).toBe(65);
    expect(scalePvPShield(state, 101)).toBe(65);
  });

  it("배율이 없거나 값이 양수가 아니면 원래 값을 보존한다", () => {
    expect(scalePvPDamage({}, 100)).toBe(100);
    expect(scalePvPHealing({ sustainMultiplier: 0.5 }, 0)).toBe(0);
    expect(scalePvPShield({ sustainMultiplier: 0.5 }, -1)).toBe(-1);
  });
});
