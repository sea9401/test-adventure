import { describe, expect, it } from "vitest";

import {
  glacialChillSpeedMultiplier,
  rescaleReservedPlayerTick,
  resolveGlacialChillGain,
} from "./glacialColossusMechanic";

describe("glacial colossus mechanic", () => {
  it("한기 9중첩은 속도를 63% 줄인다", () => {
    expect(glacialChillSpeedMultiplier(0)).toBe(1);
    expect(glacialChillSpeedMultiplier(9)).toBeCloseTo(0.37, 10);
  });

  it("9+1과 8+2는 한 번 빙결하고 초과분 없이 0중첩이 된다", () => {
    expect(
      resolveGlacialChillGain({ current: 9, gain: 1, freezePending: 0 }),
    ).toEqual({
      stacks: 0,
      freezePending: 1,
      triggered: true,
      appliedGain: 1,
    });
    expect(
      resolveGlacialChillGain({ current: 8, gain: 2, freezePending: 0 }),
    ).toEqual({
      stacks: 0,
      freezePending: 1,
      triggered: true,
      appliedGain: 2,
    });
  });

  it("빙결 예약 중에는 새 한기를 쌓지 않는다", () => {
    expect(
      resolveGlacialChillGain({ current: 0, gain: 2, freezePending: 1 }),
    ).toEqual({
      stacks: 0,
      freezePending: 1,
      triggered: false,
      appliedGain: 0,
    });
  });

  it("중첩 증가와 정화는 남은 예약 시간을 속도 비율로 조정한다", () => {
    expect(
      rescaleReservedPlayerTick({
        currentTick: 100,
        playerNextTick: 200,
        previousStacks: 0,
        nextStacks: 5,
      }),
    ).toBeCloseTo(253.8461538462, 8);
    expect(
      rescaleReservedPlayerTick({
        currentTick: 100,
        playerNextTick: 253.8461538462,
        previousStacks: 5,
        nextStacks: 0,
      }),
    ).toBeCloseTo(200, 8);
  });

  it("손상된 값은 유한한 안전 범위로 정규화한다", () => {
    expect(glacialChillSpeedMultiplier(Number.POSITIVE_INFINITY)).toBe(1);
    expect(
      resolveGlacialChillGain({
        current: Number.NaN,
        gain: -10,
        freezePending: -1,
      }),
    ).toEqual({
      stacks: 0,
      freezePending: 0,
      triggered: false,
      appliedGain: 0,
    });
    expect(
      rescaleReservedPlayerTick({
        currentTick: Number.NaN,
        playerNextTick: Number.POSITIVE_INFINITY,
        previousStacks: Number.NaN,
        nextStacks: Number.POSITIVE_INFINITY,
      }),
    ).toBe(0);
  });
});
