import { describe, it, expect } from "vitest";
import {
  derivePowerScore,
  effectiveAttackPowerForScore,
  effectiveRatingForPower,
  POWER_SPD_CAP,
  V2_POWER_WEIGHT,
} from "./power";

describe("v2 콘텐츠 파워 지표", () => {
  it("derivePowerScore — 기본 전투 스탯과 회피도·적중도를 합산한다", () => {
    // atk20 + magicAtk0 + def10 + maxHp200×0.1(20) + spd30×0.5(15) + maxMp0 = 65
    expect(
      derivePowerScore({ atk: 20, def: 10, spd: 30, maxHp: 200 }),
    ).toBe(65);
    expect(
      derivePowerScore({
        atk: 20,
        def: 10,
        spd: 30,
        maxHp: 200,
        evaRating: 100,
        accRating: 100,
      }),
    ).toBe(144);
  });

  it("magicAtk·maxMp 도 합산 (마법 빌드)", () => {
    // atk0 + magicAtk40 + def8 + maxHp180×0.1(18) + spd24×0.5(12) + maxMp120×0.1(12) = 90
    expect(
      derivePowerScore({
        atk: 0,
        magicAtk: 40,
        def: 8,
        spd: 24,
        maxHp: 180,
        maxMp: 120,
      }),
    ).toBe(90);
  });

  it("물공·마공은 주 공격력과 보조 공격력 25%만 반영한다", () => {
    expect(effectiveAttackPowerForScore(100, 80)).toBe(120);
    expect(effectiveAttackPowerForScore(80, 100)).toBe(120);
  });

  it("속도는 ATB 상한 이후, 회피·적중은 고레이팅에서 점감한다", () => {
    const capped = derivePowerScore({
      atk: 0,
      def: 0,
      spd: POWER_SPD_CAP,
      maxHp: 0,
    });
    const overflow = derivePowerScore({
      atk: 0,
      def: 0,
      spd: POWER_SPD_CAP * 10,
      maxHp: 0,
    });
    expect(overflow).toBe(capped);
    expect(effectiveRatingForPower(100)).toBeCloseTo(99.0066, 3);
    expect(effectiveRatingForPower(10_000)).toBeLessThan(5_000);
  });

  it("마력 장벽은 유한 내구도·부분 흡수임을 반영해 보수적으로 합산한다", () => {
    expect(
      derivePowerScore({
        atk: 0,
        def: 0,
        spd: 0,
        maxHp: 0,
        magicBarrierMax: 1_000,
      }),
    ).toBe(30);
  });

  it("magicAtk/maxMp 미지정은 0 취급", () => {
    expect(derivePowerScore({ atk: 0, def: 0, spd: 0, maxHp: 0 })).toBe(0);
  });

  it("가중치 상수 노출 — 캘리브 다이얼(PR-9)", () => {
    expect(V2_POWER_WEIGHT.hp).toBe(0.1);
    expect(V2_POWER_WEIGHT.spd).toBe(0.5);
    expect(V2_POWER_WEIGHT.mp).toBe(0.1);
    expect(V2_POWER_WEIGHT.magicBarrier).toBe(0.03);
    expect(V2_POWER_WEIGHT.evasion).toBe(0.45);
    expect(V2_POWER_WEIGHT.accuracy).toBe(0.35);
  });
});
