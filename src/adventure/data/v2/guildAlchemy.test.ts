import { describe, expect, it } from "vitest";
import {
  GUILD_ALCHEMY_RECIPES,
  guildAlchemyChargeGain,
  guildAlchemyRecipe,
  parseGuildAlchemyWeeklyState,
} from "./guildAlchemy";

describe("guild alchemy", () => {
  it("시설 레벨에 따라 레시피가 단계적으로 열린다", () => {
    expect(GUILD_ALCHEMY_RECIPES.map((recipe) => recipe.minFacilityLevel)).toEqual([
      1, 2, 2, 3, 3, 3, 4, 4, 5,
    ]);
    expect(GUILD_ALCHEMY_RECIPES.map((recipe) => recipe.chargeAmount)).toEqual([
      100_000,
      300_000,
      0,
      900_000,
      0,
      0,
      1_600_000,
      0,
      3_600_000,
    ]);
    expect(guildAlchemyRecipe("stable_catalyst")).toMatchObject({
      output: "material",
      outputMaterialName: "푸른 강화석",
      outputMaterialAmount: 1,
      energyCost: 8,
    });
    expect(guildAlchemyRecipe("volatile_catalyst")).toMatchObject({
      output: "material",
      outputMaterialName: "붉은 강화석",
      outputMaterialAmount: 1,
      energyCost: 12,
    });
    expect(guildAlchemyRecipe("summoning_ink")).toMatchObject({
      output: "material",
      outputMaterialName: "보스 소환서",
      outputMaterialAmount: 3,
      energyCost: 10,
    });
    expect(guildAlchemyRecipe("vitality_elixir")).toMatchObject({
      output: "stamina_potion",
      staminaPotionAmount: 1,
      energyCost: 20,
    });
    expect(guildAlchemyRecipe("missing")).toBeNull();
  });

  it("HP·MP·반반 충전은 총 충전량을 보존한다", () => {
    const recipe = guildAlchemyRecipe("concentrated_solution")!;
    expect(guildAlchemyChargeGain(recipe, "hp", 2)).toEqual({
      hp: 1_800_000,
      mp: 0,
      total: 1_800_000,
    });
    expect(guildAlchemyChargeGain(recipe, "mp", 2)).toEqual({
      hp: 0,
      mp: 1_800_000,
      total: 1_800_000,
    });
    expect(guildAlchemyChargeGain(recipe, "balanced", 1)).toEqual({
      hp: 450_000,
      mp: 450_000,
      total: 900_000,
    });
    expect(guildAlchemyChargeGain(guildAlchemyRecipe("vitality_elixir")!, "hp", 1)).toEqual({
      hp: 0,
      mp: 0,
      total: 0,
    });
  });

  it("주차가 바뀌면 개인 연성력 사용량을 초기화한다", () => {
    expect(
      parseGuildAlchemyWeeklyState(
        { weekKey: "2026-07-13", energyUsed: 8 },
        "2026-07-13",
      ),
    ).toEqual({ weekKey: "2026-07-13", energyUsed: 8 });
    expect(
      parseGuildAlchemyWeeklyState(
        { weekKey: "2026-07-06", energyUsed: 8 },
        "2026-07-13",
      ),
    ).toEqual({ weekKey: "2026-07-13", energyUsed: 0 });
  });
});
