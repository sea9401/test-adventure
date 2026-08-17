import { describe, expect, it } from "vitest";
import {
  jobSpRebalanceState,
  jobUnlockSpForCount,
} from "./jobSpPolicy";

describe("jobUnlockSpForCount", () => {
  it.each([
    [0, 0],
    [50, 50],
    [51, 50],
    [52, 51],
    [121, 85],
    [122, 86],
  ])("해금 직업 %i개를 직업 SP %i로 환산한다", (count, expected) => {
    expect(jobUnlockSpForCount(count)).toBe(expected);
  });

  it("손상되거나 음수인 해금 수를 0으로 보정한다", () => {
    expect(jobUnlockSpForCount(Number.NaN)).toBe(0);
    expect(jobUnlockSpForCount(-10)).toBe(0);
  });
});

describe("jobSpRebalanceState", () => {
  const startedAt = Date.UTC(2026, 7, 17, 0, 0, 0);

  it("시작 시각부터 정확히 24시간 동안 유예를 활성화한다", () => {
    expect(
      jobSpRebalanceState({ startedAt }, startedAt + 1),
    ).toEqual({
      startedAt,
      endsAt: startedAt + 24 * 60 * 60 * 1_000,
      active: true,
    });
  });

  it("종료 시각부터는 유예를 비활성화한다", () => {
    expect(
      jobSpRebalanceState(
        { startedAt },
        startedAt + 24 * 60 * 60 * 1_000,
      ).active,
    ).toBe(false);
  });

  it("ISO 시작 시각을 허용하고 누락·손상·미래 시각은 유예 없음으로 처리한다", () => {
    expect(
      jobSpRebalanceState(
        { startedAt: new Date(startedAt).toISOString() },
        startedAt + 1,
      ).active,
    ).toBe(true);
    expect(jobSpRebalanceState(undefined, startedAt)).toEqual({
      startedAt: null,
      endsAt: null,
      active: false,
    });
    expect(jobSpRebalanceState({ startedAt: "invalid" }, startedAt).active).toBe(
      false,
    );
    expect(jobSpRebalanceState({ startedAt: startedAt + 1 }, startedAt).active).toBe(
      false,
    );
  });
});
