import { describe, expect, it } from "vitest";
import { TITLES } from "@/adventure/data/titles";
import {
  BULLETIN_ACTIVITY_TITLE_REWARDS,
  BULLETIN_DAILY_COMMENT_CREDIT_LIMIT,
  BULLETIN_DAILY_POST_CREDIT_LIMIT,
  bulletinActivityPoints,
  bulletinActivityTitleIdsForLevel,
  bulletinDailyCredits,
  deriveBulletinActivity,
  isCreditedBulletinReceivedLike,
} from "./bulletinActivity";

describe("bulletin activity", () => {
  const EXISTING_LEVELS = [
    { minPoints: 0, level: 1, title: "새싹" },
    { minPoints: 10, level: 2, title: "첫걸음" },
    { minPoints: 25, level: 3, title: "이야기꾼" },
    { minPoints: 50, level: 4, title: "이웃" },
    { minPoints: 85, level: 5, title: "단골" },
    { minPoints: 130, level: 6, title: "소식통" },
    { minPoints: 190, level: 7, title: "조언자" },
    { minPoints: 265, level: 8, title: "명필" },
    { minPoints: 355, level: 9, title: "현자" },
    { minPoints: 460, level: 10, title: "광장지기" },
  ] as const;
  const NEW_LEVEL_BOUNDARIES = [
    { minPoints: 585, level: 11, title: "길잡이", previousLevel: 10 },
    { minPoints: 730, level: 12, title: "기록가", previousLevel: 11 },
    { minPoints: 895, level: 13, title: "경청자", previousLevel: 12 },
    { minPoints: 1_080, level: 14, title: "중재자", previousLevel: 13 },
    { minPoints: 1_285, level: 15, title: "원로", previousLevel: 14 },
    { minPoints: 1_510, level: 16, title: "연대기 작가", previousLevel: 15 },
    { minPoints: 1_755, level: 17, title: "명망가", previousLevel: 16 },
    { minPoints: 2_020, level: 18, title: "광장의 등불", previousLevel: 17 },
    { minPoints: 2_305, level: 19, title: "산증인", previousLevel: 18 },
    { minPoints: 2_610, level: 20, title: "전설", previousLevel: 19 },
  ] as const;

  it("weights received likes more than writing volume", () => {
    expect(
      bulletinActivityPoints({
        creditedPosts: 2,
        creditedComments: 5,
        receivedLikes: 1,
      }),
    ).toBe(15);
  });

  it("derives level and progress from points", () => {
    expect(
      deriveBulletinActivity({
        creditedPosts: 5,
        creditedComments: 6,
        receivedLikes: 1,
      }),
    ).toMatchObject({
      points: 25,
      level: 3,
      title: "이야기꾼",
      levelStartPoints: 25,
      nextLevelPoints: 50,
      progressPct: 0,
    });
  });

  it.each(EXISTING_LEVELS)(
    "기존 $minPoints점 기준을 Lv.$level $title로 유지한다",
    ({ minPoints, level, title }) => {
      expect(
        deriveBulletinActivity({
          creditedPosts: 0,
          creditedComments: minPoints,
          receivedLikes: 0,
        }),
      ).toMatchObject({ level, title, levelStartPoints: minPoints });
    },
  );

  it.each(NEW_LEVEL_BOUNDARIES)(
    "$minPoints점에서 Lv.$level $title에 도달한다",
    ({ minPoints, level, title, previousLevel }) => {
      expect(
        deriveBulletinActivity({
          creditedPosts: 0,
          creditedComments: minPoints - 1,
          receivedLikes: 0,
        }).level,
      ).toBe(previousLevel);
      expect(
        deriveBulletinActivity({
          creditedPosts: 0,
          creditedComments: minPoints,
          receivedLikes: 0,
        }),
      ).toMatchObject({ level, title, levelStartPoints: minPoints });
    },
  );

  it("2,610점 이상을 Lv.20으로 제한한다", () => {
    expect(
      deriveBulletinActivity({
        creditedPosts: 1_000,
        creditedComments: 1_000,
        receivedLikes: 1_000,
      }),
    ).toMatchObject({
      level: 20,
      title: "전설",
      levelStartPoints: 2_610,
      nextLevelPoints: null,
      progressPct: 100,
    });
  });

  it("Lv.15와 Lv.20에서 신규 영구 칭호 이정표를 해금한다", () => {
    expect(bulletinActivityTitleIdsForLevel(2)).toEqual([]);
    expect(bulletinActivityTitleIdsForLevel(7)).toEqual([
      "bulletin_storyteller",
      "bulletin_regular",
      "bulletin_adviser",
    ]);
    expect(bulletinActivityTitleIdsForLevel(10)).toEqual([
      "bulletin_storyteller",
      "bulletin_regular",
      "bulletin_adviser",
      "bulletin_keeper",
    ]);
    expect(bulletinActivityTitleIdsForLevel(14)).toEqual([
      "bulletin_storyteller",
      "bulletin_regular",
      "bulletin_adviser",
      "bulletin_keeper",
    ]);
    expect(bulletinActivityTitleIdsForLevel(15)).toEqual([
      "bulletin_storyteller",
      "bulletin_regular",
      "bulletin_adviser",
      "bulletin_keeper",
      "bulletin_elder",
    ]);
    expect(bulletinActivityTitleIdsForLevel(20)).toEqual([
      "bulletin_storyteller",
      "bulletin_regular",
      "bulletin_adviser",
      "bulletin_keeper",
      "bulletin_elder",
      "bulletin_legend",
    ]);
    for (const reward of BULLETIN_ACTIVITY_TITLE_REWARDS) {
      expect(TITLES[reward.titleId]?.name).toBe(reward.name);
    }
  });

  it("normalizes malformed counters", () => {
    expect(
      deriveBulletinActivity({
        creditedPosts: -1,
        creditedComments: Number.NaN,
        receivedLikes: 1.9,
      }),
    ).toMatchObject({
      creditedPosts: 0,
      creditedComments: 0,
      receivedLikes: 1,
      points: 4,
    });
  });

  it("limits writing credit per day", () => {
    expect(bulletinDailyCredits(20, BULLETIN_DAILY_POST_CREDIT_LIMIT)).toBe(2);
    expect(bulletinDailyCredits(20, BULLETIN_DAILY_COMMENT_CREDIT_LIMIT)).toBe(
      5,
    );
  });

  it("does not credit self-likes or likes on notices", () => {
    expect(
      isCreditedBulletinReceivedLike({
        authorUserId: "user-1",
        likerUserId: "user-1",
        category: "free",
      }),
    ).toBe(false);
    expect(
      isCreditedBulletinReceivedLike({
        authorUserId: "admin",
        likerUserId: "user-1",
        category: "notice",
      }),
    ).toBe(false);
    expect(
      isCreditedBulletinReceivedLike({
        authorUserId: "user-1",
        likerUserId: "user-2",
        category: "guide",
      }),
    ).toBe(true);
  });
});
