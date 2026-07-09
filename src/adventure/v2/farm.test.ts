import { describe, expect, it } from "vitest";
import {
  FARM_DAILY_QUEST_SEED_REWARD,
  buyFarmShopItem,
  claimFarmSpecialDelivery,
  claimFarmDelivery,
  claimFarmWeeklyDelivery,
  emptyFarmState,
  farmPlotCountForReputation,
  farmAvailableReputation,
  grantFarmSeeds,
  harvestPlot,
  nextFarmPlotUpgrade,
  parseFarmState,
  plantCrop,
} from "./farm";

describe("adventurer farm", () => {
  it("plants a crop into an empty plot", () => {
    const now = 1_000;
    const state = plantCrop(emptyFarmState(), "plot-1", "wheat", now);

    expect(state.plots[0]).toMatchObject({
      id: "plot-1",
      cropId: "wheat",
      plantedAt: now,
      readyAt: now + 5 * 60 * 1000,
    });
    expect(state.seeds.wheat).toBe(2);
  });

  it("rejects planting without a seed", () => {
    const state = { ...emptyFarmState(), seeds: {} };

    expect(() => plantCrop(state, "plot-1", "wheat", 1_000)).toThrow(
      "no_seed",
    );
  });

  it("grants farm seeds from the daily quest seed pouch", () => {
    const state = {
      ...emptyFarmState(1_000),
      seeds: { wheat: 1 },
    };
    const next = grantFarmSeeds(state, FARM_DAILY_QUEST_SEED_REWARD);

    expect(next.seeds).toEqual({ wheat: 5, herb: 2, corn: 1 });
  });

  it("rejects harvesting before the crop is ready", () => {
    const state = plantCrop(emptyFarmState(), "plot-1", "herb", 1_000);

    expect(() => harvestPlot(state, "plot-1", 2_000, () => 0)).toThrow(
      "not_ready",
    );
  });

  it("harvests yield, rare crop, and clears the plot", () => {
    const planted = plantCrop(
      { ...emptyFarmState(), seeds: { corn: 1 } },
      "plot-1",
      "corn",
      1_000,
    );
    const { state, result } = harvestPlot(
      planted,
      "plot-1",
      1_000 + 60 * 60 * 1000,
      () => 0,
    );

    expect(result).toMatchObject({
      cropId: "corn",
      itemId: "corn",
      quantity: 5,
      rareItemId: "sweet_corn",
      rareQuantity: 1,
    });
    expect(state.inventory.corn).toBe(5);
    expect(state.inventory.sweet_corn).toBe(1);
    expect(state.stats).toEqual({
      harvests: 1,
      rareHarvests: 1,
      deliveries: 0,
      reputation: 0,
      reputationSpent: 0,
    });
    expect(state.plots[0].cropId).toBeNull();
  });

  it("claims a delivery by consuming crops and granting reputation", () => {
    const state = {
      ...emptyFarmState(1_000),
      inventory: { wheat: 3 },
      seeds: {},
    };
    const { state: next, result } = claimFarmDelivery(
      state,
      "bakery-wheat",
      1_000,
    );

    expect(result).toMatchObject({
      requestId: "bakery-wheat",
      rewardSeeds: {},
      rewardReputation: 2,
    });
    expect(next.inventory.wheat).toBeUndefined();
    expect(next.seeds).toEqual({});
    expect(next.deliveries.claimedIds).toEqual(["bakery-wheat"]);
    expect(next.stats.deliveries).toBe(1);
    expect(next.stats.reputation).toBe(2);
    expect(next.stats.reputationSpent).toBe(0);
  });

  it("claims a rare harvest delivery as a repeatable sink", () => {
    const state = {
      ...emptyFarmState(1_000),
      inventory: { golden_wheat: 1 },
      seeds: {},
    };
    const { state: next, result } = claimFarmSpecialDelivery(
      state,
      "rare-golden-wheat",
    );

    expect(result).toMatchObject({
      requestId: "rare-golden-wheat",
      rewardSeeds: {},
      rewardReputation: 3,
    });
    expect(next.inventory.golden_wheat).toBeUndefined();
    expect(next.seeds).toEqual({});
    expect(next.stats.reputation).toBe(3);
  });

  it("spends available farm reputation in the farm shop without shrinking plot unlocks", () => {
    const state = {
      ...emptyFarmState(1_000),
      stats: {
        ...emptyFarmState(1_000).stats,
        reputation: 20,
      },
      seeds: {},
    };

    const { state: next, result } = buyFarmShopItem(state, "market-seed-box");

    expect(result).toMatchObject({
      itemId: "market-seed-box",
      costReputation: 12,
      rewardSeeds: { corn: 2 },
    });
    expect(next.stats.reputation).toBe(20);
    expect(next.stats.reputationSpent).toBe(12);
    expect(farmAvailableReputation(next)).toBe(8);
    expect(farmPlotCountForReputation(next.stats.reputation)).toBe(5);
  });

  it("rejects farm shop purchases without enough available reputation", () => {
    const state = {
      ...emptyFarmState(1_000),
      stats: {
        ...emptyFarmState(1_000).stats,
        reputation: 5,
        reputationSpent: 3,
      },
    };

    expect(() => buyFarmShopItem(state, "seed-crate")).toThrow(
      "not_enough_reputation",
    );
  });

  it("rejects claiming the same daily delivery twice", () => {
    const state = {
      ...emptyFarmState(1_000),
      inventory: { wheat: 6 },
      seeds: {},
    };
    const { state: claimed } = claimFarmDelivery(state, "bakery-wheat", 1_000);

    expect(() => claimFarmDelivery(claimed, "bakery-wheat", 1_000)).toThrow(
      "delivery_already_claimed",
    );
  });

  it("limits total farm deliveries per day", () => {
    const state = {
      ...emptyFarmState(1_000),
      inventory: { wheat: 3, herb: 2, corn: 5 },
      seeds: {},
    };
    const { state: first } = claimFarmDelivery(state, "bakery-wheat", 1_000);
    const { state: second } = claimFarmDelivery(first, "clinic-herb", 1_000);

    expect(second.deliveries.claimedIds).toEqual([
      "bakery-wheat",
      "clinic-herb",
    ]);
    expect(() => claimFarmDelivery(second, "market-corn", 1_000)).toThrow(
      "delivery_daily_limit",
    );
  });

  it("resets the daily delivery limit on a new farm day", () => {
    const state = {
      ...emptyFarmState(1_000),
      inventory: { wheat: 6, herb: 2, corn: 5 },
      seeds: {},
    };
    const { state: first } = claimFarmDelivery(state, "bakery-wheat", 1_000);
    const { state: second } = claimFarmDelivery(first, "clinic-herb", 1_000);

    const { state: nextDay } = claimFarmDelivery(
      second,
      "market-corn",
      1_000 + 24 * 60 * 60 * 1000,
    );

    expect(nextDay.deliveries.claimedIds).toEqual(["market-corn"]);
    expect(nextDay.stats.deliveries).toBe(3);
    expect(nextDay.stats.reputation).toBe(9);
    expect(nextDay.plots).toHaveLength(4);
    expect(nextDay.plots[3]).toMatchObject({ id: "plot-4", cropId: null });
  });

  it("claims a weekly delivery once per farm week and resets next week", () => {
    const monday = Date.parse("2026-07-06T00:00:00+09:00");
    const nextMonday = monday + 7 * 24 * 60 * 60 * 1000;
    const state = {
      ...emptyFarmState(monday),
      inventory: { wheat: 60, golden_wheat: 2 },
      seeds: {},
    };
    const { state: claimed } = claimFarmWeeklyDelivery(
      state,
      "weekly-bakery-crate",
      monday,
    );

    expect(claimed.weekly.claimedIds).toEqual(["weekly-bakery-crate"]);
    expect(claimed.inventory.wheat).toBe(30);
    expect(claimed.inventory.golden_wheat).toBe(1);
    expect(claimed.stats.reputation).toBe(8);
    expect(() =>
      claimFarmWeeklyDelivery(claimed, "weekly-bakery-crate", monday),
    ).toThrow("weekly_delivery_already_claimed");

    const { state: reset } = claimFarmWeeklyDelivery(
      claimed,
      "weekly-bakery-crate",
      nextMonday,
    );
    expect(reset.weekly.claimedIds).toEqual(["weekly-bakery-crate"]);
    expect(reset.stats.reputation).toBe(16);
  });

  it("derives farm plot growth from reputation", () => {
    expect(farmPlotCountForReputation(0)).toBe(3);
    expect(farmPlotCountForReputation(8)).toBe(4);
    expect(farmPlotCountForReputation(20)).toBe(5);
    expect(nextFarmPlotUpgrade(7)).toMatchObject({
      plotCount: 4,
      reputationRequired: 8,
    });
    expect(nextFarmPlotUpgrade(20)).toBeNull();
  });

  it("normalizes high reputation saves with unlocked plots", () => {
    const parsed = parseFarmState({
      stats: { reputation: 20 },
    });

    expect(parsed.plots).toHaveLength(5);
    expect(parsed.plots[4]).toMatchObject({ id: "plot-5", cropId: null });
  });

  it("normalizes malformed saves to three stable plots", () => {
    const parsed = parseFarmState({
      plots: [{ id: "bad", cropId: "unknown", plantedAt: -1, readyAt: -1 }],
      inventory: { wheat: 2, nope: 10 },
      seeds: { wheat: 2, nope: 10 },
      deliveries: { dayKey: "2026-07-07", claimedIds: ["bakery-wheat", 1] },
      stats: { harvests: 3, reputation: 4 },
    });

    expect(parsed.plots).toHaveLength(3);
    expect(parsed.plots[0].id).toBe("plot-1");
    expect(parsed.plots[0].cropId).toBeNull();
    expect(parsed.inventory).toEqual({ wheat: 2 });
    expect(parsed.seeds).toEqual({ wheat: 2 });
    expect(parsed.deliveries).toEqual({
      dayKey: "2026-07-07",
      claimedIds: ["bakery-wheat"],
    });
    expect(parsed.weekly.claimedIds).toEqual([]);
    expect(parsed.stats).toEqual({
      harvests: 3,
      rareHarvests: 0,
      deliveries: 0,
      reputation: 4,
      reputationSpent: 0,
    });
  });
});
