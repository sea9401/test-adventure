import { describe, expect, it } from "vitest";
import { MINING_MATERIAL_ID } from "./miningSpots";
import { WOODCUTTING_MATERIAL_ID } from "./woodcuttingSpots";
import {
  guildContributionForActivity,
  guildExistingActivityContributionPoints,
  guildFacilityMaterialContributionPoints,
  guildGoldContributionPoints,
  isPersonalGuildContributionSource,
} from "./guildContribution";

describe("길드 기여 점수", () => {
  it("골드는 10만당 10점이며 1만 단위 기여도 보존한다", () => {
    expect(guildGoldContributionPoints(9_999)).toBe(0);
    expect(guildGoldContributionPoints(10_000)).toBe(1);
    expect(guildGoldContributionPoints(100_000)).toBe(10);
    expect(guildGoldContributionPoints(250_000)).toBe(25);
  });

  it("시설 재료는 채집 희소도에 맞춘 묶음 가치로 환산한다", () => {
    expect(
      guildFacilityMaterialContributionPoints({
        [WOODCUTTING_MATERIAL_ID.pine]: 10,
        [MINING_MATERIAL_ID.adamantite]: 1,
      }),
    ).toBe(30);
  });

  it("식당·교역의 기존 기여 포인트를 공통 점수 눈금으로 변환한다", () => {
    expect(guildExistingActivityContributionPoints(3)).toBe(30);
  });

  it("개인 귀속 길드 보상은 골드와 명성을 모두 반영한다", () => {
    expect(
      guildContributionForActivity("artisan_rank_reward", {
        rewardGold: 300_000,
        rewardFame: 100,
      }),
    ).toEqual({ category: "workshop", points: 1_030 });
  });

  it("길드 공동 보상은 수령자 개인 기여도로 귀속하지 않는다", () => {
    for (const source of [
      "workshop_weekly_claim",
      "exploration_weekly_claim",
      "exploration_expedition_claim",
      "exploration_event_resolve",
    ]) {
      expect(isPersonalGuildContributionSource(source)).toBe(false);
      expect(
        guildContributionForActivity(source, {
          rewardGold: 900_000,
          rewardFame: 320,
        }),
      ).toBeNull();
    }
  });

  it("공동자산을 소비하기만 하는 활동은 기여로 기록하지 않는다", () => {
    expect(guildContributionForActivity("dining_meal", null)).toBeNull();
    expect(
      guildContributionForActivity("exploration_expedition_dispatch", {
        amount: 500_000,
      }),
    ).toBeNull();
  });
});
