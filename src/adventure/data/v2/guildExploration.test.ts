import { describe, expect, it } from "vitest";
import {
  GUILD_EXPLORATION_COOP_MIN_TIER,
  GUILD_EXPLORATION_COOP_WEEKLY_TARGET,
  GUILD_EXPLORATION_WEEKLY_MISSIONS,
  coopTierMeetsExplorationRequirement,
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
    });
  });

  it("accepts only EPIC or higher coop tiers", () => {
    expect(coopTierMeetsExplorationRequirement(null)).toBe(false);
    expect(coopTierMeetsExplorationRequirement("gold")).toBe(false);
    expect(coopTierMeetsExplorationRequirement("epic")).toBe(true);
    expect(coopTierMeetsExplorationRequirement("legend")).toBe(true);
  });
});
