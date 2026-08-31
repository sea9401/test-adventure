import { describe, expect, it } from "vitest";
import {
  FORTRESS_IMPACT_MAX,
  consumeReactiveDefenseCharges,
  ironWallDamageReductionPct,
  resolveFortressReaction,
} from "./fortressKnight";

describe("fortress knight reaction", () => {
  it("명중하면 철벽 반사 1회를 소비하고 방어력 180%를 반사 원량으로 만든다", () => {
    expect(ironWallDamageReductionPct(3)).toBe(30);

    expect(
      resolveFortressReaction({
        landed: true,
        defenderDef: 900,
        impact: 0,
        impactOnHit: true,
        ironWallReflectCharges: 3,
      }),
    ).toEqual({
      impact: 1,
      ironWallReflectCharges: 2,
      ironWallReflected: true,
      rawReflectDamage: 1620,
    });
  });

  it("충격은 최대 3이며 철벽 횟수가 없어도 피격으로 획득한다", () => {
    expect(
      resolveFortressReaction({
        landed: true,
        defenderDef: 900,
        impact: FORTRESS_IMPACT_MAX,
        impactOnHit: true,
        ironWallReflectCharges: 0,
      }),
    ).toEqual({
      impact: 3,
      ironWallReflectCharges: 0,
      ironWallReflected: false,
      rawReflectDamage: 0,
    });
  });

  it("빗나간 공격은 철벽 횟수와 충격을 바꾸지 않는다", () => {
    expect(
      resolveFortressReaction({
        landed: false,
        defenderDef: 900,
        impact: 2,
        impactOnHit: true,
        ironWallReflectCharges: 3,
      }),
    ).toEqual({
      impact: 2,
      ironWallReflectCharges: 3,
      ironWallReflected: false,
      rawReflectDamage: 0,
    });
  });
});

describe("reactive defensive buff charges", () => {
  it("명중한 직접 공격은 사용된 회피·피해 감소·반사 증가를 각각 한 번만 소비한다", () => {
    expect(
      consumeReactiveDefenseCharges(
        { evasion: 2, damageReduction: 2, reflect: 2 },
        { evasionUsed: true, landed: true, reflectEligible: true },
      ),
    ).toEqual({ evasion: 1, damageReduction: 1, reflect: 1 });
  });

  it("빗나가면 판정에 사용된 회피만 소비하고 지속 피해는 아무것도 소비하지 않는다", () => {
    const charges = { evasion: 2, damageReduction: 2, reflect: 2 };
    expect(
      consumeReactiveDefenseCharges(charges, {
        evasionUsed: true,
        landed: false,
        reflectEligible: false,
      }),
    ).toEqual({ evasion: 1, damageReduction: 2, reflect: 2 });
    expect(
      consumeReactiveDefenseCharges(charges, {
        evasionUsed: false,
        landed: false,
        reflectEligible: false,
      }),
    ).toEqual(charges);
  });
});
