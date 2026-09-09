import { describe, expect, it } from "vitest";
import { applyPlayerDotDamageBonuses } from "./playerDotDamage";
import { applyV2DotsToTarget, tickV2Dots, v2DotPerStackDamage, type V2Dot } from "./combatShared";

const dot = (tag: V2Dot["tag"]): V2Dot => ({ tag, label: tag, stacks: 1, maxStacks: 5, turns: 3, flatPerStack: 11, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 100 });

describe("삼재 침식 주기 피해", () => {
  it.each(["poison", "bleed", "burn"] as const)("%s 주기만 최종 증폭하고 폭발용 피해·스택·기간은 유지한다", tag => {
    const raw = dot(tag);
    const [scaled] = applyPlayerDotDamageBonuses([raw], 100, 80, 0, 40);
    const [base] = applyPlayerDotDamageBonuses([raw], 100, 80);
    expect(tickV2Dots([scaled], 1000).totalDmg).toBe(tag === "poison" ? 30 : tag === "burn" ? 27 : 15);
    expect(v2DotPerStackDamage(scaled, 1000)).toBe(v2DotPerStackDamage(base, 1000));
    expect(scaled.stacks).toBe(1);
    expect(scaled.maxStacks).toBe(5);
    expect(scaled.turns).toBe(3);
    expect(raw).toEqual(dot(tag));
  });

  it("이미 적용한 독·연소 보너스는 틱 진행·새 시전 병합으로 다시 곱하지 않는다", () => {
    for (const tag of ["poison", "burn"] as const) {
      const raw = { ...dot(tag), maxStacks: 1 };
      const scaled = applyPlayerDotDamageBonuses([raw], 100, 80, 0, 40);
      const first = tickV2Dots(scaled, 1000);
      expect(tickV2Dots(first.nextDots, 1000).totalDmg).toBe(first.totalDmg);
      const refreshed = applyV2DotsToTarget(first.nextDots, applyPlayerDotDamageBonuses([raw], 100, 80, 0, 40), 1000);
      expect(tickV2Dots(refreshed, 1000).totalDmg).toBe(first.totalDmg);
    }
  });

  it("보너스 없음·음수는 기존 호출과 동일한 DoT를 반환한다", () => {
    const raw = [dot("poison"), dot("bleed"), dot("burn")];
    expect(applyPlayerDotDamageBonuses(raw, 30, 80, 0)).toEqual(applyPlayerDotDamageBonuses(raw, 30, 80));
    expect(applyPlayerDotDamageBonuses(raw, 30, 80, 0, -10)).toEqual(applyPlayerDotDamageBonuses(raw, 30, 80));
  });
});
