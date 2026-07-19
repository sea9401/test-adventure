import { describe, expect, it } from "vitest";
import {
  adventureSupportRemainingDays,
  formatAdventureSupportExpiry,
} from "./adventureSupportDisplay";

describe("월간 모험 지원권 표시", () => {
  it("남은 시간을 올림해 이용 가능한 일수로 표시한다", () => {
    const now = Date.UTC(2026, 6, 20, 0, 0, 0);
    expect(adventureSupportRemainingDays(now + 30 * 86_400_000, now)).toBe(30);
    expect(adventureSupportRemainingDays(now + 29 * 86_400_000 + 1, now)).toBe(
      30,
    );
  });

  it("만료된 지원권은 0일로 표시한다", () => {
    expect(adventureSupportRemainingDays(100, 100)).toBe(0);
    expect(adventureSupportRemainingDays(99, 100)).toBe(0);
  });

  it("만료 일시는 한국 시간으로 표시한다", () => {
    expect(formatAdventureSupportExpiry(Date.UTC(2026, 6, 20, 3, 30))).toBe(
      "2026년 7월 20일 12:30",
    );
  });
});
