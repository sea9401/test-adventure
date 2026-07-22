import { describe, expect, it } from "vitest";
import {
  arenaChampionshipBadgeForPlacement,
  bestArenaChampionshipBadge,
  grantArenaChampionshipBadge,
  parseArenaChampionshipBadges,
} from "@/adventure/data/v2/arenaChampionshipBadges";

describe("arena championship badges", () => {
  it("1·2·3위 보상을 금·은·동 메달로 바꾼다", () => {
    expect(arenaChampionshipBadgeForPlacement("1위")).toBe("gold");
    expect(arenaChampionshipBadgeForPlacement("2위")).toBe("silver");
    expect(arenaChampionshipBadgeForPlacement("3위")).toBe("bronze");
    expect(arenaChampionshipBadgeForPlacement("4위")).toBeNull();
  });

  it("입상 횟수를 누적하고 가장 높은 메달을 대표 배지로 고른다", () => {
    const bronze = grantArenaChampionshipBadge(null, "bronze");
    const silver = grantArenaChampionshipBadge(bronze, "silver");
    const gold = grantArenaChampionshipBadge(silver, "gold");
    expect(gold).toEqual({ gold: 1, silver: 1, bronze: 1 });
    expect(bestArenaChampionshipBadge(gold)).toBe("gold");
  });

  it("손상된 저장값은 안전하게 정규화한다", () => {
    expect(
      parseArenaChampionshipBadges({ gold: -1, silver: 2.9, bronze: "3" }),
    ).toEqual({ gold: 0, silver: 2, bronze: 0 });
  });
});
