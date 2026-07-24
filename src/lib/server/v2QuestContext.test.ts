import { describe, expect, it } from "vitest";
import { buildQuestCtx, type QuestExtras } from "./v2QuestContext";

const EXTRAS: QuestExtras = {
  hasGuild: true,
  hasTraded: false,
  arenaPlayed: false,
  arenaWins: 0,
  guildDiningMeals: 10,
  guildTrainingDrills: 20,
  guildExpeditions: 5,
  guildWorkshopDeliveries: 7,
  guildAlchemyCrafts: 3,
  guildTradeContracts: 2,
  claimAttempted: false,
  hasOutpost: false,
  siegeWins: 0,
  fishSpecies: 0,
  siegeAttempts: 0,
  fishCaught: 0,
  arenaTimes: [],
};

describe("buildQuestCtx 신규 콘텐츠 누적 신호", () => {
  it("요리 XP·발견 목록과 길드 활동 누적을 업적 컨텍스트로 변환한다", () => {
    const ctx = buildQuestCtx({
      charRaw: {},
      proficiencyRaw: {},
      advLogRaw: {},
      equipmentRaw: {},
      skillsRaw: {},
      craftingRaw: {},
      cookingRaw: {
        xp: 810,
        discoveredRecipeIds: ["rustic_bread", "herb_tea", "rustic_bread"],
      },
      extras: EXTRAS,
    });

    expect(ctx.cookingLevel).toBe(10);
    expect(ctx.cookingRecipesDiscovered).toBe(2);
    expect(ctx).toMatchObject({
      guildDiningMeals: 10,
      guildTrainingDrills: 20,
      guildExpeditions: 5,
      guildWorkshopDeliveries: 7,
      guildAlchemyCrafts: 3,
      guildTradeContracts: 2,
    });
  });

  it("손상된 요리 값은 신규 상태처럼 안전하게 처리한다", () => {
    const ctx = buildQuestCtx({
      charRaw: {},
      proficiencyRaw: {},
      advLogRaw: {},
      equipmentRaw: {},
      skillsRaw: {},
      craftingRaw: {},
      cookingRaw: { xp: -100, discoveredRecipeIds: [null, "", 3] },
      extras: { ...EXTRAS, hasGuild: false },
    });

    expect(ctx.cookingLevel).toBe(1);
    expect(ctx.cookingRecipesDiscovered).toBe(0);
  });
});
