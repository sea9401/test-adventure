import { describe, expect, it } from "vitest";
import { GUILD_WORKSHOP_RECIPES } from "./guildWorkshop";
import { V2_EQUIPMENT } from "./v2Equipment";
import {
  equipRollPercentiles,
  rollQualityPct,
  rollItemStats,
} from "./v2EquipVariance";
import {
  applyBlacksmithCraftControl,
  blacksmithWeightedPercentileBudget,
  blacksmithSpecialtyForSlot,
  blacksmithTechniqueView,
  parseBlacksmithProgressionState,
  rollBlacksmithCatalystPreserved,
  rollBlacksmithInspectionCandidates,
} from "./blacksmithSpecialization";

function sequenceRng(values: number[]) {
  let index = 0;
  return () => values[index++] ?? 0.5;
}

describe("blacksmith specialization progression", () => {
  it("parses valid permanent state and drops malformed values", () => {
    expect(
      parseBlacksmithProgressionState({
        specialty: "weapon",
        signatureIid: "eq_signature",
      }),
    ).toEqual({ specialty: "weapon", signatureIid: "eq_signature" });
    expect(
      parseBlacksmithProgressionState({
        specialty: "invalid",
        signatureIid: "",
      }),
    ).toEqual({});
  });

  it("maps every equipment slot to exactly one specialty", () => {
    expect(blacksmithSpecialtyForSlot("weapon")).toBe("weapon");
    expect(blacksmithSpecialtyForSlot("armor")).toBe("armor");
    expect(blacksmithSpecialtyForSlot("gloves")).toBe("armor");
    expect(blacksmithSpecialtyForSlot("boots")).toBe("armor");
    expect(blacksmithSpecialtyForSlot("ring")).toBe("jewelry");
    expect(blacksmithSpecialtyForSlot("necklace")).toBe("jewelry");
  });

  it("exposes only level-unlocked techniques for a matching specialty item", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.storm_gale_bow;
    const item = V2_EQUIPMENT[recipe.equipmentId];

    expect(
      blacksmithTechniqueView({ level: 14, specialty: "weapon", item }),
    ).toMatchObject({ eligible: true, optionFocuses: [], structures: [] });
    expect(
      blacksmithTechniqueView({ level: 24, specialty: "weapon", item }),
    ).toMatchObject({
      eligible: true,
      focusChancePct: 75,
      catalystFocusChancePct: 90,
      catalystPreserveChancePct: 20,
    });
    expect(
      blacksmithTechniqueView({
        level: 24,
        specialty: "weapon",
        item,
      }).structures.map((entry) => entry.id),
    ).toEqual(["balanced", "primary", "option", "extreme", "stable"]);
  });

  it("does not expose techniques for another specialty or an unusable focus", () => {
    const weapon = V2_EQUIPMENT[GUILD_WORKSHOP_RECIPES.storm_gale_bow.equipmentId];
    const necklace =
      V2_EQUIPMENT[GUILD_WORKSHOP_RECIPES.crafted_aether_necklace.equipmentId];

    expect(
      blacksmithTechniqueView({ level: 30, specialty: "armor", item: weapon }),
    ).toMatchObject({ eligible: false, optionFocuses: [], structures: [] });
    expect(
      blacksmithTechniqueView({
        level: 30,
        specialty: "jewelry",
        item: necklace,
      })
        .optionFocuses.map((entry) => entry.id),
    ).toEqual(["jewelry_survival", "jewelry_recovery"]);
  });

  it("특수 제작 장비의 실제 옵션에 맞는 성향 선택지를 빠짐없이 제공한다", () => {
    const cases = [
      ["crafted_oathblade", "weapon", "weapon_guard"],
      ["crafted_spark_gloves", "armor", "armor_offense"],
      ["crafted_combo_boots", "armor", "armor_mobility"],
      ["crafted_oblivion_ring", "jewelry", "jewelry_survival"],
    ] as const;

    for (const [recipeId, specialty, expectedFocus] of cases) {
      const recipe = GUILD_WORKSHOP_RECIPES[recipeId];
      const item = V2_EQUIPMENT[recipe.equipmentId];
      expect(
        blacksmithTechniqueView({ level: 30, specialty, item })
          .optionFocuses.map((focus) => focus.id),
        item.name,
      ).toContain(expectedFocus);
    }
  });

  it("조정 가능한 보조 옵션이 없는 장비에는 무효한 성향을 만들지 않는다", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_venom_injector;
    const item = V2_EQUIPMENT[recipe.equipmentId];

    expect(
      blacksmithTechniqueView({ level: 30, specialty: "weapon", item })
        .optionFocuses,
    ).toEqual([]);
  });
});

