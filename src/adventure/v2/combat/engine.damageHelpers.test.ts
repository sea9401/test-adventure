import { describe, it, expect } from "vitest";
import {
  CRIT_OVERFLOW_DMG_CAP,
  CRIT_OVERFLOW_DMG_PER_PCT,
  CRIT_PCT_CAP,
} from "@/adventure/data/stats";
import { DEF_IGNORE_FRACTION } from "@/adventure/v2/combat/engine";
import {
  applyDefIgnore,
  computeAfterCrush,
  computeBalanceCritBonus,
  computeBerserkBonus,
  computeCritOverflowBonus,
  computeDirectSkillDamage,
  computeStormBonus,
  reducedMagicDefense,
  resolveCriticalChanceAfterResistance,
} from "@/adventure/v2/combat/engine.damageHelpers";

// 각 헬퍼가 추출 전 인라인 표현식과 "값이 1:1 동일"함을 직접 단언한다(골든 커버리지와 독립).
describe("engine.damageHelpers — 인라인 수식 동치", () => {
  it("computeAfterCrush = bonus>0&&crush>0 ? max(0,baseDef-crush) : baseDef", () => {
    const cases: Array<[number, number, number]> = [
      [100, 0, 10], [100, 5, 0], [100, 5, 30], [20, 5, 50], [0, 5, 5], [80, 3, 80],
    ];
    for (const [baseDef, bonus, crush] of cases) {
      const ref = bonus > 0 && crush > 0 ? Math.max(0, baseDef - crush) : baseDef;
      expect(computeAfterCrush(baseDef, bonus, crush)).toBe(ref);
    }
  });

  it("applyDefIgnore = ignore ? round(d*(1-FRAC)) : d", () => {
    for (const d of [0, 50, 100, 33, 1]) {
      for (const ig of [true, false]) {
        const ref = ig ? Math.round(d * (1 - DEF_IGNORE_FRACTION)) : d;
        expect(applyDefIgnore(d, ig)).toBe(ref);
      }
    }
  });

  it("computeBerserkBonus = (pct??0)>0 ? floor(atk*lostFrac*pct) : 0", () => {
    const cases: Array<[number, number, number, number | undefined]> = [
      [200, 50, 100, 0.5], [200, 100, 100, 0.5], [200, 0, 100, 0.5],
      [200, 50, 100, undefined], [200, 50, 100, 0], [150, 30, 200, 1.2],
    ];
    for (const [atk, hp, max, pct] of cases) {
      const p = pct ?? 0;
      const ref = p > 0 ? Math.floor(atk * Math.max(0, 1 - hp / max) * p) : 0;
      expect(computeBerserkBonus(atk, hp, max, pct)).toBe(ref);
    }
  });

  it("computeBalanceCritBonus = (pct??0)>0 ? floor(max(0,atkSpd-defSpd)*pct) : 0", () => {
    const cases: Array<[number, number, number | undefined]> = [
      [100, 80, 0.5], [80, 100, 0.5], [100, 80, undefined], [100, 80, 0], [200, 50, 1.3],
    ];
    for (const [a, d, pct] of cases) {
      const p = pct ?? 0;
      const ref = p > 0 ? Math.floor(Math.max(0, a - d) * p) : 0;
      expect(computeBalanceCritBonus(a, d, pct)).toBe(ref);
    }
  });

  it("computeCritOverflowBonus = min(CAP, max(0,raw-PCTCAP)*PER)", () => {
    for (const raw of [0, 50, CRIT_PCT_CAP, CRIT_PCT_CAP + 10, 200, 1000]) {
      const ref = Math.min(
        CRIT_OVERFLOW_DMG_CAP,
        Math.max(0, raw - CRIT_PCT_CAP) * CRIT_OVERFLOW_DMG_PER_PCT,
      );
      expect(computeCritOverflowBonus(raw)).toBe(ref);
    }
  });

  it("치명타 저항을 먼저 차감한 뒤 확률 상한과 초과 피해를 계산한다", () => {
    expect(resolveCriticalChanceAfterResistance(150, 50)).toEqual({
      resistedCritPct: 100,
      effectiveCritPct: 75,
      overflowDamageBonus: 0.25,
    });
    expect(resolveCriticalChanceAfterResistance(40, 60)).toEqual({
      resistedCritPct: 0,
      effectiveCritPct: 0,
      overflowDamageBonus: 0,
    });
    expect(resolveCriticalChanceAfterResistance(150, 50, 100)).toEqual({
      resistedCritPct: 100,
      effectiveCritPct: 100,
      overflowDamageBonus: 0.25,
    });
  });

  it("computeStormBonus = storm-kind ? floor(atk*spdPct/100) : 0", () => {
    expect(computeStormBonus(100, null as never)).toBe(0);
    expect(computeStormBonus(100, undefined as never)).toBe(0);
    expect(
      computeStormBonus(137, { kind: "atk_plus_spd_pct_bonus", spdPct: 50 } as never),
    ).toBe(Math.floor((137 * 50) / 100));
    expect(computeStormBonus(100, { kind: "heal_pct", pct: 10 } as never)).toBe(0);
  });

  it("reducedMagicDefense clamps reduction and preserves existing rounding", () => {
    expect(reducedMagicDefense(101, 0)).toBe(101);
    expect(reducedMagicDefense(101, 25)).toBe(76);
    expect(reducedMagicDefense(101, -20)).toBe(101);
    expect(reducedMagicDefense(101, 999)).toBe(40);
    expect(reducedMagicDefense(0, 50)).toBe(0);
  });

  it("computeDirectSkillDamage 는 치명타일 때 직접 마법 피해분에만 전환 보너스를 더한다", () => {
    expect(
      computeDirectSkillDamage({
        totalDamage: 100,
        magicDamage: 100,
        preCriticalMultiplier: 1.2,
        criticalMultiplier: 2,
        equipmentMagicCritBonus: 0.3,
        critical: true,
      }),
    ).toBe(276);
    expect(
      computeDirectSkillDamage({
        totalDamage: 150,
        magicDamage: 50,
        preCriticalMultiplier: 1.2,
        criticalMultiplier: 2,
        equipmentMagicCritBonus: 0.3,
        critical: true,
      }),
    ).toBe(378);
  });

  it("computeDirectSkillDamage 는 비치명·0 보너스에서 기존 단일 floor 결과를 보존한다", () => {
    expect(
      computeDirectSkillDamage({
        totalDamage: 101,
        magicDamage: 101,
        preCriticalMultiplier: 1.13,
        criticalMultiplier: 1.7,
        equipmentMagicCritBonus: 0,
        critical: true,
      }),
    ).toBe(Math.floor(101 * 1.13 * 1.7));
    expect(
      computeDirectSkillDamage({
        totalDamage: 100,
        magicDamage: 100,
        preCriticalMultiplier: 1.2,
        criticalMultiplier: 1,
        equipmentMagicCritBonus: 0.3,
        critical: false,
      }),
    ).toBe(120);
  });

  it("computeDirectSkillDamage 는 잘못된 마법 피해분을 총 직접 피해 범위로 제한한다", () => {
    expect(
      computeDirectSkillDamage({
        totalDamage: 100,
        magicDamage: 150,
        preCriticalMultiplier: 1,
        criticalMultiplier: 2,
        equipmentMagicCritBonus: 0.3,
        critical: true,
      }),
    ).toBe(230);
    expect(
      computeDirectSkillDamage({
        totalDamage: 100,
        magicDamage: -50,
        preCriticalMultiplier: 1,
        criticalMultiplier: 2,
        equipmentMagicCritBonus: 0.3,
        critical: true,
      }),
    ).toBe(200);
  });
});
