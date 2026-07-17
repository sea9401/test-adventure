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
      1, 2, 3, 4, 5,
    ]);
    expect(GUILD_ALCHEMY_RECIPES.map((recipe) => recipe.chargeAmount)).toEqual([
      25_000,
      75_000,
      225_000,
      400_000,
      900_000,
    ]);
    expect(guildAlchemyRecipe("missing")).toBeNull();
  });

  it("HP·MP·반반 충전은 총 충전량을 보존한다", () => {
    const recipe = guildAlchemyRecipe("concentrated_solution")!;
    expect(guildAlchemyChargeGain(recipe, "hp", 2)).toEqual({
      hp: 450_000,
      mp: 0,
      total: 450_000,
    });
    expect(guildAlchemyChargeGain(recipe, "mp", 2)).toEqual({
      hp: 0,
      mp: 450_000,
      total: 450_000,
    });
    expect(guildAlchemyChargeGain(recipe, "balanced", 1)).toEqual({
      hp: 112_500,
      mp: 112_500,
      total: 225_000,
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
