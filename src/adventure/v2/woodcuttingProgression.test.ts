import { describe, expect, it } from "vitest";
import {
  WOODCUTTING_LEVEL_CAP,
  WOODCUTTING_XP_PER_CUT,
  woodcuttingDurationForLevel,
  woodcuttingDurationWithPassive,
  woodcuttingFailureRate,
  woodcuttingLevelForXp,
  woodcuttingProgressionView,
  woodcuttingTimeReduction,
  woodcuttingTotalTimeReduction,
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

  it("수종별 XP를 직접 반영할 수 있다", () => {
    expect(woodcuttingProgressionView(1, 160)).toMatchObject({ level: 3, xp: 160 });
  });

  it("레벨당 0.2%씩 벌목 시간을 줄이되 약 10% 이내로 제한한다", () => {
    expect(woodcuttingTimeReduction(1)).toBe(0);
    expect(woodcuttingTimeReduction(11)).toBeCloseTo(0.02);
    expect(woodcuttingTimeReduction(50)).toBeCloseTo(0.098);
    expect(woodcuttingDurationForLevel(9_000, 1)).toBe(9_000);
    expect(woodcuttingDurationForLevel(9_000, 50)).toBe(8_100);
  });

  it("장착 패시브 시간 단축을 서버 세션과 예상 시간에 동일하게 적용한다", () => {
    expect(woodcuttingDurationWithPassive(9_000, 1, 8)).toBe(8_300);
    expect(woodcuttingDurationWithPassive(9_000, 50, 8)).toBe(7_500);
    expect(woodcuttingTotalTimeReduction(1, 8)).toBeCloseTo(0.08);
    expect(woodcuttingTotalTimeReduction(50, 8)).toBeCloseTo(0.17016);
  });

  it("벌목 레벨이 오를수록 실패율을 상대적으로 낮춘다", () => {
    expect(woodcuttingFailureRate(0.4, 1)).toBeCloseTo(0.4);
    expect(woodcuttingFailureRate(0.4, 21)).toBeCloseTo(0.28);
    expect(woodcuttingFailureRate(0.4, 50)).toBeCloseTo(0.106);
    expect(woodcuttingFailureRate(2, 1)).toBe(1);
    expect(woodcuttingFailureRate(-1, 1)).toBe(0);
  });

  it("기존 50레벨 기준을 보존하고 100레벨 곡선으로 확장한다", () => {
    expect(woodcuttingXpForLevel(50)).toBe(96_040);
    expect(woodcuttingXpForLevel(100)).toBe(480_200);
    expect(woodcuttingLevelForXp(woodcuttingXpForLevel(75))).toBe(75);
  });

  it("100레벨에서 멈추고 다음 경험치를 요구하지 않는다", () => {
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
