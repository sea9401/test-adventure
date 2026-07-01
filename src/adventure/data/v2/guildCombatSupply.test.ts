import { describe, expect, it } from "vitest";
import {
  applyGuildCombatRewardBonus,
  guildCombatSupplyBonuses,
  guildCombatSupplyNextCost,
  parseGuildCombatSupplyLevels,
  rollGuildCombatProficiencyBonus,
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
    expect(applyGuildCombatRewardBonus(1234, bonuses.goldPct)).toBe(1357);
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
});
