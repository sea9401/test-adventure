import { describe, expect, it } from "vitest";
import {
  FARM_DAILY_QUEST_SEED_REWARD,
  FARM_FISHING_SHOP_SEED_REWARD,
  FARM_CROP_REQUIRED_SKILL_ID,
  FARM_CROP_UNLOCK_SKILLS,
  FARM_CROPS,
  FARM_ITEMS,
  buyFarmRanchPen,
  buyFarmPlotUpgrade,
  buyFarmShopItem,
  canPlantFarmCrop,
  claimFarmSpecialDelivery,
  claimFarmDelivery,
  claimFarmWeeklyDelivery,
  collectFarmRanch,
  emptyFarmState,
  feedFarmRanch,
  farmCropMasteryGain,
  farmAvailableReputation,
  farmingLevelForXp,
  farmingLevelXpThreshold,
  getFarmDeliveryRequests,
  getFarmShopItems,
  getFarmWeeklyDeliveryRequests,
  grantFarmSeeds,
  harvestPlot,
  nextFarmPlotUpgrade,
  parseFarmState,
  parseFarmStateWithLevelMigration,
  plantCrop,
  type FarmState,
} from "./farm";

describe("adventurer farm", () => {
  it("기존 50레벨 기준을 보존하고 100레벨 곡선으로 확장한다", () => {
    expect(farmingLevelXpThreshold(50)).toBe(24_010);
    expect(farmingLevelXpThreshold(100)).toBe(120_050);
    expect(farmingLevelForXp(farmingLevelXpThreshold(75))).toBe(75);
  });

  it("구 50레벨 초과 농사 XP를 25%만 한 번 환산한다", () => {
    const legacy = emptyFarmState(1_000);
    const parsed = parseFarmStateWithLevelMigration({
      ...legacy,
      levelCurveVersion: undefined,
      stats: { ...legacy.stats, farmingXp: 999_999 },
    });

    expect(parsed.levelCurveMigrated).toBe(true);
    expect(parsed.state.levelCurveVersion).toBe(2);
    expect(parsed.state.stats.farmingXp).toBe(farmingLevelXpThreshold(60));
  });

  it("starts with two farm plots", () => {
    expect(emptyFarmState().plots).toHaveLength(2);
  });

  it("migrates an old farm with a starter coop but no retroactive production", () => {
    const { ranch: _ranch, ...oldFarm } = emptyFarmState(1_000);
    const parsed = parseFarmState(oldFarm, 50_000);

    expect(parsed.ranch.pens["coop-1"]).toMatchObject({
      unlocked: true,
      feed: 0,
      readyItems: 0,
      lastSettledAt: 50_000,
    });
  });

  it("moves feed into a pen and collects products into the farm inventory", () => {
    const started = feedFarmRanch(
      {
        ...emptyFarmState(1_000),
        inventory: { compound_feed: 6 },
      },
      "coop-1",
      6,
      1_000,
    );
    expect(started.inventory.compound_feed).toBeUndefined();

    const collected = collectFarmRanch(started, 1_000 + 12 * 60 * 60 * 1000);
    expect(collected.result).toMatchObject({
      items: { egg: 12 },
      farmingXpGained: 12,
    });
    expect(collected.state.inventory.egg).toBe(12);
    expect(collected.state.stats.farmingXp).toBe(12);
  });

  it("includes the first pig and spends four feed only to restock after shipment", () => {
    const base = emptyFarmState(1_000);
    const bought = buyFarmRanchPen(
      {
        ...base,
        ranch: {
          ...base.ranch,
          pens: {
            ...base.ranch.pens,
            "coop-2": { ...base.ranch.pens["coop-2"], unlocked: true },
            "cowshed-1": {
              ...base.ranch.pens["cowshed-1"],
              unlocked: true,
            },
            "cowshed-2": {
              ...base.ranch.pens["cowshed-2"],
              unlocked: true,
            },
          },
        },
        stats: {
          ...base.stats,
          reputation: 180,
          farmingXp: 24_010,
        },
      },
      "pigsty-1",
      1_000,
    );
    expect(bought.state.inventory.compound_feed).toBeUndefined();
    expect(bought.state.ranch.pens["pigsty-1"].feed).toBe(4);

    const shipped = collectFarmRanch(
      bought.state,
      1_000 + 16 * 60 * 60 * 1000,
    );
    expect(shipped.result).toMatchObject({
      items: { pork: 8 },
      farmingXpGained: 16,
    });
    expect(shipped.state.inventory.pork).toBe(8);
    expect(shipped.state.stats.farmingXp).toBe(24_026);

    const restocked = feedFarmRanch(
      {
        ...shipped.state,
        inventory: {
          ...shipped.state.inventory,
          compound_feed: 4,
        },
      },
      "pigsty-1",
      4,
      1_000 + 16 * 60 * 60 * 1000,
    );
    expect(restocked.inventory.compound_feed).toBeUndefined();
    expect(restocked.ranch.pens["pigsty-1"]).toMatchObject({
      feed: 4,
      progressMs: 0,
      readyItems: 0,
    });
  });

  it("buys ranch pens with available reputation at the required farming level", () => {
    const state = {
      ...emptyFarmState(1_000),
      stats: {
        ...emptyFarmState(1_000).stats,
        reputation: 30,
        farmingXp: 810,
      },
    };

    const bought = buyFarmRanchPen(state, "coop-2", 1_000);
    expect(bought.result).toMatchObject({
      penId: "coop-2",
      costReputation: 30,
    });
    expect(bought.state.ranch.pens["coop-2"].unlocked).toBe(true);
    expect(bought.state.stats.reputationSpent).toBe(30);
  });

  it("maps ranch inventory items to identifier-matched image assets", () => {
    expect(FARM_ITEMS.compound_feed.imageSrc).toBe(
      "/images/items/farm/compound_feed.webp",
    );
    expect(FARM_ITEMS.egg.imageSrc).toBe("/images/items/farm/egg.webp");
    expect(FARM_ITEMS.milk.imageSrc).toBe("/images/items/farm/milk.webp");
    expect(FARM_ITEMS.pork.imageSrc).toBe("/images/items/farm/pork.webp");
  });

  it("초반 확인 주기는 늘리고 후반 재배 시간은 16시간 이하로 제한한다", () => {
    expect(
      Object.fromEntries(
        Object.values(FARM_CROPS).map((crop) => [
          crop.id,
          crop.growMs / (60 * 60 * 1000),
        ]),
      ),
    ).toEqual({
      wheat: 2,
      herb: 3,
      corn: 4,
      tomato: 4,
      strawberry: 6,
      potato: 8,
      onion: 10,
      rice: 12,
      soybean: 12,
      sugarcane: 14,
      cacao: 16,
    });
  });

  it("plants a crop into an empty plot", () => {
    const now = 1_000;
    const state = plantCrop(emptyFarmState(), "plot-1", "wheat", now);

    expect(state.plots[0]).toMatchObject({
      id: "plot-1",
      cropId: "wheat",
      plantedAt: now,
      readyAt: now + 2 * 60 * 60 * 1000,
    });
    expect(state.seeds.wheat).toBe(2);
  });

  it("rejects planting without a seed", () => {
    const state = { ...emptyFarmState(), seeds: {} };

    expect(() => plantCrop(state, "plot-1", "wheat", 1_000)).toThrow(
      "no_seed",
    );
  });

  it("locks advanced crops unless the farmer passive has been learned", () => {
    const state = { ...emptyFarmState(), seeds: { corn: 1 } };

    expect(canPlantFarmCrop("corn", null)).toBe(false);
    expect(canPlantFarmCrop("corn", ["farmer"])).toBe(false);
    expect(canPlantFarmCrop("corn", [FARM_CROP_REQUIRED_SKILL_ID])).toBe(true);
    expect(() => plantCrop(state, "plot-1", "corn", 1_000)).toThrow(
      "crop_locked",
    );

    const planted = plantCrop(state, "plot-1", "corn", 1_000, {
      learnedSkillIds: [FARM_CROP_REQUIRED_SKILL_ID],
    });
    expect(planted.plots[0].cropId).toBe("corn");
  });

  it("grants farm seeds from the daily quest seed pouch", () => {
    const state = {
      ...emptyFarmState(1_000),
      seeds: { wheat: 1 },
    };
    const next = grantFarmSeeds(state, FARM_DAILY_QUEST_SEED_REWARD);

    expect(next.seeds).toEqual({ wheat: 9, herb: 4, corn: 2 });
  });

  it("grants farm seeds from the fishing coin shop pouch", () => {
    const next = grantFarmSeeds(
      emptyFarmState(1_000),
      FARM_FISHING_SHOP_SEED_REWARD,
    );

    expect(next.seeds).toEqual({ wheat: 6, herb: 3, corn: 1 });
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
      { learnedSkillIds: [FARM_CROP_REQUIRED_SKILL_ID] },
    );
    const { state, result } = harvestPlot(
      planted,
      "plot-1",
      1_000 + 4 * 60 * 60 * 1000,
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
      farmingXp: 60,
      rareMissStreak: 0,
      yieldBonusRemainderPct: 0,
    });
    expect(result.farmingXpGained).toBe(60);
    expect(result.farmingXp).toBe(60);
    expect(result.farmingLevel).toBe(3);
    expect(state.plots[0].cropId).toBeNull();
  });

  it("농장 수확량 보너스를 소수점 손실 없이 다음 수확에 누적한다", () => {
    let state: FarmState = {
      ...emptyFarmState(1_000),
      seeds: { wheat: 5 },
    };
    const quantities: number[] = [];

    for (let index = 0; index < 5; index += 1) {
      const plantedAt = 1_000 + index * FARM_CROPS.wheat.growMs;
      state = plantCrop(state, "plot-1", "wheat", plantedAt);
      const harvested = harvestPlot(
        state,
        "plot-1",
        plantedAt + FARM_CROPS.wheat.growMs,
        () => 0.5,
        { yieldBonusPct: 10 },
      );
      state = harvested.state;
      quantities.push(harvested.result.quantity);
    }

    expect(quantities).toEqual([4, 4, 5, 4, 5]);
    expect(state.inventory.wheat).toBe(22);
    expect(state.stats.yieldBonusRemainderPct).toBe(0);
  });

  it("농장 패시브의 희귀 수확 보너스를 적용한다", () => {
    const planted = plantCrop(
      { ...emptyFarmState(), seeds: { wheat: 1 } },
      "plot-1",
      "wheat",
      1_000,
    );
    const { state, result } = harvestPlot(
      planted,
      "plot-1",
      1_000 + FARM_CROPS.wheat.growMs,
      () => 0.5,
      { yieldBonusPct: 10, rareChancePct: 50 },
    );

    expect(result.quantity).toBe(4);
    expect(result.rareItemId).toBe("golden_wheat");
    expect(state.inventory.wheat).toBe(4);
    expect(state.inventory.golden_wheat).toBe(1);
    expect(result.farmingXpGained).toBe(30);
  });

  it("guarantees one rare crop by the 20th consecutive miss", () => {
    let state = emptyFarmState(1_000);
    state = { ...state, seeds: { wheat: 20 } };
    let lastRareQuantity = 0;
    for (let index = 0; index < 20; index += 1) {
      const planted = plantCrop(state, "plot-1", "wheat", index * 10_000);
      const harvested = harvestPlot(
        planted,
        "plot-1",
        index * 10_000 + FARM_CROPS.wheat.growMs,
        () => 0.99,
      );
      state = harvested.state;
      lastRareQuantity = harvested.result.rareQuantity;
      if (index < 19) expect(lastRareQuantity).toBe(0);
    }
    expect(lastRareQuantity).toBe(1);
    expect(state.stats.rareMissStreak).toBe(0);
  });

  it("reduces the hourly farming xp rate after four hours", () => {
    expect(farmCropMasteryGain("wheat")).toBe(30);
    expect(farmCropMasteryGain("herb")).toBe(45);
    expect(farmCropMasteryGain("tomato")).toBe(60);
    expect(farmCropMasteryGain("strawberry")).toBe(76);
    expect(farmCropMasteryGain("corn")).toBe(60);
    expect(farmCropMasteryGain("potato")).toBe(92);
    expect(farmCropMasteryGain("onion")).toBe(108);
    expect(farmCropMasteryGain("rice")).toBe(124);
    expect(farmCropMasteryGain("soybean")).toBe(124);
    expect(farmCropMasteryGain("sugarcane")).toBe(140);
    expect(farmCropMasteryGain("cacao")).toBe(156);
    expect(farmingLevelForXp(0)).toBe(1);
    expect(farmingLevelForXp(810)).toBe(10);
    expect(farmingLevelForXp(24010)).toBe(50);
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
      rewardSeeds: { wheat: 2 },
      rewardReputation: 2,
    });
    expect(next.inventory.wheat).toBeUndefined();
    expect(next.seeds).toEqual({ wheat: 2 });
    expect(next.deliveries.claimedIds).toEqual(["bakery-wheat"]);
    expect(next.stats.deliveries).toBe(1);
    expect(next.stats.reputation).toBe(2);
    expect(next.stats.reputationSpent).toBe(0);
  });

  it("모든 작물 일일 납품이 같은 작물 씨앗 2개를 돌려준다", () => {
    for (const request of getFarmDeliveryRequests().filter(
      (entry) => entry.requiredItemId !== "egg" && entry.requiredItemId !== "milk",
    )) {
      expect(request.rewardSeeds).toEqual({ [request.requiredItemId]: 2 });
    }
  });

  it("adds egg and milk deliveries to the shared daily farm limit", () => {
    expect(
      getFarmDeliveryRequests().find((request) => request.id === "bakery-eggs"),
    ).toMatchObject({
      requiredItemId: "egg",
      requiredQuantity: 8,
      rewardSeeds: {},
      rewardReputation: 3,
    });
    expect(
      getFarmDeliveryRequests().find((request) => request.id === "inn-milk"),
    ).toMatchObject({
      requiredItemId: "milk",
      requiredQuantity: 6,
      rewardSeeds: {},
      rewardReputation: 4,
    });

    const base = {
      ...emptyFarmState(1_000),
      inventory: { egg: 8, milk: 6, wheat: 3 },
      seeds: {},
    };
    const first = claimFarmDelivery(base, "bakery-eggs", 1_000).state;
    const second = claimFarmDelivery(first, "inn-milk", 1_000).state;
    expect(() => claimFarmDelivery(second, "bakery-wheat", 1_000)).toThrow(
      "delivery_daily_limit",
    );
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

  it("spends available farm reputation in the farm shop without changing plot unlocks", () => {
    const state = {
      ...emptyFarmState(1_000),
      stats: {
        ...emptyFarmState(1_000).stats,
        reputation: 20,
      },
      seeds: {},
    };

    const { state: next, result } = buyFarmShopItem(state, "market-seed-box", {
      learnedSkillIds: [FARM_CROP_REQUIRED_SKILL_ID],
    });

    expect(result).toMatchObject({
      itemId: "market-seed-box",
      costReputation: 12,
      rewardSeeds: { corn: 2 },
    });
    expect(next.stats.reputation).toBe(20);
    expect(next.stats.reputationSpent).toBe(12);
    expect(farmAvailableReputation(next)).toBe(8);
    expect(next.plots).toHaveLength(2);
  });

  it("unlocks two cooking-oriented crops at each advanced farmer skill", () => {
    const unlocks = [
      [FARM_CROP_UNLOCK_SKILLS.horticulturist.id, ["tomato", "strawberry"]],
      [FARM_CROP_UNLOCK_SKILLS.masterfarmer.id, ["potato", "onion"]],
      [FARM_CROP_UNLOCK_SKILLS.harvestking.id, ["rice", "soybean"]],
      [FARM_CROP_UNLOCK_SKILLS.earthartisan.id, ["sugarcane", "cacao"]],
    ] as const;

    for (const [skillId, cropIds] of unlocks) {
      for (const cropId of cropIds) {
        expect(canPlantFarmCrop(cropId, [])).toBe(false);
        expect(canPlantFarmCrop(cropId, [skillId])).toBe(true);
      }
    }
  });

  it("prevents buying an advanced seed box before learning its skill", () => {
    const state = {
      ...emptyFarmState(1_000),
      stats: { ...emptyFarmState(1_000).stats, reputation: 100 },
    };

    expect(() => buyFarmShopItem(state, "horticulture-seed-box")).toThrow(
      "shop_item_locked",
    );

    const { state: next } = buyFarmShopItem(state, "horticulture-seed-box", {
      learnedSkillIds: [FARM_CROP_UNLOCK_SKILLS.horticulturist.id],
    });
    expect(next.seeds.tomato).toBe(4);
    expect(next.seeds.strawberry).toBe(2);
  });

  it("고급 씨앗 상자는 확장 밭을 채울 수 있도록 지급량을 늘린다", () => {
    const rewards = Object.fromEntries(
      getFarmShopItems().map((item) => [item.id, item.rewardSeeds]),
    );
    expect(rewards["horticulture-seed-box"]).toEqual({
      tomato: 4,
      strawberry: 2,
    });
    expect(rewards["staple-seed-box"]).toEqual({ potato: 4, onion: 4 });
    expect(rewards["artisan-seed-box"]).toEqual({ rice: 4, soybean: 4 });
    expect(rewards["legendary-seed-box"]).toEqual({ sugarcane: 4, cacao: 2 });
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
    expect(nextDay.plots).toHaveLength(2);
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
    expect(claimed.seeds.wheat).toBe(6);
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
    expect(reset.seeds.wheat).toBe(12);
    expect(reset.stats.reputation).toBe(16);
  });

  it("주간 기본 납품은 해당 작물 씨앗 6개를 지급한다", () => {
    expect(
      getFarmWeeklyDeliveryRequests().map((request) => request.rewardSeeds),
    ).toEqual([{ wheat: 6 }, { herb: 6 }, { corn: 6 }]);
  });

  it("buys farm plot growth with available reputation", () => {
    const base = {
      ...emptyFarmState(1_000),
      stats: {
        ...emptyFarmState(1_000).stats,
        reputation: 350,
      },
    };

    expect(nextFarmPlotUpgrade(base)).toMatchObject({
      plotCount: 3,
      costReputation: 20,
    });
    const { state: first, result: firstResult } = buyFarmPlotUpgrade(base);
    expect(firstResult).toMatchObject({
      plotCount: 3,
      costReputation: 20,
    });
    expect(first.plots).toHaveLength(3);
    expect(first.stats.reputation).toBe(350);
    expect(first.stats.reputationSpent).toBe(20);
    expect(farmAvailableReputation(first)).toBe(330);

    const { state: second } = buyFarmPlotUpgrade(first);
    expect(second.plots).toHaveLength(4);
    expect(second.stats.reputationSpent).toBe(70);
    expect(farmAvailableReputation(second)).toBe(280);

    const { state: third } = buyFarmPlotUpgrade(second);
    expect(third.plots).toHaveLength(5);
    expect(third.stats.reputationSpent).toBe(170);
    expect(farmAvailableReputation(third)).toBe(180);

    const { state: fourth } = buyFarmPlotUpgrade(third);
    expect(fourth.plots).toHaveLength(6);
    expect(fourth.stats.reputationSpent).toBe(350);
    expect(farmAvailableReputation(fourth)).toBe(0);
    expect(nextFarmPlotUpgrade(fourth)).toBeNull();
  });

  it("rejects farm plot growth without enough available reputation", () => {
    const state = {
      ...emptyFarmState(1_000),
      stats: {
        ...emptyFarmState(1_000).stats,
        reputation: 20,
        reputationSpent: 3,
      },
    };

    expect(() => buyFarmPlotUpgrade(state)).toThrow("not_enough_reputation");
  });

  it("does not unlock plots from high reputation saves without purchase", () => {
    const parsed = parseFarmState({
      stats: { reputation: 20 },
    });

    expect(parsed.plots).toHaveLength(2);
  });

  it("preserves purchased plot saves", () => {
    const parsed = parseFarmState({
      plots: [
        { id: "plot-1", cropId: null },
        { id: "plot-2", cropId: null },
        { id: "plot-3", cropId: null },
        { id: "plot-4", cropId: null },
        { id: "plot-5", cropId: null },
        { id: "plot-6", cropId: null },
      ],
      stats: { reputation: 20, reputationSpent: 8 },
    });

    expect(parsed.plots).toHaveLength(6);
    expect(parsed.plots[5]).toMatchObject({ id: "plot-6", cropId: null });
  });

  it("normalizes malformed saves to two stable plots", () => {
    const parsed = parseFarmState({
      plots: [{ id: "bad", cropId: "unknown", plantedAt: -1, readyAt: -1 }],
      inventory: { wheat: 2, nope: 10 },
      seeds: { wheat: 2, nope: 10 },
      deliveries: { dayKey: "2026-07-07", claimedIds: ["bakery-wheat", 1] },
      stats: { harvests: 3, reputation: 4 },
    });

    expect(parsed.plots).toHaveLength(2);
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
      farmingXp: 0,
      rareMissStreak: 0,
      yieldBonusRemainderPct: 0,
    });
  });
});
