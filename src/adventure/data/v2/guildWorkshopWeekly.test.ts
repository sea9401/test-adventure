import { describe, expect, it } from "vitest";
import {
  addGuildWorkshopWeeklyProgress,
  claimGuildWorkshopWeeklyQuest,
  guildWorkshopWeeklyQuestViews,
  guildWorkshopWeeklyRewardTotals,
  GUILD_WORKSHOP_WEEKLY_REWARD_CAP,
  GUILD_WORKSHOP_WEEKLY_QUESTS,
  parseGuildWorkshopWeeklyState,
} from "./guildWorkshopWeekly";

describe("guild workshop weekly quests", () => {
  it("resets stale week state lazily", () => {
    expect(
      parseGuildWorkshopWeeklyState(
        {
          weekKey: "2026-W25",
          craftCount: 99,
          qualityCount: 9,
          claimed: ["weekly_craft_20"],
        },
        "2026-W26",
      ),
    ).toEqual({
      weekKey: "2026-W26",
      craftCount: 0,
      qualityCount: 0,
      weaponCount: 0,
      armorCount: 0,
      craftOnlyCount: 0,
      masterworkCount: 0,
      highTierCount: 0,
      claimed: [],
    });
  });

  it("builds quest views from craft and quality progress", () => {
    const views = guildWorkshopWeeklyQuestViews({
      weekKey: "2026-W26",
      craftCount: 20,
      qualityCount: 2,
      weaponCount: 10,
      armorCount: 0,
      craftOnlyCount: 0,
      masterworkCount: 0,
      highTierCount: 0,
      claimed: [],
    });
    expect(views.find((q) => q.id === "weekly_craft_20")?.canClaim).toBe(true);
    expect(views.find((q) => q.id === "weekly_weapon_10")?.canClaim).toBe(true);
    expect(views.find((q) => q.id === "weekly_quality_3")?.complete).toBe(
      false,
    );
  });

  it("applies the smithy bonus to weekly quest progress without changing raw counts", () => {
    const state = {
      weekKey: "2026-W26",
      craftCount: 15,
      qualityCount: 2,
      weaponCount: 10,
      armorCount: 0,
      craftOnlyCount: 0,
      masterworkCount: 0,
      highTierCount: 0,
      claimed: [],
    };
    const views = guildWorkshopWeeklyQuestViews(state, 40);

    expect(views.find((q) => q.id === "weekly_craft_20")).toMatchObject({
      rawProgress: 15,
      progress: 21,
      progressBonusPct: 40,
      complete: true,
      canClaim: true,
    });
    expect(views.find((q) => q.id === "weekly_quality_3")).toMatchObject({
      rawProgress: 2,
      progress: 2.8,
      complete: false,
    });
    expect(state.craftCount).toBe(15);
    expect(state.qualityCount).toBe(2);
  });

  it("increments progress and claims once", () => {
    const base = {
      weekKey: "2026-W26",
      craftCount: 0,
      qualityCount: 0,
      weaponCount: 0,
      armorCount: 0,
      craftOnlyCount: 0,
      masterworkCount: 0,
      highTierCount: 0,
      claimed: [],
    };
    const progressed = addGuildWorkshopWeeklyProgress(base, {
      qualityCrafted: true,
      slot: "weapon",
      craftOnly: true,
      masterwork: true,
      tier: 8,
    });
    expect(progressed.craftCount).toBe(1);
    expect(progressed.qualityCount).toBe(1);
    expect(progressed.weaponCount).toBe(1);
    expect(progressed.craftOnlyCount).toBe(1);
    expect(progressed.masterworkCount).toBe(1);
    expect(progressed.highTierCount).toBe(1);
    expect(
      claimGuildWorkshopWeeklyQuest(progressed, "weekly_craft_20").claimed,
    ).toEqual(["weekly_craft_20"]);
  });

  it("counts the displayed 3T boundary as high-tier crafting", () => {
    const base = {
      weekKey: "2026-W26",
      craftCount: 0,
      qualityCount: 0,
      weaponCount: 0,
      armorCount: 0,
      craftOnlyCount: 0,
      masterworkCount: 0,
      highTierCount: 0,
      claimed: [],
    };
    const tier2 = addGuildWorkshopWeeklyProgress(base, { tier: 6 });
    const tier3 = addGuildWorkshopWeeklyProgress(base, { tier: 7 });

    expect(tier2.highTierCount).toBe(0);
    expect(tier3.highTierCount).toBe(1);
    expect(GUILD_WORKSHOP_WEEKLY_QUESTS.weekly_high_tier_5.title).toBe(
      "3T 이상 제작 5회",
    );
  });

  it("keeps old claimed arrays compatible and stores extra progress in payloads", () => {
    const parsed = parseGuildWorkshopWeeklyState(
      {
        weekKey: "2026-W26",
        craftCount: 5,
        qualityCount: 1,
        claimed: {
          ids: ["weekly_quality_3", "unknown"],
          weaponCount: 2,
          armorCount: 3,
          craftOnlyCount: 1,
          masterworkCount: 1,
          highTierCount: 1,
        },
      },
      "2026-W26",
    );
    expect(parsed).toMatchObject({
      claimed: ["weekly_quality_3"],
      weaponCount: 2,
      armorCount: 3,
      craftOnlyCount: 1,
      masterworkCount: 1,
      highTierCount: 1,
    });
  });

  it("keeps the full weekly reward budget inside the balance cap", () => {
    const totals = guildWorkshopWeeklyRewardTotals();
    expect(totals.gold).toBeLessThanOrEqual(
      GUILD_WORKSHOP_WEEKLY_REWARD_CAP.gold,
    );
    expect(totals.fame).toBeLessThanOrEqual(
      GUILD_WORKSHOP_WEEKLY_REWARD_CAP.fame,
    );
  });
});
