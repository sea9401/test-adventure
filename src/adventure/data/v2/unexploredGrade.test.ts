import { describe, expect, it } from "vitest";
import {
  EXPLORATION_GRADE_TITLE_IDS,
  EXPLORATION_GRADE_XP,
  UNEXPLORED_PRESET_UNLOCK_GRADES,
  UNEXPLORED_TRACE_CAP_MAX,
  explorationGrade,
  explorationGradeBonusPoints,
  explorationGradeProgress,
  explorationGradeTitleIds,
  nextExplorationGradePointGrade,
  unexploredPresetSlotCount,
  unexploredTraceCap,
} from "./unexploredGrade";

describe("탐사 등급", () => {
  it("탐사 포인트 30개를 채우기 전에는 0등급이다", () => {
    expect(explorationGrade({ xpPoints: 29, explorationXp: 999_999 })).toBe(0);
    expect(explorationGrade({ xpPoints: 0, explorationXp: 0 })).toBe(0);
  });

  it("30포인트 뒤에는 경험치 15,000마다 1등급이고 상한이 없다", () => {
    expect(EXPLORATION_GRADE_XP).toBe(15_000);
    expect(explorationGrade({ xpPoints: 30, explorationXp: 14_999 })).toBe(0);
    expect(explorationGrade({ xpPoints: 30, explorationXp: 15_000 })).toBe(1);
    expect(explorationGrade({ xpPoints: 30, explorationXp: 15_000 * 1_234 + 7 })).toBe(1_234);
  });

  it("진행도는 지금 등급 안에서 쌓은 경험치를 돌려준다", () => {
    expect(explorationGradeProgress({ xpPoints: 30, explorationXp: 31_000 })).toEqual({
      grade: 2,
      gradeXp: 1_000,
      gradeXpCost: 15_000,
    });
    expect(explorationGradeProgress({ xpPoints: 12, explorationXp: 500 })).toEqual({
      grade: 0,
      gradeXp: 0,
      gradeXpCost: 15_000,
    });
  });

  it("추가 탐사 포인트는 5·15·30·50·75·105·140등급에 하나씩이다", () => {
    const gained = [4, 5, 14, 15, 29, 30, 49, 50, 74, 75, 104, 105, 139, 140].map(
      explorationGradeBonusPoints,
    );
    expect(gained).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7]);
    expect(explorationGradeBonusPoints(0)).toBe(0);
    expect(explorationGradeBonusPoints(-3)).toBe(0);
  });

  it("다음 추가 포인트를 받는 등급을 알려 준다", () => {
    expect(nextExplorationGradePointGrade(0)).toBe(5);
    expect(nextExplorationGradePointGrade(5)).toBe(15);
    expect(nextExplorationGradePointGrade(29)).toBe(30);
    expect(nextExplorationGradePointGrade(140)).toBe(180);
  });

  it("프리셋 칸은 10등급에 넷째, 40등급에 다섯째가 열린다", () => {
    expect(UNEXPLORED_PRESET_UNLOCK_GRADES).toEqual([0, 0, 0, 10, 40]);
    expect([0, 9, 10, 39, 40, 500].map(unexploredPresetSlotCount)).toEqual([3, 3, 4, 4, 5, 5]);
  });

  it("흔적 보관 상한은 20등급에 3,500, 60등급에 5,000이다", () => {
    expect([0, 19, 20, 59, 60, 500].map(unexploredTraceCap)).toEqual([
      2_500, 2_500, 3_500, 3_500, 5_000, 5_000,
    ]);
    expect(UNEXPLORED_TRACE_CAP_MAX).toBe(5_000);
  });

  it("칭호는 10·50·100등급에 받는다", () => {
    expect(explorationGradeTitleIds(9)).toEqual([]);
    expect(explorationGradeTitleIds(10)).toEqual([EXPLORATION_GRADE_TITLE_IDS[10]]);
    expect(explorationGradeTitleIds(99)).toEqual([
      EXPLORATION_GRADE_TITLE_IDS[10],
      EXPLORATION_GRADE_TITLE_IDS[50],
    ]);
    expect(explorationGradeTitleIds(100)).toHaveLength(3);
  });
});