describe("blacksmith controlled rolls", () => {
  const item = V2_EQUIPMENT[GUILD_WORKSHOP_RECIPES.storm_gale_bow.equipmentId];

  it("puts the highest existing secondary percentile into the selected focus on success", () => {
    const baseRoll = rollItemStats(
      item,
      sequenceRng([0.5, 0.95, 0.75, 0.55, 0.05]),
    );
    const before = equipRollPercentiles(item, baseRoll);
    const result = applyBlacksmithCraftControl(
      item,
      baseRoll,
      {
        optionFocus: "weapon_precision",
        structure: "balanced",
        useCatalyst: false,
      },
      () => 0.7499,
    );

    expect(result.focusApplied).toBe(true);
    expect(result.percentiles.options?.accuracy).toBe(
      Math.max(...Object.values(before.options ?? {}).map(Number)),
    );
    expect(
      blacksmithWeightedPercentileBudget(item, result.percentiles),
    ).toBeCloseTo(blacksmithWeightedPercentileBudget(item, before), 8);
    expect(Object.keys(result.roll.options ?? {}).sort()).toEqual(
      Object.keys(item.options ?? {}).sort(),
    );
  });

  it("보조 옵션이 한 성향뿐이면 기본 성능과 재배분해 성향을 실제 적용한다", () => {
    const boots = V2_EQUIPMENT[
      GUILD_WORKSHOP_RECIPES.crafted_combo_boots.equipmentId
    ];
    const baseRoll = rollItemStats(
      boots,
      sequenceRng([0.9, 0.1, 0.2]),
    );
    const before = equipRollPercentiles(boots, baseRoll);
    const result = applyBlacksmithCraftControl(
      boots,
      baseRoll,
      {
        optionFocus: "armor_mobility",
        structure: "balanced",
        useCatalyst: false,
      },
      () => 0,
    );

    expect(result.focusApplied).toBe(true);
    expect(result.percentiles).not.toEqual(before);
    expect(result.percentiles.options?.eva).toBeGreaterThanOrEqual(
      result.percentiles.power,
    );
    expect(
      blacksmithWeightedPercentileBudget(boots, result.percentiles),
    ).toBeCloseTo(blacksmithWeightedPercentileBudget(boots, before), 8);
  });

  it("uses 75% normally and 90% with a catalyst", () => {
    const baseRoll = rollItemStats(
      item,
      sequenceRng([0.5, 0.95, 0.75, 0.55, 0.05]),
    );
    const normal = applyBlacksmithCraftControl(
      item,
      baseRoll,
      {
        optionFocus: "weapon_precision",
        structure: "balanced",
        useCatalyst: false,
      },
      () => 0.8,
    );
    const catalyst = applyBlacksmithCraftControl(
      item,
      baseRoll,
      {
        optionFocus: "weapon_precision",
        structure: "balanced",
        useCatalyst: true,
      },
      () => 0.8,
    );

    expect(normal.focusApplied).toBe(false);
    expect(catalyst.focusApplied).toBe(true);
    expect(catalyst.percentiles.options?.accuracy).toBeGreaterThanOrEqual(0.35);
  });

  it.each([
    ["primary", "power", "up"],
    ["option", "accuracy", "up"],
    ["stable", "spread", "down"],
    ["extreme", "spread", "up"],
  ] as const)("applies %s without changing the weighted budget", (structure, metric, direction) => {
    const baseRoll = rollItemStats(
      item,
      sequenceRng([0.2, 0.9, 0.7, 0.1, 0.3]),
    );
    const before = equipRollPercentiles(item, baseRoll);
    const result = applyBlacksmithCraftControl(
      item,
      baseRoll,
      {
        optionFocus: "weapon_precision",
        structure,
        useCatalyst: false,
      },
      () => 0,
    );

    expect(
      blacksmithWeightedPercentileBudget(item, result.percentiles),
    ).toBeCloseTo(blacksmithWeightedPercentileBudget(item, before), 8);
    if (metric === "power") {
      expect(result.percentiles.power).toBeGreaterThan(before.power);
    } else if (metric === "accuracy") {
      expect(result.percentiles.options?.accuracy).toBeGreaterThan(
        before.options?.accuracy ?? 0,
      );
    } else {
      const beforeSpread = Math.max(
        ...[before.power, ...Object.values(before.options ?? {}).map(Number)].map(
          (value) => Math.abs(value - 0.5),
        ),
      );
      const afterSpread = Math.max(
        ...[
          result.percentiles.power,
          ...Object.values(result.percentiles.options ?? {}).map(Number),
        ].map((value) => Math.abs(value - 0.5)),
      );
      if (direction === "up") expect(afterSpread).toBeGreaterThan(beforeSpread);
      else expect(afterSpread).toBeLessThan(beforeSpread);
    }
  });

  it("주력과 옵션을 재배분해도 전투 기여 기반 품질을 보존한다", () => {
    const baseRoll = rollItemStats(
      item,
      sequenceRng([0.2, 0.9, 0.7, 0.1, 0.3]),
    );
    const beforeQuality = rollQualityPct(item, baseRoll);
    const result = applyBlacksmithCraftControl(
      item,
      baseRoll,
      {
        optionFocus: "weapon_precision",
        structure: "primary",
        useCatalyst: false,
      },
      () => 0,
    );

    expect(rollQualityPct(item, result.roll)).toBe(beforeQuality);
  });

  it("preserves catalysts only from level 24 at the 20% boundary", () => {
    expect(rollBlacksmithCatalystPreserved(23, () => 0)).toBe(false);
    expect(rollBlacksmithCatalystPreserved(24, () => 0.1999)).toBe(true);
    expect(rollBlacksmithCatalystPreserved(24, () => 0.2)).toBe(false);
  });

  it("creates two distinct final-inspection rolls with one shared budget", () => {
    const candidates = rollBlacksmithInspectionCandidates(
      item,
      {
        optionFocus: "weapon_offense",
        structure: "extreme",
        useCatalyst: true,
      },
      sequenceRng([
        0.1, 0.9, 0.2, 0.8, 0.3,
        0.9, 0.1, 0.8, 0.2, 0.7,
        0.2, 0.3,
      ]),
    );

    expect(
      blacksmithWeightedPercentileBudget(item, candidates[0].percentiles),
    ).toBeCloseTo(
      blacksmithWeightedPercentileBudget(item, candidates[1].percentiles),
      8,
    );
    expect(candidates[0].roll).not.toEqual(candidates[1].roll);
  });

  it("keeps final-inspection choices distinct even when the random source repeats", () => {
    const candidates = rollBlacksmithInspectionCandidates(
      item,
      { structure: "balanced", useCatalyst: false },
      () => 0.5,
    );

    expect(
      blacksmithWeightedPercentileBudget(item, candidates[0].percentiles),
    ).toBeCloseTo(
      blacksmithWeightedPercentileBudget(item, candidates[1].percentiles),
      8,
    );
    expect(candidates[0].roll).not.toEqual(candidates[1].roll);
  });
});
