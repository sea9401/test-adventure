import { describe, expect, it } from "vitest";
import {
  TRACKING_ELIMINATION_HIT_MULTIPLIER,
  accumulateTrackingThreat,
  resolveTrackingThreatAfterPlayerAction,
  trackingThreatGain,
} from "./trackingWeaponMechanic";

describe("tracking weapon threat", () => {
  it("출시 반격은 보스 기본 물리 공격의 2배 2타를 사용한다", () => {
    expect(TRACKING_ELIMINATION_HIT_MULTIPLIER).toBe(2);
  });

  it("보스 최대 HP 비례 피해와 직접 타격 횟수를 함께 계산한다", () => {
    expect(
      trackingThreatGain({
        damage: 108_000,
        bossMaxHp: 10_800_000,
        directHits: 2,
      }),
    ).toBe(13);
  });

  it("적 행동 중 쌓인 위협은 100에서 준비 상태로 멈춘다", () => {
    expect(accumulateTrackingThreat({ current: 94, gain: 20 })).toBe(100);
  });

  it("플레이어 행동은 한 번만 발동하고 초과분을 99 이하로 남긴다", () => {
    expect(
      resolveTrackingThreatAfterPlayerAction({
        current: 90,
        gain: 125,
        bossAlive: true,
      }),
    ).toEqual({ threat: 99, triggered: true });
  });

  it("플레이어 행동으로 보스를 처치하면 반격 없이 위협을 초기화한다", () => {
    expect(
      resolveTrackingThreatAfterPlayerAction({
        current: 99,
        gain: 20,
        bossAlive: false,
      }),
    ).toEqual({ threat: 0, triggered: false });
  });

  it("손상된 입력을 음수가 아닌 정수로 보정한다", () => {
    expect(
      trackingThreatGain({ damage: Number.NaN, bossMaxHp: 0, directHits: -3 }),
    ).toBe(0);
    expect(accumulateTrackingThreat({ current: -10, gain: 4.9 })).toBe(4);
  });
});
