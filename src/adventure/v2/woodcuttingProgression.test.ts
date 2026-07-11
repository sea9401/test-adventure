import { describe, expect, it } from "vitest";
import {
  WOODCUTTING_LEVEL_CAP,
  WOODCUTTING_XP_PER_CUT,
  woodcuttingLevelForXp,
  woodcuttingProgressionView,
  woodcuttingXpForLevel,
} from "./woodcuttingProgression";

describe("벌목 진행도", () => {
  it("벌목 1회당 10 XP를 기존 완료 횟수에서 환산한다", () => {
    const view = woodcuttingProgressionView(7);
    expect(view).toMatchObject({
      level: 2,
      xp: 7 * WOODCUTTING_XP_PER_CUT,
      xpIntoLevel: 30,
      xpForNext: 120,
      cuts: 7,
      maxLevel: false,
    });
  });

  it("레벨은 제곱 곡선에 따라 상승한다", () => {
    expect(woodcuttingXpForLevel(1)).toBe(0);
    expect(woodcuttingXpForLevel(2)).toBe(40);
    expect(woodcuttingXpForLevel(3)).toBe(160);
    expect(woodcuttingLevelForXp(39)).toBe(1);
    expect(woodcuttingLevelForXp(40)).toBe(2);
    expect(woodcuttingLevelForXp(160)).toBe(3);
  });

  it("50레벨에서 멈추고 다음 경험치를 요구하지 않는다", () => {
    const view = woodcuttingProgressionView(999_999);
    expect(view.level).toBe(WOODCUTTING_LEVEL_CAP);
    expect(view.maxLevel).toBe(true);
    expect(view.xpIntoLevel).toBe(0);
    expect(view.xpForNext).toBe(0);
  });

  it("깨진 완료 횟수는 0으로 정리한다", () => {
    expect(woodcuttingProgressionView(Number.NaN)).toMatchObject({ level: 1, xp: 0, cuts: 0 });
    expect(woodcuttingProgressionView(-20)).toMatchObject({ level: 1, xp: 0, cuts: 0 });
  });
});
