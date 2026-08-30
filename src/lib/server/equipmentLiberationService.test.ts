import { describe, expect, it } from "vitest";
import {
  EQUIPMENT_LIBERATION_GOLD_COST,
  applyEquipmentLiberation,
} from "./equipmentLiberationService";

const TIER_6_ID = "v2_storm_breaker_greatsword";

function character(gold = EQUIPMENT_LIBERATION_GOLD_COST, bankedGold = 0) {
  return { level: 100, gold, bankedGold, preserved: "yes" };
}

function equipment(
  item: Record<string, unknown> = { iid: "weapon-1", id: TIER_6_ID },
) {
  return {
    owned: [item],
    equipped: { weapon: "weapon-1" },
  };
}

describe("applyEquipmentLiberation", () => {
  it("binds a true 6T item and charges the fixed cost across wallet and bank", () => {
    const result = applyEquipmentLiberation({
      character: character(10_000_000, 10_000_000),
      equipment: equipment(),
      iid: "weapon-1",
      expectedRevision: 0,
      rng: () => 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.character).toMatchObject({
      gold: 0,
      bankedGold: 5_000_000,
      preserved: "yes",
    });
    expect(result.item).toMatchObject({
      iid: "weapon-1",
      bound: true,
      liberation: { rank: 3, lineCount: 1, revision: 1 },
    });
    expect(result.spentGold).toBe(15_000_000);
  });

  it("rerolls every option, preserves line count, and increments revision", () => {
    const result = applyEquipmentLiberation({
      character: character(),
      equipment: equipment({
        iid: "weapon-1",
        id: TIER_6_ID,
        bound: true,
        liberation: {
          rank: 3,
          lineCount: 2,
          revision: 8,
          options: [
            { id: "physical_attack_flat", level: 1 },
            { id: "magic_attack_flat", level: 1 },
          ],
        },
      }),
      iid: "weapon-1",
      expectedRevision: 8,
      rng: () => 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.liberation).toMatchObject({
      rank: 2,
      lineCount: 2,
      revision: 9,
    });
    expect(result.item.liberation?.options).not.toEqual([
      { id: "physical_attack_flat", level: 1 },
      { id: "magic_attack_flat", level: 1 },
    ]);
  });

  it.each([
    [equipment(), "missing", 0, "not_owned"],
    [equipment({ iid: "weapon-1", id: "v2_iron_sword" }), "weapon-1", 0, "ineligible"],
    [
      equipment({ iid: "weapon-1", id: TIER_6_ID, stormRefined: true }),
      "weapon-1",
      0,
      "ineligible",
    ],
  ] as const)("rejects invalid ownership or eligibility without mutation", (save, iid, revision, error) => {
    const originalCharacter = character();
    const originalEquipment = structuredClone(save);
    const result = applyEquipmentLiberation({
      character: originalCharacter,
      equipment: save,
      iid,
      expectedRevision: revision,
      rng: () => {
        throw new Error("rng must not run");
      },
    });

    expect(result).toEqual({ ok: false, error });
    expect(originalCharacter).toEqual(character());
    expect(save).toEqual(originalEquipment);
  });

  it("returns the latest item on stale state without charging or rolling", () => {
    const save = equipment({
      iid: "weapon-1",
      id: TIER_6_ID,
      bound: true,
      liberation: {
        rank: 3,
        lineCount: 1,
        revision: 2,
        options: [{ id: "physical_attack_flat", level: 1 }],
      },
    });
    const result = applyEquipmentLiberation({
      character: character(),
      equipment: save,
      iid: "weapon-1",
      expectedRevision: 1,
      rng: () => {
        throw new Error("rng must not run");
      },
    });

    expect(result).toMatchObject({
      ok: false,
      error: "stale_state",
      item: { iid: "weapon-1", liberation: { revision: 2 } },
    });
  });

  it("does not bind, roll, or partially charge when combined gold is short", () => {
    const originalCharacter = character(14_999_999, 0);
    const originalEquipment = equipment();
    const result = applyEquipmentLiberation({
      character: originalCharacter,
      equipment: originalEquipment,
      iid: "weapon-1",
      expectedRevision: 0,
      rng: () => {
        throw new Error("rng must not run");
      },
    });

    expect(result).toEqual({
      ok: false,
      error: "insufficient_gold",
      goldCost: EQUIPMENT_LIBERATION_GOLD_COST,
    });
    expect(originalCharacter.gold).toBe(14_999_999);
    expect(originalEquipment.owned[0]).not.toHaveProperty("bound");
    expect(originalEquipment.owned[0]).not.toHaveProperty("liberation");
  });
});
