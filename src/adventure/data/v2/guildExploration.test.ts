import { describe, expect, it } from "vitest";
import {
  GUILD_EXPLORATION_COOP_MIN_TIER,
  GUILD_EXPLORATION_COOP_WEEKLY_TARGET,
  GUILD_EXPLORATION_DEEP_HUNT_MIN_DEPTH,
  GUILD_EXPLORATION_DEEP_HUNT_WEEKLY_TARGET,
  GUILD_EXPLORATION_EVENTS,
  GUILD_EXPLORATION_MAP_FRAGMENT_TARGET,
  GUILD_EXPLORATION_FISHING_WEEKLY_TARGET,
  GUILD_EXPLORATION_HUNT_WEEKLY_TARGET,
  GUILD_EXPLORATION_PROGRESS_UNIT,
  GUILD_EXPLORATION_WEEKLY_MISSION_IDS,
  GUILD_EXPLORATION_WEEKLY_MISSIONS,
  addGuildExplorationCoopProgress,
  addGuildExplorationProgress,
  claimGuildExplorationWeeklyMission,
  coopTierMeetsExplorationRequirement,
  guildExplorationWeeklyMissionViews,
  parseGuildExplorationWeeklyState,
  resolveGuildExplorationEvent,
  restoreGuildExplorationMap,
  startGuildExplorationExpedition,
  claimGuildExplorationExpedition,
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

  it("opens hunt and fishing missions after the default coop mission", () => {
    expect(GUILD_EXPLORATION_WEEKLY_MISSION_IDS).toEqual([
      "weekly_coop_epic_30",
      "weekly_hunt_win_500",
      "weekly_fishing_catch_120",
      "weekly_deep_hunt_win_100",
    ]);
    expect(GUILD_EXPLORATION_WEEKLY_MISSIONS.weekly_hunt_win_500).toMatchObject({
      metric: "huntWins",
      goal: GUILD_EXPLORATION_HUNT_WEEKLY_TARGET,
      rewardGold: 3_000_000,
      rewardFame: 150,
    });
    expect(
      GUILD_EXPLORATION_WEEKLY_MISSIONS.weekly_fishing_catch_120,
    ).toMatchObject({
      metric: "fishingCatches",
      goal: GUILD_EXPLORATION_FISHING_WEEKLY_TARGET,
      rewardGold: 2_000_000,
      rewardFame: 150,
    });
    expect(
      GUILD_EXPLORATION_WEEKLY_MISSIONS.weekly_deep_hunt_win_100,
    ).toMatchObject({
      metric: "deepHuntWins",
      goal: GUILD_EXPLORATION_DEEP_HUNT_WEEKLY_TARGET,
      rewardGold: 3_000_000,
      rewardFame: 150,
    });
    expect(GUILD_EXPLORATION_DEEP_HUNT_MIN_DEPTH).toBe(49);
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
    expect(progressed.content.mapFragments).toBe(8);
    expect(guildExplorationWeeklyMissionViews(progressed, 1)[0]).toMatchObject({
      progress: 135,
      progressText: "1.35",
      complete: false,
      canClaim: false,
    });
  });

  it("stores hunt and fishing progress as independent mission metrics", () => {
    const base = parseGuildExplorationWeeklyState(null, "2026-W27");
    const hunted = addGuildExplorationProgress(base, "huntWins", 20, 3);
    const fished = addGuildExplorationProgress(
      hunted,
      "fishingCatches",
      20,
      2,
    );
    const deepHunted = addGuildExplorationProgress(
      fished,
      "deepHuntWins",
      20,
      4,
    );

    expect(deepHunted.huntWinProgress).toBe(360);
    expect(deepHunted.fishingCatchProgress).toBe(240);
    expect(deepHunted.deepHuntWinProgress).toBe(480);
    expect(deepHunted.content.mapFragments).toBe(13);
    expect(guildExplorationWeeklyMissionViews(deepHunted, 4).map((v) => v.id))
      .toEqual([
        "weekly_coop_epic_30",
        "weekly_hunt_win_500",
        "weekly_fishing_catch_120",
        "weekly_deep_hunt_win_100",
      ]);
    expect(guildExplorationWeeklyMissionViews(deepHunted, 2).map((v) => v.id))
      .toEqual(["weekly_coop_epic_30", "weekly_hunt_win_500"]);
  });

  it("marks the coop mission claimable at 30 contribution units and claims once", () => {
    const state = {
      weekKey: "2026-W27",
      coopEpicProgress: GUILD_EXPLORATION_COOP_WEEKLY_TARGET *
        GUILD_EXPLORATION_PROGRESS_UNIT,
      huntWinProgress: 0,
      deepHuntWinProgress: 0,
      fishingCatchProgress: 0,
      claimed: [],
      content: parseGuildExplorationWeeklyState(null, "2026-W27").content,
    };
    const view = guildExplorationWeeklyMissionViews(state, 1)[0];

    expect(view.canClaim).toBe(true);
    expect(
      claimGuildExplorationWeeklyMission(state, "weekly_coop_epic_30").claimed,
    ).toEqual(["weekly_coop_epic_30"]);
  });

  it("restores maps into event cards and resolves event rewards", () => {
    const base = parseGuildExplorationWeeklyState(
      {
        weekKey: "2026-W27",
        content: { mapFragments: GUILD_EXPLORATION_MAP_FRAGMENT_TARGET },
      },
      "2026-W27",
    );
    const restored = restoreGuildExplorationMap(base);

    expect(restored?.content.mapFragments).toBe(0);
    expect(restored?.content.pendingEvent?.eventId).toBe("collapsed_bridge");

    const choice = GUILD_EXPLORATION_EVENTS.collapsed_bridge.choices[0];
    const resolved = restored
      ? resolveGuildExplorationEvent(restored, choice.id)
      : null;

    expect(resolved?.event.id).toBe("collapsed_bridge");
    expect(resolved?.state.content.pendingEvent).toBeNull();
    expect(resolved?.state.content.resolvedEvents).toEqual([
      "collapsed_bridge",
    ]);
  });

  it("starts and claims expedition rewards after the end time", () => {
    const base = parseGuildExplorationWeeklyState(null, "2026-W27");
    const started = startGuildExplorationExpedition(
      base,
      "ancient_ruins",
      new Date("2026-07-01T00:00:00Z"),
    );

    expect(started.content.activeExpedition?.expeditionId).toBe(
      "ancient_ruins",
    );
    expect(
      claimGuildExplorationExpedition(
        started,
        new Date("2026-07-01T00:30:00Z"),
      ),
    ).toBeNull();

    const claimed = claimGuildExplorationExpedition(
      started,
      new Date("2026-07-01T01:01:00Z"),
    );

    expect(claimed?.reward).toMatchObject({
      expeditionId: "ancient_ruins",
      mapFragments: 24,
    });
    expect(claimed?.state.content.activeExpedition).toBeNull();
    expect(claimed?.state.content.mapFragments).toBe(24);
  });
});
