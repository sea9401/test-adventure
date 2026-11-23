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
  enchantGoldSpent: 450_000_000,
  fishSpecies: 0,
  fishCaught: 0,
  arenaTimes: [],
  referralCount: 57,
};

describe("buildQuestCtx 성장 패스 신호", () => {
  const DAY = 24 * 60 * 60 * 1_000;
  const NOW = Date.UTC(2026, 10, 23);
  const build = (proficiencyRaw: unknown, accountCreatedAt: number | null = null) =>
    buildQuestCtx({
      charRaw: { class: "warrior" },
      proficiencyRaw,
      advLogRaw: {},
      equipmentRaw: {},
      skillsRaw: {},
      craftingRaw: {},
      extras: { ...EXTRAS, accountCreatedAt },
      now: NOW,
    });

  it("지금 직업이 낮아도 전직해 본 최고 차수와 차수별 최고 숙련도를 전달한다", () => {
    const ctx = build({
      masteryScaleVersion: 2,
      jobHistory: ["warrior", "confessor", "atonementbishop"],
      jobCumLevel: { warrior: 1_200, confessor: 18_400, atonementbishop: 6_729 },
    });
    expect(ctx.tier).toBe(1);
    expect(ctx.maxJobTier).toBe(5);
    expect(ctx.tierMastery).toMatchObject({ 4: 18_400, 5: 6_729 });
  });

  it("전직 기록이 없는 옛 세이브는 숙련도가 쌓인 직업으로 판정한다", () => {
    const ctx = build({
      masteryScaleVersion: 2,
      jobCumLevel: { confessor: 7_000 },
    });
    expect(ctx.maxJobTier).toBe(4);
    expect(ctx.tierMastery?.[4]).toBe(7_000);
  });

  it("수행 횟수는 모든 직업군을 합치고 토벌한 협동 보스 종류를 전달한다", () => {
    const ctx = buildQuestCtx({
      charRaw: { class: "warrior" },
      proficiencyRaw: {
        masteryScaleVersion: 2,
        groups: {
          warrior: { cultivations: 12, tier: 1, cumLevel: 10 },
          mage: { cultivations: 20, tier: 1, cumLevel: 10 },
        },
      },
      advLogRaw: { coopBossKinds: ["canyon_predator", 7] },
      equipmentRaw: {},
      skillsRaw: {},
      craftingRaw: {},
      extras: EXTRAS,
      now: NOW,
    });
    expect(ctx.cultivations).toBe(12);
    expect(ctx.cultivationsTotal).toBe(32);
    expect(ctx.coopBossKindIds).toEqual(["canyon_predator"]);
  });

  it("기록이 전혀 없으면 지금 직업의 차수를 쓴다", () => {
    const ctx = build({});
    expect(ctx.maxJobTier).toBe(ctx.tier);
  });

  it("가입 30일 안쪽이면 신규 모험가로 본다", () => {
    expect(build({}, NOW - 10 * DAY).newcomer).toBe(true);
    expect(build({}, NOW - 45 * DAY).newcomer).toBe(false);
    expect(build({}, null).newcomer).toBe(false);
  });
});

describe("buildQuestCtx 신규 콘텐츠 누적 신호", () => {
  it("홍보 링크로 합류한 누적 인원을 업적 컨텍스트로 전달한다", () => {
    const ctx = buildQuestCtx({
      charRaw: {},
      proficiencyRaw: {},
      advLogRaw: {},
      equipmentRaw: {},
      skillsRaw: {},
      craftingRaw: {},
      extras: EXTRAS,
    });

    expect(ctx.referralCount).toBe(57);
  });

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
        discoveredRecipeIds: ["tomato_salad", "fresh_fish_soup", "tomato_salad"],
        stats: {
          dishesCooked: 120,
          deliveriesCompleted: 15,
          masterpiecesCooked: 7,
          researchSuccesses: 9,
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
      enchantGoldSpent: 450_000_000,
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
