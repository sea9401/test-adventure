import { describe, expect, it } from "vitest";
import { TITLES } from "@/adventure/data/titles";
import { EXPLORATION_GRADE_TITLE_IDS } from "@/adventure/data/v2/unexploredGrade";
import { V2_NOTIFICATION_TYPES } from "@/lib/v2-notification-config";
import { applyHuntAdventureProgress } from "./huntKillLog";

describe("사냥 기록의 칭호 지급", () => {
  it("넘겨받은 칭호를 처음 한 번만 적고 처치 수도 함께 올린다", () => {
    const first = applyHuntAdventureProgress({}, "별 파수꾼", 1_000, undefined, [
      EXPLORATION_GRADE_TITLE_IDS[10],
    ]);
    expect(first.monsters?.["별 파수꾼"]?.kills).toBe(1);
    expect(first.titles).toEqual({ [EXPLORATION_GRADE_TITLE_IDS[10]]: { obtainedAt: 1_000 } });

    const second = applyHuntAdventureProgress(first, "별 파수꾼", 2_000, undefined, [
      EXPLORATION_GRADE_TITLE_IDS[10],
      EXPLORATION_GRADE_TITLE_IDS[50],
    ]);
    expect(second.monsters?.["별 파수꾼"]?.kills).toBe(2);
    expect(second.titles).toEqual({
      [EXPLORATION_GRADE_TITLE_IDS[10]]: { obtainedAt: 1_000 },
      [EXPLORATION_GRADE_TITLE_IDS[50]]: { obtainedAt: 2_000 },
    });
  });

  it("칭호를 넘기지 않으면 칭호 기록을 건드리지 않는다", () => {
    const log = applyHuntAdventureProgress({ titles: { early_bird: { obtainedAt: 5 } } }, "별 파수꾼", 9);
    expect(log.titles).toEqual({ early_bird: { obtainedAt: 5 } });
    expect(applyHuntAdventureProgress({}, "별 파수꾼", 9)).not.toHaveProperty("titles");
  });
});

describe("탐사 등급 칭호와 알림 종류", () => {
  it("등급 칭호 세 개가 칭호 목록에 있다", () => {
    for (const titleId of Object.values(EXPLORATION_GRADE_TITLE_IDS)) {
      expect(TITLES[titleId]?.id).toBe(titleId);
      expect(TITLES[titleId]?.condition).toMatch(/탐사 등급 \d+ 달성/);
    }
  });

  it("탐사 등급 알림 종류가 등록돼 있다", () => {
    expect(V2_NOTIFICATION_TYPES).toContain("exploration_grade");
  });
});
