import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOUSING_LAYOUT,
  defaultHousingState,
  housingMasteryTrophyIsEligible,
  housingPlacementSize,
  parseHousingState,
  restoreHousingMasteryTrophies,
  stripHousingMasteryTrophies,
  validateHousingState,
} from "./housing";

describe("housing layout", () => {
  it("provides a non-overlapping starter room inside the 8x6 grid", () => {
    const result = validateHousingState(defaultHousingState());
    expect(result).toEqual({
      ok: true,
      state: defaultHousingState(),
    });
    expect(DEFAULT_HOUSING_LAYOUT).toHaveLength(7);
  });

  it("swaps furniture dimensions when rotated", () => {
    expect(
      housingPlacementSize({ furnitureId: "equipment_mannequin", rotated: false }),
    ).toEqual({ width: 1, height: 2 });
    expect(
      housingPlacementSize({ furnitureId: "equipment_mannequin", rotated: true }),
    ).toEqual({ width: 2, height: 1 });
  });

  it("rejects overlap, out-of-bounds placement and excess owned counts", () => {
    const base = defaultHousingState();
    expect(
      validateHousingState({
        ...base,
        layout: [
          { uid: "a", furnitureId: "traveler_bed", x: 0, y: 0, rotated: false },
          { uid: "b", furnitureId: "oak_desk", x: 1, y: 1, rotated: false },
        ],
      }),
    ).toEqual({ ok: false, error: "items_overlap" });
    expect(
      validateHousingState({
        ...base,
        layout: [
          { uid: "a", furnitureId: "traveler_bed", x: 7, y: 5, rotated: false },
        ],
      }),
    ).toEqual({ ok: false, error: "invalid_placement" });
    expect(
      validateHousingState({
        ...base,
        layout: [
          { uid: "a", furnitureId: "oak_desk", x: 0, y: 0, rotated: false },
          { uid: "b", furnitureId: "oak_desk", x: 3, y: 0, rotated: false },
        ],
      }),
    ).toEqual({ ok: false, error: "furniture_not_owned" });
  });

  it("validates display kind and current ownership", () => {
    const room = {
      version: 1,
      isPublic: true,
      layout: [
        {
          uid: "display-1",
          furnitureId: "equipment_mannequin",
          x: 0,
          y: 0,
          rotated: false,
          display: { kind: "equipment", iid: "eq-owned" },
        },
      ],
    };
    expect(
      validateHousingState(room, { equipmentIids: new Set(["eq-owned"]) }),
    ).toMatchObject({ ok: true });
    expect(
      validateHousingState(room, { equipmentIids: new Set() }),
    ).toEqual({ ok: false, error: "display_not_owned" });
    expect(
      validateHousingState(
        {
          ...room,
          layout: [
            {
              ...room.layout[0],
              display: { kind: "boss", bossId: "mountain_chief" },
            },
          ],
        },
        { bossIds: new Set(["mountain_chief"]) },
      ),
    ).toEqual({ ok: false, error: "invalid_display" });
  });

  it("recovers valid placements from a damaged saved room", () => {
    const parsed = parseHousingState({
      isPublic: false,
      layout: [
        { uid: "ok", furnitureId: "herb_planter", x: 0, y: 0, rotated: false },
        { uid: "overlap", furnitureId: "herb_planter", x: 0, y: 0, rotated: false },
        { uid: "outside", furnitureId: "traveler_bed", x: 9, y: 9, rotated: false },
      ],
    });
    expect(parsed).toEqual({
      version: 1,
      isPublic: false,
      layout: [
        { uid: "ok", furnitureId: "herb_planter", x: 0, y: 0, rotated: false },
      ],
    });
  });

  it("stores an earned mastery trophy beside an existing display", () => {
    const room = {
      version: 1,
      isPublic: true,
      layout: [
        {
          uid: "aquarium",
          furnitureId: "trophy_aquarium",
          x: 0,
          y: 0,
          rotated: false,
          display: { kind: "fish", fishId: "crucian_carp" },
          masteryTrophy: { trophyId: "mastery:fish" },
        },
      ],
    };

    expect(validateHousingState(room, {
      fishIds: new Set(["crucian_carp"]),
      masteryTrophyIds: new Set(["mastery:fish"]),
    })).toEqual({ ok: true, state: room });
  });

  it("rejects a mastery trophy on an unrelated furnishing", () => {
    expect(validateHousingState({
      version: 1,
      isPublic: true,
      layout: [
        {
          uid: "aquarium",
          furnitureId: "trophy_aquarium",
          x: 0,
          y: 0,
          rotated: false,
          masteryTrophy: { trophyId: "mastery:overall" },
        },
      ],
    }, {
      masteryTrophyIds: new Set(["mastery:overall"]),
    })).toEqual({ ok: false, error: "invalid_mastery_trophy" });
  });

  it("rejects an unearned mastery trophy", () => {
    expect(validateHousingState({
      version: 1,
      isPublic: true,
      layout: [
        {
          uid: "shelf",
          furnitureId: "record_shelf",
          x: 0,
          y: 0,
          rotated: false,
          masteryTrophy: { trophyId: "mastery:overall" },
        },
      ],
    }, {
      masteryTrophyIds: new Set(),
    })).toEqual({ ok: false, error: "mastery_trophy_not_owned" });
  });

  it("recovers only known and furnishing-compatible mastery trophy references", () => {
    const parsed = parseHousingState({
      version: 1,
      isPublic: true,
      layout: [
        {
          uid: "shelf",
          furnitureId: "record_shelf",
          x: 0,
          y: 0,
          rotated: false,
          masteryTrophy: { trophyId: "mastery:overall" },
        },
        {
          uid: "aquarium",
          furnitureId: "trophy_aquarium",
          x: 3,
          y: 0,
          rotated: false,
          masteryTrophy: { trophyId: "mastery:monster" },
        },
        {
          uid: "unknown",
          furnitureId: "herb_planter",
          x: 5,
          y: 0,
          rotated: false,
          masteryTrophy: { trophyId: "mastery:not-real" },
        },
      ],
    });

    expect(parsed.layout[0]).toMatchObject({
      masteryTrophy: { trophyId: "mastery:overall" },
    });
    expect(parsed.layout[1]).not.toHaveProperty("masteryTrophy");
    expect(parsed.layout[2]).not.toHaveProperty("masteryTrophy");
  });

  it("matches each display furnishing to its mastery category", () => {
    expect(housingMasteryTrophyIsEligible("record_shelf", "overall")).toBe(true);
    expect(housingMasteryTrophyIsEligible("trophy_aquarium", "fish")).toBe(true);
    expect(housingMasteryTrophyIsEligible("trophy_aquarium", "monster")).toBe(false);
    expect(housingMasteryTrophyIsEligible("boss_trophy", "monster")).toBe(true);
    expect(housingMasteryTrophyIsEligible("equipment_mannequin", "equipment")).toBe(true);
    expect(housingMasteryTrophyIsEligible("weapon_rack", "equipment")).toBe(true);
    expect(housingMasteryTrophyIsEligible("cookware_display", "cooking")).toBe(true);
    expect(housingMasteryTrophyIsEligible("traveler_bed", "overall")).toBe(false);
  });

  it("hides trophy companions without losing same-placement stored selections", () => {
    const stored = parseHousingState({
      version: 1,
      isPublic: true,
      layout: [{
        uid: "shelf",
        furnitureId: "record_shelf",
        x: 0,
        y: 0,
        rotated: false,
        masteryTrophy: { trophyId: "mastery:overall" },
      }],
    });
    const hidden = stripHousingMasteryTrophies(stored);
    hidden.layout[0].x = 2;

    expect(hidden.layout[0]).not.toHaveProperty("masteryTrophy");
    expect(restoreHousingMasteryTrophies(stored, hidden).layout[0]).toMatchObject({
      x: 2,
      masteryTrophy: { trophyId: "mastery:overall" },
    });
    expect(restoreHousingMasteryTrophies(stored, {
      ...hidden,
      layout: [],
    }).layout).toEqual([]);
  });

  it("recovers crafted display furniture using authoritative owned counts", () => {
    const room = {
      version: 1,
      isPublic: true,
      layout: [{
        uid: "cookware",
        furnitureId: "cookware_display",
        x: 0,
        y: 0,
        rotated: false,
        masteryTrophy: { trophyId: "mastery:cooking" },
      }],
    };

    expect(parseHousingState(room, { cookware_display: 1 })).toEqual(room);
    expect(parseHousingState(room).layout).toEqual([]);
  });
});
