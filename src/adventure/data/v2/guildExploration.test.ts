import { describe, expect, it } from "vitest";
import {
  GUILD_EXPLORATION_COOP_MIN_TIER,
  GUILD_EXPLORATION_COOP_WEEKLY_TARGET,
  GUILD_EXPLORATION_DEEP_HUNT_MIN_DEPTH,
  GUILD_EXPLORATION_DEEP_HUNT_WEEKLY_TARGET,
  GUILD_EXPLORATION_EVENTS,
  GUILD_EXPLORATION_EXPEDITION_IDS,
  GUILD_EXPLORATION_EXPEDITIONS,
  GUILD_EXPLORATION_MAP_FRAGMENT_TARGET,
  GUILD_EXPLORATION_FISHING_WEEKLY_TARGET,
  GUILD_EXPLORATION_WOODCUTTING_WEEKLY_TARGET,
  GUILD_EXPLORATION_FARM_HARVEST_WEEKLY_TARGET,
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
      rewardMapFragments: 25,
    });
  });

  it("opens combat, fishing, woodcutting, and farming missions after the default coop mission", () => {
    expect(GUILD_EXPLORATION_WEEKLY_MISSION_IDS).toEqual([
      "weekly_coop_epic_30",
      "weekly_hunt_win_500",
      "weekly_fishing_catch_120",
      "weekly_woodcutting_success_80",
      "weekly_farm_harvest_40",
      "weekly_deep_hunt_win_100",
    ]);
    expect(GUILD_EXPLORATION_WEEKLY_MISSIONS.weekly_hunt_win_500).toMatchObject({
      metric: "huntWins",
      goal: 10_000,
      rewardGold: 3_000_000,
      rewardMapFragments: 25,
    });
    expect(
      GUILD_EXPLORATION_WEEKLY_MISSIONS.weekly_fishing_catch_120,
    ).toMatchObject({
      metric: "fishingCatches",
      goal: GUILD_EXPLORATION_FISHING_WEEKLY_TARGET,
      rewardGold: 2_000_000,
      rewardMapFragments: 25,
    });
    expect(
      GUILD_EXPLORATION_WEEKLY_MISSIONS.weekly_woodcutting_success_80,
    ).toMatchObject({
      metric: "woodcuttingSuccesses",
      goal: GUILD_EXPLORATION_WOODCUTTING_WEEKLY_TARGET,
      rewardGold: 2_000_000,
      rewardMapFragments: 25,
    });
    expect(
      GUILD_EXPLORATION_WEEKLY_MISSIONS.weekly_farm_harvest_40,
    ).toMatchObject({
      metric: "farmHarvests",
      goal: GUILD_EXPLORATION_FARM_HARVEST_WEEKLY_TARGET,
      rewardGold: 2_000_000,
      rewardMapFragments: 25,
    });
    expect(
      GUILD_EXPLORATION_WEEKLY_MISSIONS.weekly_deep_hunt_win_100,
    ).toMatchObject({
      metric: "deepHuntWins",
      goal: 2_500,
      rewardGold: 3_000_000,
      rewardMapFragments: 25,
    });
    expect(GUILD_EXPLORATION_HUNT_WEEKLY_TARGET).toBe(10_000);
    expect(GUILD_EXPLORATION_DEEP_HUNT_WEEKLY_TARGET).toBe(2_500);
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
    expect(progressed.content.mapFragments).toBe(0);
    const views = guildExplorationWeeklyMissionViews(progressed, 1);
    expect(views).toHaveLength(6);
    expect(views[0]).toMatchObject({
      progress: 135,
      progressText: "1.35",
      complete: false,
      unlocked: true,
      canClaim: false,
    });
    expect(views.slice(1).every((view) => !view.unlocked)).toBe(true);
  });

  it("stores combat and life progress as independent mission metrics", () => {
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
    const woodcut = addGuildExplorationProgress(
      deepHunted,
      "woodcuttingSuccesses",
      20,
      2,
    );
    const harvested = addGuildExplorationProgress(
      woodcut,
      "farmHarvests",
      20,
      3,
    );

    expect(harvested.huntWinProgress).toBe(360);
    expect(harvested.fishingCatchProgress).toBe(240);
    expect(harvested.deepHuntWinProgress).toBe(480);
    expect(harvested.woodcuttingSuccessProgress).toBe(240);
    expect(harvested.farmHarvestProgress).toBe(360);
    expect(harvested.content.mapFragments).toBe(0);
    expect(guildExplorationWeeklyMissionViews(harvested, 6).map((v) => v.id))
      .toEqual([
        "weekly_coop_epic_30",
        "weekly_hunt_win_500",
        "weekly_fishing_catch_120",
        "weekly_woodcutting_success_80",
        "weekly_farm_harvest_40",
        "weekly_deep_hunt_win_100",
      ]);
    expect(
      guildExplorationWeeklyMissionViews(harvested, 2).map((v) => v.unlocked),
    ).toEqual([true, true, false, false, false, false]);
    expect(
      guildExplorationWeeklyMissionViews(harvested, 6).map(
        (view) => view.category,
      ),
    ).toEqual(["combat", "combat", "life", "life", "life", "combat"]);
  });

  it("marks the coop mission claimable at 30 contribution units and claims once", () => {
    const state = {
      weekKey: "2026-W27",
      coopEpicProgress: GUILD_EXPLORATION_COOP_WEEKLY_TARGET *
        GUILD_EXPLORATION_PROGRESS_UNIT,
      huntWinProgress: 0,
      deepHuntWinProgress: 0,
      fishingCatchProgress: 0,
      woodcuttingSuccessProgress: 0,
      farmHarvestProgress: 0,
      claimed: [],
      content: parseGuildExplorationWeeklyState(null, "2026-W27").content,
    };
    const view = guildExplorationWeeklyMissionViews(state, 1)[0];

    expect(view.canClaim).toBe(true);
    const claimed = claimGuildExplorationWeeklyMission(
      state,
      "weekly_coop_epic_30",
    );
    expect(claimed.claimed).toEqual(["weekly_coop_epic_30"]);
    expect(claimed.content.mapFragments).toBe(25);
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
    expect(resolved?.state.content.mapFragments).toBe(0);
  });

  it("keeps expedition time and rewards on the restrained progression curve", () => {
    expect(GUILD_EXPLORATION_EXPEDITION_IDS).toEqual([
      "ancient_ruins",
      "mist_forest",
      "red_canyon",
      "sunken_archive",
      "starlight_citadel",
    ]);
    expect(GUILD_EXPLORATION_EXPEDITIONS.ancient_ruins).toMatchObject({
      minLevel: 1,
      durationMinutes: 120,
      costGold: 500_000,
      rewardGold: 700_000,
      rewardFame: 20,
      mapFragments: 12,
    });
    expect(GUILD_EXPLORATION_EXPEDITIONS.mist_forest).toMatchObject({
      minLevel: 2,
      durationMinutes: 240,
      costGold: 1_250_000,
      rewardGold: 1_700_000,
      rewardFame: 40,
      mapFragments: 24,
    });
    expect(GUILD_EXPLORATION_EXPEDITIONS.red_canyon).toMatchObject({
      minLevel: 3,
      durationMinutes: 360,
      costGold: 1_800_000,
      rewardGold: 2_550_000,
      rewardFame: 65,
      mapFragments: 38,
    });
    expect(GUILD_EXPLORATION_EXPEDITIONS.sunken_archive).toMatchObject({
      minLevel: 4,
      durationMinutes: 540,
      costGold: 2_500_000,
      rewardGold: 3_800_000,
      rewardFame: 95,
      mapFragments: 55,
    });
    expect(GUILD_EXPLORATION_EXPEDITIONS.starlight_citadel).toMatchObject({
      minLevel: 5,
      durationMinutes: 720,
      costGold: 4_000_000,
      rewardGold: 6_000_000,
      rewardFame: 140,
      mapFragments: 80,
    });
  });

  it("opens one expedition at every exploration HQ level", () => {
    expect(
      GUILD_EXPLORATION_EXPEDITION_IDS.map(
        (id) => GUILD_EXPLORATION_EXPEDITIONS[id].minLevel,
      ),
    ).toEqual([1, 2, 3, 4, 5]);
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
      new Date("2026-07-01T02:01:00Z"),
    );

    expect(claimed?.reward).toMatchObject({
      expeditionId: "ancient_ruins",
      rewardFame: 20,
      mapFragments: 12,
    });
    expect(claimed?.state.content.activeExpedition).toBeNull();
    expect(claimed?.state.content.mapFragments).toBe(12);
  });

  it("runs the level five expedition for twelve hours and grants its full reward", () => {
    const base = parseGuildExplorationWeeklyState(null, "2026-W27");
    const started = startGuildExplorationExpedition(
      base,
      "starlight_citadel",
      new Date("2026-07-01T00:00:00Z"),
    );

    expect(started.content.activeExpedition).toMatchObject({
      expeditionId: "starlight_citadel",
      endsAt: "2026-07-01T12:00:00.000Z",
    });

    const claimed = claimGuildExplorationExpedition(
      started,
      new Date("2026-07-01T12:00:00Z"),
    );

    expect(claimed?.reward).toEqual({
      expeditionId: "starlight_citadel",
      rewardGold: 6_000_000,
      rewardFame: 140,
      mapFragments: 80,
    });
    expect(claimed?.state.content.mapFragments).toBe(80);
  });
});
