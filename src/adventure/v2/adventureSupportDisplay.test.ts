import { describe, expect, it } from "vitest";
import {
  adventureSupportRemaining,
  adventureSupportUseNotice,
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

  it("프리미엄 사용 알림은 연장권 지급과 사용 위치를 알린다", () => {
    expect(
      adventureSupportUseNotice({ premiumItem: true, daysAdded: 30, tier: "premium" }),
    ).toBe(
      "월간 모험 지원권 프리미엄 30일 적용 · 꾸미기 30일 연장권 2개 지급 (설정 메뉴의 꾸미기에서 사용)",
    );
  });

  it("프리미엄 이용 중 일반 지원권을 쓰면 프리미엄 종료 뒤 이어진다고 알린다", () => {
    expect(
      adventureSupportUseNotice({ premiumItem: false, daysAdded: 30, tier: "premium" }),
    ).toBe("월간 모험 지원권 30일 추가 · 프리미엄 종료 뒤부터 이어집니다");
    expect(
      adventureSupportUseNotice({ premiumItem: false, daysAdded: 30, tier: "standard" }),
    ).toBe("월간 모험 지원권 30일 적용");
  });
});
