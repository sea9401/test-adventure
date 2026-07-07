import { describe, expect, it } from "vitest";
import {
  GUILD_EXPLORATION_COOP_MIN_TIER,
  GUILD_EXPLORATION_COOP_WEEKLY_TARGET,
  GUILD_EXPLORATION_PROGRESS_UNIT,
  GUILD_EXPLORATION_WEEKLY_MISSIONS,
  addGuildExplorationCoopProgress,
  claimGuildExplorationWeeklyMission,
  coopTierMeetsExplorationRequirement,
  guildExplorationWeeklyMissionViews,
  parseGuildExplorationWeeklyState,
} from "./guildExploration";

describe("guild exploration weekly missions", () => {
  it("uses EPIC+ coop contribution 30 times as the default boss mission", () => {
    const mission = GUILD_EXPLORATION_WEEKLY_MISSIONS.weekly_coop_epic_30;

    expect(GUILD_EXPLORATION_COOP_MIN_TIER).toBe("epic");
    expect(GUILD_EXPLORATION_COOP_WEEKLY_TARGET).toBe(30);
    expect(mission).toMatchObject({
      metric: "coopBossTierClaims",
      goal: 30,
      minCoopTier: "epic",
      rewardGold: 5_000_000,
      rewardFame: 300,
    });
  });

  it("accepts only EPIC or higher coop tiers", () => {
    expect(coopTierMeetsExplorationRequirement(null)).toBe(false);
    expect(coopTierMeetsExplorationRequirement("gold")).toBe(false);
    expect(coopTierMeetsExplorationRequirement("epic")).toBe(true);
    expect(coopTierMeetsExplorationRequirement("legend")).toBe(true);
  });

  it("stores coop progress as 100-point units and applies HQ progress bonus", () => {
    const base = parseGuildExplorationWeeklyState(null, "2026-W27");
    const progressed = addGuildExplorationCoopProgress(base, 35);

    expect(progressed.coopEpicProgress).toBe(
      GUILD_EXPLORATION_PROGRESS_UNIT + 35,
    );
    expect(guildExplorationWeeklyMissionViews(progressed, 1)[0]).toMatchObject({
      progress: 135,
      progressText: "1.35",
      complete: false,
      canClaim: false,
    });
  });

  it("marks the coop mission claimable at 30 contribution units and claims once", () => {
    const state = {
      weekKey: "2026-W27",
      coopEpicProgress: GUILD_EXPLORATION_COOP_WEEKLY_TARGET *
        GUILD_EXPLORATION_PROGRESS_UNIT,
      claimed: [],
    };
    const view = guildExplorationWeeklyMissionViews(state, 1)[0];

    expect(view.canClaim).toBe(true);
    expect(
      claimGuildExplorationWeeklyMission(state, "weekly_coop_epic_30").claimed,
    ).toEqual(["weekly_coop_epic_30"]);
  });
});
