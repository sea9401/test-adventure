import { describe, expect, it } from "vitest";
import {
  applyGuildCombatRewardBonus,
  guildCombatOperationsNextCost,
  guildCombatSupplyBonuses,
  guildCombatSupplyNextCost,
  parseGuildCombatOperationsTier,
  parseGuildCombatSupplyLevels,
  rollGuildCombatProficiencyBonus,
  upsertGuildCombatOperationsBuff,
  upsertGuildCombatSupplyBuff,
} from "./guildCombatSupply";

describe("guild combat supply", () => {
  it("parses only known combat supply buff slots", () => {
    const levels = parseGuildCombatSupplyLevels([
      { buffId: "combat_gold", tier: 3 },
      { buffId: "combat_exp", tier: 99 },
      { buffId: "other", tier: 10 },
      { buffId: "combat_proficiency", tier: -1 },
    ]);

    expect(levels).toEqual({
      combat_gold: 3,
      combat_exp: 10,
      combat_proficiency: 0,
    });
  });

  it("uses the approved 10-step fame cost curve", () => {
    expect(Array.from({ length: 10 }, (_, i) => guildCombatSupplyNextCost(i))).toEqual([
      200,
      400,
      700,
      1100,
      1600,
      2300,
      3200,
      4400,
      6000,
      8000,
    ]);
    expect(guildCombatSupplyNextCost(10)).toBeNull();
  });

  it("computes reward and proficiency bonuses", () => {
    const bonuses = guildCombatSupplyBonuses({
      combat_gold: 10,
      combat_exp: 4,
      combat_proficiency: 7,
    });

    expect(bonuses).toEqual({
      goldPct: 10,
      expPct: 4,
      proficiencyChancePct: 35,
    });
    expect(applyGuildCombatRewardBonus(1234, bonuses.goldPct, () => 0.41)).toBe(1357);
    expect(applyGuildCombatRewardBonus(3, 10, () => 0.29)).toBe(4);
    expect(applyGuildCombatRewardBonus(3, 10, () => 0.3)).toBe(3);
    expect(rollGuildCombatProficiencyBonus(35, () => 0.34)).toBe(1);
    expect(rollGuildCombatProficiencyBonus(35, () => 0.35)).toBe(0);
  });

  it("updates combat supply slots without dropping other guild buffs", () => {
    const next = upsertGuildCombatSupplyBuff(
      [
        { buffId: "other_buff", tier: 20, installedAt: "old" },
        { buffId: "combat_gold", tier: 1, installedAt: "gold-old" },
      ],
      "combat_gold",
      2,
      "now",
    );

    expect(next).toEqual([
      { buffId: "other_buff", tier: 20, installedAt: "old" },
      { buffId: "combat_gold", tier: 2, installedAt: "gold-old" },
    ]);
  });

  it("charges the next weekly operations tier and stops at tier 3", () => {
    expect([0, 1, 2, 3].map(guildCombatOperationsNextCost)).toEqual([
      10_000_000,
      20_000_000,
      40_000_000,
      null,
    ]);
  });

  it("expires weekly operations exactly at the KST Monday boundary", () => {
    const buffs = [
      {
        buffId: "combat_operations",
        tier: 2,
        installedAt: "2026-08-16T14:59:59.000Z",
      },
    ];

    expect(
      parseGuildCombatOperationsTier(
        buffs,
        new Date("2026-08-16T14:59:59.000Z"),
      ),
    ).toBe(2);
    expect(
      parseGuildCombatOperationsTier(
        buffs,
        new Date("2026-08-16T15:00:00.000Z"),
      ),
    ).toBe(0);
  });

  it("treats malformed weekly operations slots as inactive", () => {
    const now = new Date("2026-08-22T00:00:00.000Z");

    expect(
      parseGuildCombatOperationsTier(
        [{ buffId: "combat_operations", tier: 2, installedAt: "invalid" }],
        now,
      ),
    ).toBe(0);
    expect(
      parseGuildCombatOperationsTier(
        [
          {
            buffId: "combat_operations",
            tier: -3,
            installedAt: now.toISOString(),
          },
        ],
        now,
      ),
    ).toBe(0);
  });

  it("adds weekly operations above permanent research maximums", () => {
    const bonuses = guildCombatSupplyBonuses(
      {
        combat_gold: 10,
        combat_exp: 10,
        combat_proficiency: 10,
      },
      3,
    );

    expect(bonuses).toEqual({
      goldPct: 13,
      expPct: 13,
      proficiencyChancePct: 65,
    });
  });

  it("updates weekly operations without dropping permanent or unknown buffs", () => {
    const next = upsertGuildCombatOperationsBuff(
      [
        { buffId: "other_buff", tier: 20, installedAt: "other-old" },
        { buffId: "combat_gold", tier: 4, installedAt: "gold-old" },
        { buffId: "combat_operations", tier: 1, installedAt: "fund-old" },
      ],
      2,
      "fund-new",
    );

    expect(next).toEqual([
      { buffId: "other_buff", tier: 20, installedAt: "other-old" },
      { buffId: "combat_gold", tier: 4, installedAt: "gold-old" },
      { buffId: "combat_operations", tier: 2, installedAt: "fund-new" },
    ]);
  });
});
