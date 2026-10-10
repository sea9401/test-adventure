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
  guildExplorationConcurrentLimit,
  guildExplorationDurationMinutes,
  guildExplorationEventIdsForLevel,
  parseGuildExplorationContentState,
} from "./guildExploration";
import { SUMMON_SCROLL_MATERIAL_ID } from "./coopBosses";

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
      "weekly_raid_attack_60",
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
    expect(views).toHaveLength(7);
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
        "weekly_raid_attack_60",
      ]);
    expect(
      guildExplorationWeeklyMissionViews(harvested, 2).map((v) => v.unlocked),
    ).toEqual([true, true, false, false, false, false, false]);
    expect(
      guildExplorationWeeklyMissionViews(harvested, 6).map(
        (view) => view.category,
      ),
    ).toEqual(["combat", "combat", "life", "life", "life", "combat", "combat"]);
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
      raidAttackProgress: 0,
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
      "frozen_peak",
      "abyss_corridor",
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

  it("opens expeditions at levels 1-6 and 9", () => {
    expect(
      GUILD_EXPLORATION_EXPEDITION_IDS.map(
        (id) => GUILD_EXPLORATION_EXPEDITIONS[id].minLevel,
      ),
    ).toEqual([1, 2, 3, 4, 5, 6, 9]);
  });

  it("starts and claims expedition rewards after the end time", () => {
    const base = parseGuildExplorationWeeklyState(null, "2026-W27");
    const started = startGuildExplorationExpedition(
      base,
      "ancient_ruins",
      new Date("2026-07-01T00:00:00Z"),
    )!;

    expect(started.content.activeExpeditions[0]?.expeditionId).toBe(
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
    expect(claimed?.state.content.activeExpeditions).toEqual([]);
    expect(claimed?.state.content.mapFragments).toBe(12);
  });

  it("runs the level five expedition for twelve hours and grants its full reward", () => {
    const base = parseGuildExplorationWeeklyState(null, "2026-W27");
    const started = startGuildExplorationExpedition(
      base,
      "starlight_citadel",
      new Date("2026-07-01T00:00:00Z"),
      5,
    )!;

    expect(started.content.activeExpeditions[0]).toMatchObject({
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

describe("탐사 본부 Lv.6~10", () => {
  const now = new Date("2026-10-13T00:00:00Z");
  const empty = parseGuildExplorationWeeklyState(null, "2026-10-12");

  it("옛 단일 원정 저장값을 배열로 읽는다", () => {
    const s = parseGuildExplorationContentState({
      mapFragments: 0,
      restoredMaps: 0,
      activeExpedition: {
        expeditionId: "mist_forest",
        startedAt: "2026-10-10T00:00:00.000Z",
        endsAt: "2026-10-10T04:00:00.000Z",
      },
    });
    expect(s.activeExpeditions).toHaveLength(1);
    expect(s.activeExpeditions[0].expeditionId).toBe("mist_forest");
    const claimed = claimGuildExplorationExpedition(
      { ...empty, content: s },
      new Date("2026-10-10T05:00:00.000Z"),
    );
    expect(claimed?.reward.expeditionId).toBe("mist_forest");
  });

  it("Lv.8부터 동시 2개, 같은 원정 중복 금지", () => {
    expect(guildExplorationConcurrentLimit(7)).toBe(1);
    expect(guildExplorationConcurrentLimit(8)).toBe(2);
    const one = startGuildExplorationExpedition(empty, "ancient_ruins", now, 8)!;
    expect(startGuildExplorationExpedition(one, "ancient_ruins", now, 8)).toBeNull();
    expect(
      startGuildExplorationExpedition(one, "mist_forest", now, 8)?.content.activeExpeditions,
    ).toHaveLength(2);
    expect(startGuildExplorationExpedition(one, "mist_forest", now, 7)).toBeNull();
  });

  it("지정한 원정만 회수한다", () => {
    const one = startGuildExplorationExpedition(empty, "ancient_ruins", now, 8)!;
    const two = startGuildExplorationExpedition(one, "mist_forest", now, 8)!;
    const later = new Date(now.getTime() + 5 * 3600_000);
    const claimed = claimGuildExplorationExpedition(two, later, "mist_forest");
    expect(claimed?.reward.expeditionId).toBe("mist_forest");
    expect(claimed?.state.content.activeExpeditions.map((a) => a.expeditionId)).toEqual([
      "ancient_ruins",
    ]);
  });

  it("Lv.10 원정 시간 -10%", () => {
    const abyss = GUILD_EXPLORATION_EXPEDITIONS.abyss_corridor;
    expect(guildExplorationDurationMinutes(abyss, 10)).toBe(1296);
    expect(guildExplorationDurationMinutes(abyss, 9)).toBe(1440);
    const started = startGuildExplorationExpedition(empty, "abyss_corridor", now, 10)!;
    expect(started.content.activeExpeditions[0].endsAt).toBe(
      new Date(now.getTime() + 1296 * 60_000).toISOString(),
    );
  });

  it("새 원정 정의", () => {
    expect(GUILD_EXPLORATION_EXPEDITIONS.frozen_peak).toMatchObject({
      minLevel: 6,
      durationMinutes: 900,
      costGold: 6_000_000,
      rewardGold: 9_000_000,
      rewardFame: 200,
      mapFragments: 110,
      memberReward: { kind: "stamina_potion", count: 1 },
    });
    expect(GUILD_EXPLORATION_EXPEDITIONS.abyss_corridor).toMatchObject({
      minLevel: 9,
      durationMinutes: 1440,
      costGold: 10_000_000,
      rewardGold: 15_000_000,
      rewardFame: 320,
      mapFragments: 170,
      memberReward: { kind: "material", materialId: SUMMON_SCROLL_MATERIAL_ID, count: 1 },
    });
  });

  it("레벨 미달 원정은 시작할 수 없다", () => {
    expect(startGuildExplorationExpedition(empty, "abyss_corridor", now, 8)).toBeNull();
  });

  it("Lv.10에서만 새 사건이 순환에 들어간다", () => {
    expect(guildExplorationEventIdsForLevel(9)).toHaveLength(3);
    expect(guildExplorationEventIdsForLevel(10)).toEqual([
      "collapsed_bridge",
      "ancient_device",
      "abandoned_cache",
      "sealed_library",
      "starlit_altar",
      "lost_caravan",
    ]);
    const ready = {
      ...empty,
      content: { ...empty.content, mapFragments: 100, restoredMaps: 4 },
    };
    expect(restoreGuildExplorationMap(ready, 10)?.content.pendingEvent?.eventId).toBe(
      "starlit_altar",
    );
    expect(restoreGuildExplorationMap(ready, 9)?.content.pendingEvent?.eventId).toBe(
      "ancient_device",
    );
    expect(GUILD_EXPLORATION_EVENTS.sealed_library.choices.map((c) => c.id)).toEqual([
      "decode",
      "sell_books",
    ]);
  });

  it("토벌전 의뢰는 7번째 의뢰이고 토벌 공격으로 진행된다", () => {
    expect(GUILD_EXPLORATION_WEEKLY_MISSION_IDS[6]).toBe("weekly_raid_attack_60");
    expect(GUILD_EXPLORATION_WEEKLY_MISSIONS.weekly_raid_attack_60).toMatchObject({
      metric: "raidAttacks",
      goal: 60,
      rewardGold: 4_000_000,
      rewardMapFragments: 30,
      category: "combat",
    });
    const next = addGuildExplorationProgress(empty, "raidAttacks", 45, 2);
    expect(next.raidAttackProgress).toBe(290);
    const views = guildExplorationWeeklyMissionViews(next, 7);
    expect(views.find((v) => v.id === "weekly_raid_attack_60")?.unlocked).toBe(true);
    expect(
      guildExplorationWeeklyMissionViews(next, 6).find((v) => v.id === "weekly_raid_attack_60")?.unlocked,
    ).toBe(false);
  });
});

describe("주차가 바뀌어도 진행 중인 원정은 유지", () => {
  it("다른 주차 저장값은 진척을 초기화하되 원정은 남긴다", () => {
    const prev = {
      weekKey: "2026-10-05",
      huntWinProgress: 500,
      claimed: ["weekly_hunt_win_500"],
      content: {
        mapFragments: 40,
        restoredMaps: 1,
        activeExpeditions: [
          { expeditionId: "abyss_corridor", startedAt: "2026-10-11T12:00:00.000Z", endsAt: "2026-10-12T12:00:00.000Z" },
        ],
      },
    };
    const next = parseGuildExplorationWeeklyState(prev, "2026-10-12");
    expect(next.huntWinProgress).toBe(0);
    expect(next.claimed).toEqual([]);
    expect(next.content.activeExpeditions.map((a) => a.expeditionId)).toEqual(["abyss_corridor"]);
  });
});
