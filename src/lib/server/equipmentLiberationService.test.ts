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

  it("uses one enchant scroll instead of gold and keeps the wallet untouched", () => {
    const result = applyEquipmentLiberation({
      character: { ...character(0, 0), cashItems: { enchant_scroll: 2, rename_permit: 1 } },
      equipment: equipment(),
      iid: "weapon-1",
      expectedRevision: 0,
      payment: "enchant_scroll",
      rng: () => 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.character).toMatchObject({
      gold: 0,
      bankedGold: 0,
      cashItems: { enchant_scroll: 1, rename_permit: 1 },
    });
    expect(result.spentGold).toBe(0);
    expect(result.spentEnchantScrolls).toBe(1);
    expect(result.item).toMatchObject({ bound: true, liberation: { revision: 1 } });
  });

  it("rejects scroll payment without a scroll and changes nothing", () => {
    const originalCharacter = { ...character(), cashItems: {} };
    const originalEquipment = equipment();
    const result = applyEquipmentLiberation({
      character: originalCharacter,
      equipment: originalEquipment,
      iid: "weapon-1",
      expectedRevision: 0,
      payment: "enchant_scroll",
      rng: () => {
        throw new Error("rng must not run");
      },
    });

    expect(result).toEqual({ ok: false, error: "insufficient_enchant_scroll" });
    expect(originalCharacter.gold).toBe(EQUIPMENT_LIBERATION_GOLD_COST);
    expect(originalEquipment.owned[0]).not.toHaveProperty("liberation");
  });

  describe("세공 보석으로 줄 고정", () => {
    const LOCK_GOLD = 5_000_000;
    function liberated(rank: 1 | 2 | 3, lineCount: 1 | 2 | 3 = 3) {
      const level = rank === 3 ? 5 : rank === 2 ? 8 : 15;
      return equipment({
        iid: "weapon-1",
        id: TIER_6_ID,
        bound: true,
        liberation: {
          rank,
          lineCount,
          revision: 8,
          options: [
            { id: "physical_attack_flat", level },
            { id: "magic_attack_flat", level },
            { id: "accuracy_flat", level },
          ].slice(0, lineCount),
        },
      });
    }
    // 승급하지 않는 굴림.
    const noPromotion = () => {
      const values = [0.5, 0.3, 0.2, 0.6, 0.1, 0.9, 0.4];
      let index = 0;
      return () => values[index++ % values.length];
    };

    it("고정한 줄을 남기고 보석과 추가 골드를 쓴다", () => {
      const result = applyEquipmentLiberation({
        character: {
          ...character(EQUIPMENT_LIBERATION_GOLD_COST + LOCK_GOLD * 2 + 7),
          materials: { v2_cut_gem_polished: 1, v2_cut_gem_refined: 3, other: 9 },
        },
        equipment: liberated(3),
        iid: "weapon-1",
        expectedRevision: 8,
        lockedLines: [0, 2],
        rng: noPromotion(),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.item.liberation?.options[0]).toEqual({ id: "physical_attack_flat", level: 5 });
      expect(result.item.liberation?.options[2]).toEqual({ id: "accuracy_flat", level: 5 });
      expect(result.item.liberation?.revision).toBe(9);
      expect(result.spentGold).toBe(EQUIPMENT_LIBERATION_GOLD_COST + LOCK_GOLD * 2);
      expect(result.character.gold).toBe(7);
      // 낮은 등급부터 쓴다.
      expect(result.spentCutGems).toEqual({ v2_cut_gem_polished: 1, v2_cut_gem_refined: 1 });
      expect(result.character.materials).toEqual({ v2_cut_gem_refined: 2, other: 9 });
    });

    it("장비 단계에 맞는 보석이 모자라면 아무것도 쓰지 않는다", () => {
      const rank1 = applyEquipmentLiberation({
        character: { ...character(100_000_000), materials: { v2_cut_gem_polished: 9, v2_cut_gem_refined: 9 } },
        equipment: liberated(1),
        iid: "weapon-1",
        expectedRevision: 8,
        lockedLines: [1],
        rng: () => {
          throw new Error("rng must not run");
        },
      });
      expect(rank1).toEqual({ ok: false, error: "insufficient_cut_gems" });

      const rank2 = applyEquipmentLiberation({
        character: { ...character(100_000_000), materials: { v2_cut_gem_polished: 9, v2_cut_gem_refined: 1 } },
        equipment: liberated(2),
        iid: "weapon-1",
        expectedRevision: 8,
        lockedLines: [0, 1],
        rng: () => {
          throw new Error("rng must not run");
        },
      });
      expect(rank2).toEqual({ ok: false, error: "insufficient_cut_gems" });
    });

    it("골드가 모자라면 필요한 총액을 알리고 아무것도 쓰지 않는다", () => {
      const result = applyEquipmentLiberation({
        character: {
          ...character(EQUIPMENT_LIBERATION_GOLD_COST + LOCK_GOLD - 1),
          materials: { v2_cut_gem_flawless: 1 },
        },
        equipment: liberated(1),
        iid: "weapon-1",
        expectedRevision: 8,
        lockedLines: [0],
        rng: () => {
          throw new Error("rng must not run");
        },
      });
      expect(result).toEqual({
        ok: false,
        error: "insufficient_gold",
        goldCost: EQUIPMENT_LIBERATION_GOLD_COST + LOCK_GOLD,
      });
    });

    it("마법부여서로 내도 줄 고정의 추가 골드는 골드로 낸다", () => {
      const result = applyEquipmentLiberation({
        character: {
          ...character(LOCK_GOLD + 3),
          cashItems: { enchant_scroll: 2 },
          materials: { v2_cut_gem_flawless: 1 },
        },
        equipment: liberated(2),
        iid: "weapon-1",
        expectedRevision: 8,
        payment: "enchant_scroll",
        lockedLines: [1],
        rng: noPromotion(),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.spentEnchantScrolls).toBe(1);
      expect(result.spentGold).toBe(LOCK_GOLD);
      expect(result.character.gold).toBe(3);
      expect(result.spentCutGems).toEqual({ v2_cut_gem_flawless: 1 });
      expect(result.item.liberation?.options[1]).toEqual({ id: "magic_attack_flat", level: 8 });
    });

    it("처음 마법부여하거나 줄 번호가 잘못되면 거절한다", () => {
      const rich = { ...character(100_000_000), materials: { v2_cut_gem_flawless: 9 } };
      const fail = () => {
        throw new Error("rng must not run");
      };
      expect(
        applyEquipmentLiberation({ character: rich, equipment: equipment(), iid: "weapon-1", expectedRevision: 0, lockedLines: [0], rng: fail }),
      ).toEqual({ ok: false, error: "invalid_locked_lines" });
      for (const lockedLines of [[0, 1, 2], [3], [0, 0]]) {
        expect(
          applyEquipmentLiberation({ character: rich, equipment: liberated(3), iid: "weapon-1", expectedRevision: 8, lockedLines, rng: fail }),
        ).toEqual({ ok: false, error: "invalid_locked_lines" });
      }
      expect(
        applyEquipmentLiberation({ character: rich, equipment: liberated(3, 1), iid: "weapon-1", expectedRevision: 8, lockedLines: [0], rng: fail }),
      ).toEqual({ ok: false, error: "invalid_locked_lines" });
    });

    it("고정하지 않으면 보석을 쓰지 않고 기존 비용만 낸다", () => {
      const result = applyEquipmentLiberation({
        character: { ...character(), materials: { v2_cut_gem_flawless: 2 } },
        equipment: liberated(3),
        iid: "weapon-1",
        expectedRevision: 8,
        rng: noPromotion(),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.spentGold).toBe(EQUIPMENT_LIBERATION_GOLD_COST);
      expect(result.spentCutGems).toEqual({});
      expect(result.character.materials).toEqual({ v2_cut_gem_flawless: 2 });
    });
  });
});
