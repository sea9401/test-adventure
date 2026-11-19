import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ insertNotificationWith: vi.fn(async () => {}) }));
vi.mock("@/lib/server/v2Notifications", () => ({
  insertNotificationWith: mocks.insertNotificationWith,
}));

import {
  EXPLORATION_GRADE_TITLE_IDS,
  EXPLORATION_GRADE_XP,
} from "@/adventure/data/v2/unexploredGrade";
import { grantExplorationXp } from "@/adventure/data/v2/unexploredProgression";
import { parseUnexploredSave } from "@/adventure/data/v2/unexploredState";
import type { DbExecutor } from "@/lib/server/savesKv";
import { announceExplorationGrade } from "./unexploredGradeAnnounce";

const tx = {} as DbExecutor;

function grantFrom(grade: number, gradeXp: number, amount: number) {
  return grantExplorationXp(
    parseUnexploredSave({
      explorationProgressVersion: 2,
      xpPoints: 30,
      explorationXp: grade * EXPLORATION_GRADE_XP + gradeXp,
    }),
    amount,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("탐사 등급 상승 알림", () => {
  it("등급이 오르지 않으면 알리지 않고 칭호도 없다", async () => {
    expect(await announceExplorationGrade(tx, "u1", grantFrom(9, 0, 1))).toEqual([]);
    expect(await announceExplorationGrade(tx, "u1", null)).toEqual([]);
    expect(mocks.insertNotificationWith).not.toHaveBeenCalled();
  });

  it("등급이 오르면 새 등급과 새로 받은 탐사 포인트를 알린다", async () => {
    const titleIds = await announceExplorationGrade(
      tx,
      "u1",
      grantFrom(4, EXPLORATION_GRADE_XP - 1, 1),
    );

    expect(mocks.insertNotificationWith).toHaveBeenCalledOnce();
    expect(mocks.insertNotificationWith).toHaveBeenCalledWith(tx, "u1", "exploration_grade", {
      grade: 5,
      pointsGained: 1,
    });
    expect(titleIds).toEqual([]);
  });

  it("칭호 문턱에 닿은 등급이면 받을 칭호를 돌려준다", async () => {
    const titleIds = await announceExplorationGrade(
      tx,
      "u1",
      grantFrom(9, EXPLORATION_GRADE_XP - 1, 1),
    );

    expect(mocks.insertNotificationWith).toHaveBeenCalledWith(tx, "u1", "exploration_grade", {
      grade: 10,
      pointsGained: 0,
    });
    expect(titleIds).toEqual([EXPLORATION_GRADE_TITLE_IDS[10]]);
  });
});
