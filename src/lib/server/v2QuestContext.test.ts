import { describe, expect, it } from "vitest";
import {
  buildQuestCtx,
  guideQuestSavePayload,
  parseTrackedQuestId,
  type QuestExtras,
} from "./v2QuestContext";
import type { QuestCtx } from "@/adventure/data/v2/v2Quests";

describe("가이드 퀘스트 추적 저장", () => {
  it("추적 id를 안전하게 읽고 해제 시 저장 필드에서 제거한다", () => {
    expect(parseTrackedQuestId({ trackedQuestId: "x_rich" })).toBe("x_rich");
    expect(parseTrackedQuestId({ trackedQuestId: 7 })).toBeNull();
    expect(
      guideQuestSavePayload(new Set(["combat_10"]), "x_rich"),
    ).toEqual({ claimed: ["combat_10"], trackedQuestId: "x_rich" });
    expect(guideQuestSavePayload(new Set(["combat_10"]), null)).toEqual({
      claimed: ["combat_10"],
    });
  });
});

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
  fishSpecies: 0,
  fishCaught: 0,
  arenaTimes: [],
};

describe("buildQuestCtx 신규 콘텐츠 누적 신호", () => {
  it("유니크 장비는 현재 보유량이 아니라 저장된 누적 획득량을 사용한다", () => {
    const ctx = buildQuestCtx({
      charRaw: {},
      proficiencyRaw: {},
      advLogRaw: { uniqueEquipmentAcquired: 28 },
      equipmentRaw: { owned: [], equipped: {} },
      skillsRaw: {},
      craftingRaw: {},
      equipmentCodexRaw: {},
      extras: EXTRAS,
    });

    expect((ctx as QuestCtx & { uniqueAcquired?: number }).uniqueAcquired).toBe(28);
  });

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
        stats: {
          dishesCooked: 120,
          ordersCompleted: 15,
          masterpiecesCooked: 7,
          rareIngredientDishes: 9,
        },
      },
      extras: EXTRAS,
    });

    expect(ctx.cookingLevel).toBe(10);
    expect(ctx.cookingRecipesDiscovered).toBe(2);
    expect(ctx).toMatchObject({
      cookingDishesCooked: 120,
      cookingOrdersCompleted: 15,
      cookingMasterpiecesCooked: 7,
      cookingRareIngredientDishes: 9,
    });
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
    expect(ctx.cookingDishesCooked).toBe(0);
  });

  it("농장 증표 업적은 사용량을 중복 가산하지 않고 누적 획득량만 사용한다", () => {
    const ctx = buildQuestCtx({
      charRaw: {},
      proficiencyRaw: {},
      advLogRaw: {},
      equipmentRaw: {},
      skillsRaw: {},
      craftingRaw: {},
      farmRaw: {
        stats: { reputation: 100, reputationSpent: 40 },
      },
      extras: EXTRAS,
    });

    expect(ctx.farmReputationEarned).toBe(100);
  });

  it("튜토리얼의 수동 장비·장착 후 전투·스킬 로드아웃 행동을 변환한다", () => {
    const ctx = buildQuestCtx({
      charRaw: {
        hasManuallyEquippedGear: true,
        hasBattledAfterEquippingGear: true,
        hasEditedSkillLoadout: true,
      },
      proficiencyRaw: {},
      advLogRaw: {},
      equipmentRaw: {},
      skillsRaw: {},
      craftingRaw: {},
      extras: EXTRAS,
    });

    expect(ctx).toMatchObject({
      hasManuallyEquippedGear: true,
      hasBattledAfterEquippingGear: true,
      hasEditedSkillLoadout: true,
    });
  });

  it("행동 플래그가 없어도 현재 장착한 스킬을 튜토리얼 신호로 변환한다", () => {
    const skillId = "v2_skill_strike";
    const ctx = buildQuestCtx({
      charRaw: {},
      proficiencyRaw: {},
      advLogRaw: {},
      equipmentRaw: {},
      skillsRaw: { learned: [skillId], equipped: [skillId] },
      craftingRaw: {},
      extras: EXTRAS,
    });

    expect(ctx.skillsLearned).toBe(1);
    expect(ctx.skillsEquipped).toBe(1);
    expect(ctx.hasEditedSkillLoadout).toBe(false);
  });
});
