import { describe, expect, it } from "vitest";
import {
  describeWeightCycle,
  weightCyclePowerValue,
  type WeightCycleMechanic,
} from "./weightCycle";

describe("weightCyclePowerValue", () => {
  it("메커닉이 없으면 0점이다", () => {
    expect(weightCyclePowerValue(undefined, 2)).toBe(0);
  });

  const BASE: Record<string, [WeightCycleMechanic, WeightCycleMechanic]> = {
    amountFromEmpty: [
      { gain: { amount: 1, amountFromEmpty: 1 } },
      { gain: { amount: 1, amountFromEmpty: 2 } },
    ],
    overloadPenetrationPct: [
      { gain: { amount: 1, overloadPenetrationPct: 5 } },
      { gain: { amount: 1, overloadPenetrationPct: 10 } },
    ],
    damagePctPerStack: [
      { release: { damagePctPerStack: 15 } },
      { release: { damagePctPerStack: 18 } },
    ],
    enemyDelayPctPerStack: [
      { release: { damagePctPerStack: 0, enemyDelayPctPerStack: 3, enemyDelayMaxPct: 18 } },
      { release: { damagePctPerStack: 0, enemyDelayPctPerStack: 6, enemyDelayMaxPct: 18 } },
    ],
    enemyDelayMaxPct: [
      { release: { damagePctPerStack: 0, enemyDelayPctPerStack: 6, enemyDelayMaxPct: 6 } },
      { release: { damagePctPerStack: 0, enemyDelayPctPerStack: 6, enemyDelayMaxPct: 18 } },
    ],
    fullPenetrationPct: [
      { release: { damagePctPerStack: 0, fullPenetrationPct: 6 } },
      { release: { damagePctPerStack: 0, fullPenetrationPct: 12 } },
    ],
    fullActualDamageHealPct: [
      { release: { damagePctPerStack: 0, fullActualDamageHealPct: 7 } },
      { release: { damagePctPerStack: 0, fullActualDamageHealPct: 14 } },
    ],
    fullCastHastePct: [
      { release: { damagePctPerStack: 0, fullCastHastePct: 5 } },
      { release: { damagePctPerStack: 0, fullCastHastePct: 15 } },
    ],
    hastePctPerStack: [
      { onRelease: { hastePctPerStack: 3, hasteMaxPct: 15 } },
      { onRelease: { hastePctPerStack: 5, hasteMaxPct: 15 } },
    ],
    hasteMaxPct: [
      { onRelease: { hastePctPerStack: 5, hasteMaxPct: 5 } },
      { onRelease: { hastePctPerStack: 5, hasteMaxPct: 15 } },
    ],
    shieldMaxHpPctPerStack: [
      { onRelease: { shieldMaxHpPctPerStack: 2 } },
      { onRelease: { shieldMaxHpPctPerStack: 3 } },
    ],
    regainWeight: [
      { onRelease: { regainWeight: 1 } },
      { onRelease: { regainWeight: 2 } },
    ],
    speedPenaltyPctPerStack: [
      { speedPenaltyPctPerStack: 4 },
      { speedPenaltyPctPerStack: 3 },
    ],
    fullWeightDirectPhysicalDamagePct: [
      { fullWeightDirectPhysicalDamagePct: 5 },
      { fullWeightDirectPhysicalDamagePct: 10 },
    ],
    fullWeightDamageTakenReductionPct: [
      { fullWeightDamageTakenReductionPct: 4 },
      { fullWeightDamageTakenReductionPct: 8 },
    ],
  };

  it.each(Object.entries(BASE))(
    "%s 상향은 점수를 엄격히 올린다",
    (_key, [lower, higher]) => {
      expect(weightCyclePowerValue(higher, 2)).toBeGreaterThan(
        weightCyclePowerValue(lower, 2),
      );
    },
  );

  it("해방 피해 증가는 액티브 기본 점수에 비례한다", () => {
    const m: WeightCycleMechanic = { release: { damagePctPerStack: 15 } };
    expect(weightCyclePowerValue(m, 2)).toBeCloseTo(
      weightCyclePowerValue(m, 1) * 2,
      10,
    );
  });
});

describe("describeWeightCycle", () => {
  it("축적량과 빈 중량 보너스를 표시한다", () => {
    expect(describeWeightCycle({ gain: { amount: 1, amountFromEmpty: 2 } }))
      .toEqual(["중량 +1 · 중량 0에서 +2 (최대 3)"]);
  });

  it("과적 타격 관통을 표시한다", () => {
    expect(
      describeWeightCycle({ gain: { amount: 1, overloadPenetrationPct: 10 } }),
    ).toContain("중량 3에서 과적 타격: 방어 관통 +10%p");
  });

  it("해방 가속을 표시한다", () => {
    expect(
      describeWeightCycle({ onRelease: { hastePctPerStack: 5, hasteMaxPct: 15 } }),
    ).toEqual(["해방 시 소모 1당 다음 행동 5% 가속 (최대 15%)"]);
  });

  it("SPD 완화를 표시한다", () => {
    expect(describeWeightCycle({ speedPenaltyPctPerStack: 3 })).toEqual([
      "중량당 SPD 감소 5% → 3%",
    ]);
  });

  it("해방 피해와 완전 해방 보너스를 표시한다", () => {
    expect(
      describeWeightCycle({
        release: {
          damagePctPerStack: 20,
          fullPenetrationPct: 12,
          fullCastHastePct: 15,
        },
      }),
    ).toEqual([
      "중량 전부 소모 · 소모 1당 최종 피해 +20%",
      "중량 3 소모 시 방어 관통 +12%p",
      "중량 3 소모 시 다음 행동 15% 가속",
    ]);
  });
});
