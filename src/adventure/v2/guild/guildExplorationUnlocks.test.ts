import { describe, expect, it } from "vitest";
import {
  guildExplorationMissionUnlockLevel,
  nextGuildExplorationUnlock,
} from "./guildExplorationUnlocks";

describe("guild exploration unlock guide", () => {
  it("shows every benefit unlocked at the next headquarters level", () => {
    expect(nextGuildExplorationUnlock(1)).toEqual({
      level: 2,
      expeditionNames: ["안개 숲 수색"],
      currentWeeklyMissionCount: 1,
      weeklyMissionCount: 2,
      currentProgressBonusPct: 0,
      progressBonusPct: 10,
    });
    expect(nextGuildExplorationUnlock(4)).toMatchObject({
      level: 5,
      expeditionNames: ["별빛 성채 대원정"],
      currentWeeklyMissionCount: 4,
      weeklyMissionCount: 6,
      currentProgressBonusPct: 25,
      progressBonusPct: 35,
    });
    expect(nextGuildExplorationUnlock(5)).toBeNull();
  });

  it("maps each weekly mission to its facility unlock level", () => {
    expect(guildExplorationMissionUnlockLevel("weekly_coop_epic_30")).toBe(1);
    expect(guildExplorationMissionUnlockLevel("weekly_hunt_win_500")).toBe(2);
    expect(guildExplorationMissionUnlockLevel("weekly_farm_harvest_40")).toBe(5);
    expect(guildExplorationMissionUnlockLevel("weekly_deep_hunt_win_100")).toBe(5);
  });
});
