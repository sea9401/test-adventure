import { describe, expect, it } from "vitest";
import {
  arenaChampionshipBadgeForPlacement,
  grantArenaChampionshipBadge,
  hasArenaChampionshipWin,
  isArenaChampionshipWinner,
  parseArenaChampionshipBadges,
} from "@/adventure/data/v2/arenaChampionshipBadges";
import {
  ARENA_CHAMPION_TITLE_ID,
  TITLES,
} from "@/adventure/data/titles";

describe("arena championship badges", () => {
  it("1·2·3위 보상을 금·은·동 메달로 바꾼다", () => {
    expect(arenaChampionshipBadgeForPlacement("1위")).toBe("gold");
    expect(arenaChampionshipBadgeForPlacement("2위")).toBe("silver");
    expect(arenaChampionshipBadgeForPlacement("3위")).toBe("bronze");
    expect(arenaChampionshipBadgeForPlacement("4위")).toBeNull();
  });

  it("입상 횟수를 메달별로 누적한다", () => {
    const bronze = grantArenaChampionshipBadge(null, "bronze");
    const silver = grantArenaChampionshipBadge(bronze, "silver");
    const gold = grantArenaChampionshipBadge(silver, "gold");
    expect(gold).toEqual({ gold: 1, silver: 1, bronze: 1 });
  });

  it("손상된 저장값은 안전하게 정규화한다", () => {
    expect(
      parseArenaChampionshipBadges({ gold: -1, silver: 2.9, bronze: "3" }),
    ).toEqual({ gold: 0, silver: 2, bronze: 0 });
  });

  it("우승자 영구 칭호를 투기장 도감에 정의한다", () => {
    expect(TITLES[ARENA_CHAMPION_TITLE_ID]).toMatchObject({
      id: "pvp_champion",
      name: "천하제일",
      condition: "아레나 챔피언십 우승",
      category: "pvp",
    });
  });

  it("1위만 우승 칭호 대상으로 판정한다", () => {
    expect(isArenaChampionshipWinner("1위")).toBe(true);
    expect(isArenaChampionshipWinner("2위")).toBe(false);
    expect(hasArenaChampionshipWin({ gold: 1 })).toBe(true);
    expect(hasArenaChampionshipWin({ silver: 3 })).toBe(false);
  });
});
