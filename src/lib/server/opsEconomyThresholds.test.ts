import { describe, expect, it } from "vitest";
import {
  LARGE_GOLD_MOVEMENT_MIN,
  isLargeGoldMovement,
} from "./opsEconomyThresholds";

describe("대규모 골드 운영 경보 기준", () => {
  it("일반적인 1천만 골드 소비는 제외하고 2천만부터 감지한다", () => {
    expect(LARGE_GOLD_MOVEMENT_MIN).toBe(20_000_000);
    expect(isLargeGoldMovement(10_000_000)).toBe(false);
    expect(isLargeGoldMovement(-19_999_999)).toBe(false);
    expect(isLargeGoldMovement(20_000_000)).toBe(true);
    expect(isLargeGoldMovement(-25_000_000)).toBe(true);
  });
});
