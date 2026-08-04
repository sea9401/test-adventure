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

  it("caps display at level 10", () => {
    expect(
      deriveBulletinActivity({
        creditedPosts: 1_000,
        creditedComments: 1_000,
        receivedLikes: 1_000,
      }),
    ).toMatchObject({
      level: 10,
      title: "광장지기",
      nextLevelPoints: null,
      progressPct: 100,
    });
  });

  it("awards permanent title milestones at levels 3, 5, 7, and 10", () => {
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
