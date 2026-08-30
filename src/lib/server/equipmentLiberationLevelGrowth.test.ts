import { describe, expect, it } from "vitest";
import { emptyEquippedLiberationEffects } from "@/adventure/data/v2/equipmentLiberationEffects";
import { emptyProficiency } from "@/adventure/data/v2/proficiency";
import { applyLiberationLevelGrowth } from "./equipmentLiberationLevelGrowth";

describe("applyLiberationLevelGrowth", () => {
  it("여러 레벨 상승에서 HP와 MP를 레벨마다 각각 균등 정수 추첨한다", () => {
    const effects = emptyEquippedLiberationEffects();
    effects.growth.levelUpMaxHpGrowth = 30;
    effects.growth.levelUpMaxMpGrowth = 10;
    const rolls = [0, 0, 0.5, 0.5, 0.999999, 0.999999];
    let index = 0;

    const result = applyLiberationLevelGrowth({
      proficiency: emptyProficiency(),
      levelsGained: 3,
      effects,
      rng: () => rolls[index++] ?? 0,
    });

    expect(index).toBe(6);
    expect(result.hpGained).toBe(45);
    expect(result.mpGained).toBe(15);
    expect(result.proficiency.liberationCycleGrowth).toEqual({ hp: 45, mp: 15 });
  });

  it("0도 정상 결과이며 기존 누적치 위에 더한다", () => {
    const effects = emptyEquippedLiberationEffects();
    effects.growth.levelUpMaxHpGrowth = 15;
    effects.growth.levelUpMaxMpGrowth = 5;
    const proficiency = {
      ...emptyProficiency(),
      liberationCycleGrowth: { hp: 100, mp: 20 },
    };

    const result = applyLiberationLevelGrowth({
      proficiency,
      levelsGained: 2,
      effects,
      rng: () => 0,
    });

    expect(result.hpGained).toBe(0);
    expect(result.mpGained).toBe(0);
    expect(result.proficiency.liberationCycleGrowth).toEqual({ hp: 100, mp: 20 });
  });

  it("레벨 상승이나 성장 옵션이 없으면 RNG를 소비하지 않는다", () => {
    let calls = 0;
    const rng = () => {
      calls += 1;
      return 0.5;
    };
    const effects = emptyEquippedLiberationEffects();
    const proficiency = emptyProficiency();

    const noLevel = applyLiberationLevelGrowth({
      proficiency,
      levelsGained: 0,
      effects,
      rng,
    });
    const noOptions = applyLiberationLevelGrowth({
      proficiency,
      levelsGained: 5,
      effects,
      rng,
    });

    expect(calls).toBe(0);
    expect(noLevel.proficiency).toBe(proficiency);
    expect(noOptions.proficiency).toBe(proficiency);
  });
});
