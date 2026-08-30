import { describe, expect, it } from "vitest";
import {
  adventureSupportRemaining,
  formatAdventureSupportExpiry,
  formatAdventureSupportRemaining,
  queuedStandardSupportMs,
} from "./adventureSupportDisplay";

describe("월간 모험 지원권 표시", () => {
  it("남은 시간을 일·시간·분으로 표시하고 분 미만은 올림한다", () => {
    const now = Date.UTC(2026, 6, 20, 0, 0, 0);
    const until = now + (7 * 24 * 60 + 17 * 60 + 8) * 60_000 + 1;
    expect(adventureSupportRemaining(until, now)).toEqual({
      days: 7,
      hours: 17,
      minutes: 9,
      expired: false,
    });
    expect(formatAdventureSupportRemaining(until, now)).toBe(
      "7일 17시간 9분 남음",
    );
  });

  it("만료된 지원권은 만료로 표시한다", () => {
    expect(adventureSupportRemaining(100, 100).expired).toBe(true);
    expect(formatAdventureSupportRemaining(99, 100)).toBe("만료됨");
  });

  it("만료 일시는 한국 시간으로 표시한다", () => {
    expect(formatAdventureSupportExpiry(Date.UTC(2026, 6, 20, 3, 30))).toBe(
      "2026년 7월 20일 12:30",
    );
  });

  it("프리미엄 뒤에 대기하는 일반 지원권 기간만 계산한다", () => {
    const now = Date.UTC(2026, 7, 30);
    const premiumUntil = now + 30 * 86_400_000;
    const activeUntil = premiumUntil + 10 * 86_400_000;

    expect(queuedStandardSupportMs(activeUntil, premiumUntil, now)).toBe(
      10 * 86_400_000,
    );
    expect(
      queuedStandardSupportMs(activeUntil, premiumUntil, premiumUntil),
    ).toBe(0);
    expect(queuedStandardSupportMs(premiumUntil, premiumUntil, now)).toBe(0);
  });
});
