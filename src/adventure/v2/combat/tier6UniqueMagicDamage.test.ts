import { describe, expect, it } from "vitest";
import {
  effectiveTier6MagicDefense,
  tier6DamageAfterMultiplier,
  tier6MagicDamageAfterMitigation,
} from "./tier6UniqueMagicDamage";

describe("6T 과부하 낙뢰 마법 피해", () => {
  it("마법방어 감소를 기존 곱연산 규칙과 합산 상한으로 한 번 적용한다", () => {
    expect(
      effectiveTier6MagicDefense({
        baseDefense: 400,
        reductionPcts: [10, 20],
      }),
    ).toBe(288);
  });

  it("마법방어 뒤 받는 피해 감소를 적용한다", () => {
    const mitigated = tier6MagicDamageAfterMitigation({
      rawDamage: 700,
      magicDefense: 300,
      damageTakenReductionPct: 25,
    });

    expect(mitigated).toBe(300);
    expect(tier6DamageAfterMultiplier(mitigated, 0.65)).toBe(195);
  });
});
