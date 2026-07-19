import { describe, expect, it } from "vitest";
import {
  ADVENTURE_SUPPORT_PASS,
  huntCountsForAdventureSupport,
  maxHuntBatchForAdventureSupport,
  normalizeHuntCount,
} from "./adventureSupport";

describe("월간 모험 지원권", () => {
  it("미가입자는 10회까지만 선택할 수 있다", () => {
    expect(huntCountsForAdventureSupport(false)).toEqual([1, 5, 10]);
    expect(maxHuntBatchForAdventureSupport(false)).toBe(10);
    expect(normalizeHuntCount(50, false)).toBe(1);
  });

  it("활성 이용자는 50회 전투를 선택할 수 있다", () => {
    expect(huntCountsForAdventureSupport(true)).toEqual([1, 5, 10, 50]);
    expect(maxHuntBatchForAdventureSupport(true)).toBe(50);
    expect(normalizeHuntCount(50, true)).toBe(50);
  });

  it("지원권 가격과 기간을 고정한다", () => {
    expect(ADVENTURE_SUPPORT_PASS.coinPrice).toBe(800);
    expect(ADVENTURE_SUPPORT_PASS.durationDays).toBe(30);
  });
});
