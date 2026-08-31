import { describe, expect, it } from "vitest";
import {
  DANGEROUS_REALTIME_RISK_RULES,
  dangerousRealtimeBaitEffect,
  dangerousRealtimeLevelBonuses,
  dangerousRealtimeModifiers,
} from "./dangerousFishingRealtimeModifiers";

describe("위험 해역 실시간 조우 보정", () => {
  it("위험도 5는 가장 좁은 안전 구간과 가장 빠른 행동 규칙을 사용한다", () => {
    expect(DANGEROUS_REALTIME_RISK_RULES[5]).toEqual({
      safeZonePct: 34,
      minBehaviorTicks: 19,
      maxChain: 3,
      tensionImpulsePermille: 1400,
    });
  });

  it("레벨 50 이후에만 실시간 감기 효율과 장력 제어가 증가한다", () => {
    expect(dangerousRealtimeLevelBonuses(50)).toEqual({
      reelEfficiencyPct: 0,
      tensionControlPct: 0,
    });
    expect(dangerousRealtimeLevelBonuses(100)).toEqual({
      reelEfficiencyPct: 12,
      tensionControlPct: 8,
    });
    expect(dangerousRealtimeLevelBonuses(150.8)).toEqual({
      reelEfficiencyPct: 12,
      tensionControlPct: 8,
    });
  });

  it("미끼마다 한 조우에 적용할 행동 효과만 제공한다", () => {
    expect(dangerousRealtimeBaitEffect("basic_bait")).toEqual({
      turnDistanceRecoveryReductionPct: 0,
      turnTensionImpactReductionPct: 0,
      chargeAndThrashStaminaDamagePct: 0,
      telegraphCount: 0,
      diveSpeedReductionPct: 0,
      startingStaminaReductionPct: 0,
      tensionImpulseReductionPct: 0,
      maxTimeReductionPct: 0,
    });
    expect(dangerousRealtimeBaitEffect("reef_bait")).toMatchObject({
      turnDistanceRecoveryReductionPct: 20,
      turnTensionImpactReductionPct: 20,
      maxTimeReductionPct: 20,
    });
    expect(dangerousRealtimeBaitEffect("blood_bait")).toMatchObject({
      chargeAndThrashStaminaDamagePct: 20,
      maxTimeReductionPct: 20,
    });
    expect(dangerousRealtimeBaitEffect("luminous_bait")).toMatchObject({
      telegraphCount: 1,
      diveSpeedReductionPct: 15,
      maxTimeReductionPct: 15,
    });
    expect(dangerousRealtimeBaitEffect("abyss_bait")).toMatchObject({
      startingStaminaReductionPct: 10,
      tensionImpulseReductionPct: 12,
      maxTimeReductionPct: 10,
    });
  });

  it("레벨과 강화에서 정한 시간 단축은 조우 시작 시 35%로 제한한다", () => {
    expect(
      dangerousRealtimeModifiers({
        fishingLevel: 100,
        baitId: "blood_bait",
        rodEnhancementLevel: 3,
        reelEnhancementLevel: 3,
        lineEnhancementLevel: 3,
        cargoProtectionPct: 15,
      }),
    ).toMatchObject({
      reelEfficiencyPct: 12,
      tensionControlPct: 8,
      staminaDamagePct: 18,
      distanceRecoveryPct: 15,
      safeZoneBonusPct: 9,
      cargoProtectionPct: 21,
      timeReductionPct: 35,
    });
  });

  it("각 미끼의 시간 단축 기여는 조우 시작 시 한 번만 합산한다", () => {
    expect(
      (["basic_bait", "reef_bait", "blood_bait", "luminous_bait", "abyss_bait"] as const).map(
        (baitId) =>
          dangerousRealtimeModifiers({
            fishingLevel: 50,
            baitId,
            rodEnhancementLevel: 0,
            reelEnhancementLevel: 0,
            lineEnhancementLevel: 0,
          }).timeReductionPct,
      ),
    ).toEqual([0, 20, 20, 15, 10]);
  });

  it("기존 레벨 보조·내재 장비·계보 보정을 같은 실제 성능 예산에 합친다", () => {
    const level50 = dangerousRealtimeModifiers({
      fishingLevel: 50,
      baitId: "basic_bait",
      reelPowerBonus: 2,
      staminaDamageBonus: 4,
      tensionControlBonus: 3,
      slackTolerance: 1,
      telegraphSteps: 1,
    });
    const level100 = dangerousRealtimeModifiers({
      fishingLevel: 100,
      baitId: "basic_bait",
      reelPowerBonus: 2,
      staminaDamageBonus: 4,
      tensionControlBonus: 3,
      slackTolerance: 1,
      telegraphSteps: 1,
    });

    expect(level50).toMatchObject({
      reelEfficiencyPct: 0,
      tensionControlPct: 3,
      staminaDamagePct: 4,
      distanceRecoveryPct: 2,
      lowTensionGraceTicks: 40,
      telegraphCount: 1,
      timeReductionPct: 9,
    });
    expect(level100).toMatchObject({
      reelEfficiencyPct: 12,
      tensionControlPct: 11,
      staminaDamagePct: 4,
      distanceRecoveryPct: 2,
      lowTensionGraceTicks: 40,
      telegraphCount: 1,
      timeReductionPct: 29,
    });
  });

  it("내재 장비와 강화가 35% 예산을 함께 넘으면 합산 기여를 한 번만 제한한다", () => {
    const modifiers = dangerousRealtimeModifiers({
      fishingLevel: 100,
      baitId: "blood_bait",
      reelPowerBonus: 7,
      staminaDamageBonus: 12,
      tensionControlBonus: 5,
      rodEnhancementLevel: 3,
      reelEnhancementLevel: 3,
      lineEnhancementLevel: 3,
      slackTolerance: 1,
      telegraphSteps: 1,
    });

    expect(modifiers).toMatchObject({
      tensionControlPct: 13,
      staminaDamagePct: 30,
      distanceRecoveryPct: 22,
      safeZoneBonusPct: 9,
      lowTensionGraceTicks: 40,
      telegraphCount: 1,
      timeReductionPct: 35,
    });
  });
});
