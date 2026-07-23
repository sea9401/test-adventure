import { describe, expect, it } from "vitest";
import {
  GUILD_WORKSHOP_DELIVERIES,
  GUILD_WORKSHOP_MASTER_MARK_DELIVERY_BONUS_PCT,
  claimGuildWorkshopDelivery,
  guildWorkshopDeliveryReward,
  guildWorkshopDeliveryViews,
  parseGuildWorkshopDeliveryState,
  todayDeliveryKey,
} from "./guildWorkshopDelivery";
import type { V2EquipInstance } from "./v2Equipment";

describe("guild workshop delivery", () => {
  const crafted: V2EquipInstance = {
    iid: "a",
    id: "v2_iron_sword",
    craftedBy: {
      userId: "u",
      profession: "blacksmith",
      level: 3,
      craftedAt: new Date(0).toISOString(),
    },
  };

  it("resets the delivery day at midnight KST", () => {
    expect(todayDeliveryKey(new Date("2026-07-23T14:59:59Z"))).toBe(
      "2026-07-23",
    );
    expect(todayDeliveryKey(new Date("2026-07-23T15:00:00Z"))).toBe(
      "2026-07-24",
    );
  });

  it("resets malformed or stale state to the current day", () => {
    expect(parseGuildWorkshopDeliveryState(null, "2026-06-30")).toEqual({
      dayKey: "2026-06-30",
      claimed: [],
    });
    expect(
      parseGuildWorkshopDeliveryState(
        { dayKey: "2026-06-29", claimed: ["daily_crafted_any"] },
        "2026-06-30",
      ),
    ).toEqual({ dayKey: "2026-06-30", claimed: [] });
  });

  it("finds deliverable crafted, quality, and craft-only equipment", () => {
    const views = guildWorkshopDeliveryViews(
      { dayKey: "2026-06-30", claimed: [] },
      [
        crafted,
        { ...crafted, iid: "b", craftQuality: { level: 1, bonusPct: 5 } },
        { ...crafted, iid: "c", id: "v2_crafted_oathblade" },
        {
          ...crafted,
          iid: "d",
          id: "v2_crafted_sunforge_blade",
          craftedBy: { ...crafted.craftedBy!, level: 8, masterwork: true },
        },
      ],
      new Set(),
    );
    expect(views.find((v) => v.id === "daily_crafted_any")?.canClaim).toBe(true);
    expect(views.find((v) => v.id === "daily_quality_any")?.canClaim).toBe(true);
    expect(views.find((v) => v.id === "daily_craft_only")?.canClaim).toBe(true);
    expect(views.find((v) => v.id === "daily_masterwork")?.canClaim).toBe(true);
    expect(
      views.find((v) => v.id === "daily_craft_only")?.deliverable[0],
    ).toMatchObject({
      itemName: "맹세의 장검",
      craftOnly: true,
      crafterLevel: 3,
    });
    expect(
      views.find((v) => v.id === "daily_masterwork")?.deliverable[0],
    ).toMatchObject({
      itemName: "태양담금 검",
      craftOnly: true,
      crafterLevel: 8,
    });
  });

  it("scales rewards by smithy level and delivered quality", () => {
    const reward = guildWorkshopDeliveryReward(
      GUILD_WORKSHOP_DELIVERIES.daily_quality_any,
      { ...crafted, craftQuality: { level: 1, bonusPct: 5 } },
      5,
    );
    expect(reward).toEqual({
      rewardArtisanXp: 58,
      rewardGold: 325000,
      bonusPct: 30,
      masterworkBonusPct: 0,
      masterMarkBonusPct: 0,
    });
  });

  it("adds a separate premium for masterwork marked deliveries", () => {
    const reward = guildWorkshopDeliveryReward(
      GUILD_WORKSHOP_DELIVERIES.daily_masterwork,
      {
        ...crafted,
        id: "v2_crafted_sunforge_blade",
        craftedBy: { ...crafted.craftedBy!, level: 8, masterwork: true },
      },
      3,
    );
    expect(reward).toMatchObject({
      bonusPct: 35,
      masterworkBonusPct: 25,
      masterMarkBonusPct: 0,
    });
    expect(reward.rewardGold).toBe(945000);
  });

  it("adds an extra delivery premium to masterwork equipment crafted at level 10", () => {
    const reward = guildWorkshopDeliveryReward(
      GUILD_WORKSHOP_DELIVERIES.daily_masterwork,
      {
        ...crafted,
        id: "v2_crafted_sunforge_blade",
        craftedBy: { ...crafted.craftedBy!, level: 10, masterwork: true },
      },
      3,
    );
    expect(reward).toMatchObject({
      bonusPct: 45,
      masterworkBonusPct: 25,
      masterMarkBonusPct: GUILD_WORKSHOP_MASTER_MARK_DELIVERY_BONUS_PCT,
    });
    expect(reward.rewardGold).toBe(1_015_000);
  });

  it("requires craft-only equipment with a masterwork mark for masterwork delivery", () => {
    const lowLevel: V2EquipInstance = {
      ...crafted,
      iid: "low",
      id: "v2_crafted_sunforge_blade",
      craftedBy: { ...crafted.craftedBy!, level: 7 },
    };
    const masterwork: V2EquipInstance = {
      ...lowLevel,
      iid: "master",
      craftedBy: { ...crafted.craftedBy!, level: 8, masterwork: true },
    };
    const regularHighLevel: V2EquipInstance = {
      ...crafted,
      id: "v2_crafted_sunforge_blade",
      iid: "regular",
      craftedBy: { ...crafted.craftedBy!, level: 9 },
    };

    expect(GUILD_WORKSHOP_DELIVERIES.daily_masterwork.accepts(lowLevel)).toBe(
      false,
    );
    expect(
      GUILD_WORKSHOP_DELIVERIES.daily_masterwork.accepts(regularHighLevel),
    ).toBe(false);
    expect(GUILD_WORKSHOP_DELIVERIES.daily_masterwork.accepts(masterwork)).toBe(
      true,
    );
  });

  it("does not offer locked or equipped items and marks claimed deliveries", () => {
    const state = claimGuildWorkshopDelivery(
      { dayKey: "2026-06-30", claimed: [] },
      "daily_crafted_any",
    );
    const views = guildWorkshopDeliveryViews(
      state,
      [{ ...crafted, locked: true }],
      new Set(["a"]),
    );
    const daily = views.find((v) => v.id === "daily_crafted_any");
    expect(daily?.claimed).toBe(true);
    expect(daily?.canClaim).toBe(false);
    expect(daily?.deliverable).toHaveLength(0);
  });
});
