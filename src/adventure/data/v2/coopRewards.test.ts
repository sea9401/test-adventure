import { describe, expect, it } from "vitest";
import { COOP_BOSS_KIND_IDS, COOP_TIER_ORDER } from "./coopBosses";
import {
  COOP_BOSS_MATERIAL,
  COOP_COIN_MATERIAL_ID,
  COOP_KILLING_BLOW_HARD_COIN,
  COOP_KILLING_BLOW_MATERIAL_COUNT,
  COOP_KILLING_BLOW_NORMAL_COIN,
  COOP_EQUIPMENT_BOX,
  COOP_EQUIPMENT_BOX_ID,
  COOP_EXTRA_REWARD_RULES,
  COOP_HARD_EXTRA_REWARD_RULES,
  COOP_MASTERY_TOME_GAIN,
  COOP_MASTERY_TOME_MATERIAL_ID,
  COOP_REWARD_MATERIALS,
  COOP_TIER5_EQUIPMENT_BOX,
  coopEquipmentBoxById,
  coopExtraRewardRuleFor,
  parseCoopEquipmentBoxId,
  rollCoopEquipmentBoxDefItem,
  rollCoopEquipmentBoxItem,
  rollCoopExtraRewards,
  coopKillingBlowReward,
} from "./coopRewards";
import { V2_EQUIPMENT, isUnique } from "./v2Equipment";

describe("coopRewards", () => {
  it("협동 주화/보스 재료/장비 상자 카탈로그를 모두 정의", () => {
    expect(COOP_REWARD_MATERIALS[COOP_COIN_MATERIAL_ID]).toBeDefined();
    for (const boss of COOP_BOSS_KIND_IDS) {
      expect(COOP_REWARD_MATERIALS[COOP_BOSS_MATERIAL[boss].id]).toBeDefined();
      expect(COOP_REWARD_MATERIALS[COOP_EQUIPMENT_BOX[boss].id]).toBeDefined();
      expect(parseCoopEquipmentBoxId(COOP_EQUIPMENT_BOX_ID[boss])).toBe(boss);
    }
    expect(COOP_REWARD_MATERIALS[COOP_MASTERY_TOME_MATERIAL_ID]).toMatchObject({
      name: "상급 숙련 교본",
    });
    expect(COOP_MASTERY_TOME_GAIN).toBeGreaterThanOrEqual(50);
    expect(parseCoopEquipmentBoxId("nope")).toBeNull();
    expect(COOP_REWARD_MATERIALS[COOP_TIER5_EQUIPMENT_BOX.id]).toBeDefined();
    expect(coopEquipmentBoxById(COOP_TIER5_EQUIPMENT_BOX.id)).toBe(
      COOP_TIER5_EQUIPMENT_BOX,
    );
  });

  it("처치 확정타 보상은 일반/하드 주화를 구분하고 보스 재료를 확정 지급한다", () => {
    expect(coopKillingBlowReward("mountain_chief")).toEqual({
      coin: COOP_KILLING_BLOW_NORMAL_COIN,
      bossMaterialId: COOP_BOSS_MATERIAL.mountain_chief.id,
      bossMaterialName: COOP_BOSS_MATERIAL.mountain_chief.name,
      bossMaterialCount: COOP_KILLING_BLOW_MATERIAL_COUNT,
    });
    expect(coopKillingBlowReward("abyssal_tyrant")).toMatchObject({
      coin: COOP_KILLING_BLOW_HARD_COIN,
      bossMaterialId: COOP_BOSS_MATERIAL.abyssal_tyrant.id,
      bossMaterialCount: COOP_KILLING_BLOW_MATERIAL_COUNT,
    });
  });

  it("공용 5T 상자는 산군·어룡 5T 장비 풀을 합쳐서 굴린다", () => {
    const itemIds = COOP_TIER5_EQUIPMENT_BOX.itemIds ?? [];
    expect(itemIds).toHaveLength(9);
    expect(itemIds).toEqual(
      expect.arrayContaining([
        ...(COOP_EQUIPMENT_BOX.mountain_chief_hard.itemIds ?? []),
        ...(COOP_EQUIPMENT_BOX.abyssal_tyrant.itemIds ?? []),
      ]),
    );
    expect(rollCoopEquipmentBoxDefItem(COOP_TIER5_EQUIPMENT_BOX, () => 0)).toBe(
      itemIds[0],
    );
    expect(rollCoopEquipmentBoxDefItem(COOP_TIER5_EQUIPMENT_BOX, () => 0.999)).toBe(
      itemIds.at(-1),
    );
  });

  it("티어별 확정 보상은 단조 증가하고 상자는 SILVER부터 확률", () => {
    let prevCoin = 0;
    let prevMat = 0;
    for (const tier of COOP_TIER_ORDER) {
      const rule = COOP_EXTRA_REWARD_RULES[tier];
      expect(rule.coin).toBeGreaterThan(prevCoin);
      expect(rule.bossMaterial).toBeGreaterThanOrEqual(prevMat);
      expect(rule.equipmentBoxChance).toBeGreaterThanOrEqual(0);
      expect(rule.equipmentBoxChance).toBeLessThanOrEqual(1);
      prevCoin = rule.coin;
      prevMat = rule.bossMaterial;
    }
    expect(COOP_EXTRA_REWARD_RULES.bronze.equipmentBoxChance).toBe(0);
    expect(COOP_EXTRA_REWARD_RULES.silver.equipmentBoxChance).toBeGreaterThan(0);
  });

  it("하드 산군 보상은 흔적 중심 + GOLD 이상 상자", () => {
    expect(COOP_BOSS_MATERIAL.mountain_chief_hard.name).toBe("산군의 흔적");
    expect(COOP_EQUIPMENT_BOX.mountain_chief_hard).toMatchObject({
      name: "흉포한 산군 5T 장비 상자",
      displayTier: 5,
      catalogTiers: [13],
    });
    expect(COOP_HARD_EXTRA_REWARD_RULES.bronze.bossMaterial).toBe(1);
    expect(COOP_HARD_EXTRA_REWARD_RULES.silver.bossMaterial).toBe(2);
    expect(COOP_HARD_EXTRA_REWARD_RULES.gold.bossMaterial).toBe(4);
    expect(COOP_HARD_EXTRA_REWARD_RULES.epic.bossMaterial).toBe(7);
    expect(COOP_HARD_EXTRA_REWARD_RULES.legend.bossMaterial).toBe(12);
    expect(
      coopExtraRewardRuleFor("mountain_chief_hard", "silver")
        .equipmentBoxChance,
    ).toBe(0);
    expect(
      coopExtraRewardRuleFor("mountain_chief_hard", "gold")
        .equipmentBoxChance,
    ).toBe(0.1);
    expect(
      coopExtraRewardRuleFor("mountain_chief_hard", "legend")
        .equipmentBoxChance,
    ).toBe(1);
    expect(COOP_BOSS_MATERIAL.abyssal_tyrant.name).toBe("심연어룡의 비늘");
    expect(COOP_EQUIPMENT_BOX.abyssal_tyrant).toMatchObject({
      name: "심연어룡 5T 장비 상자",
      displayTier: 5,
      catalogTiers: [13],
    });
    expect(coopExtraRewardRuleFor("abyssal_tyrant", "silver").equipmentBoxChance)
      .toBe(0);
    expect(coopExtraRewardRuleFor("abyssal_tyrant", "legend").equipmentBoxChance)
      .toBe(1);
  });

  it("신규 HARD 6T 보스는 산군과 같은 주화·재료·상자 확률과 전용 3종 상자를 사용한다", () => {
    expect(COOP_BOSS_MATERIAL.canyon_predator_hard.name).toBe("재앙의 꼬리침");
    expect(COOP_BOSS_MATERIAL.lake_sovereign_hard.name).toBe("혹한의 심핵");
    expect(COOP_EQUIPMENT_BOX.canyon_predator_hard).toMatchObject({
      name: "재앙의 스콜피온 킹 6T 장비 상자",
      displayTier: 6,
      catalogTiers: [16],
      itemIds: [
        "v2_boss_catastrophe_gloves",
        "v2_boss_catastrophe_boots",
        "v2_boss_catastrophe_ring",
      ],
    });
    expect(COOP_EQUIPMENT_BOX.lake_sovereign_hard).toMatchObject({
      name: "혹한의 호수 괴물 6T 장비 상자",
      displayTier: 6,
      catalogTiers: [16],
      itemIds: [
        "v2_boss_frozen_lake_armor",
        "v2_boss_frozen_lake_boots",
        "v2_boss_frozen_lake_necklace",
      ],
    });
    for (const boss of ["canyon_predator_hard", "lake_sovereign_hard"] as const) {
      expect(coopExtraRewardRuleFor(boss, "bronze")).toEqual(
        COOP_HARD_EXTRA_REWARD_RULES.bronze,
      );
      expect(coopExtraRewardRuleFor(boss, "legend")).toEqual(
        COOP_HARD_EXTRA_REWARD_RULES.legend,
      );
      expect(coopKillingBlowReward(boss).coin).toBe(COOP_KILLING_BLOW_HARD_COIN);
    }
  });

  it("rollCoopExtraRewards — 확정 보상 + 상자 확률 경계", () => {
    const noBox = rollCoopExtraRewards("mountain_chief", "silver", () => 0.99);
    expect(noBox.coin).toBe(COOP_EXTRA_REWARD_RULES.silver.coin);
    expect(noBox.bossMaterialId).toBe(COOP_BOSS_MATERIAL.mountain_chief.id);
    expect(noBox.equipmentBoxId).toBeNull();

    const gotBox = rollCoopExtraRewards("mountain_chief", "silver", () => 0);
    expect(gotBox.equipmentBoxId).toBe(COOP_EQUIPMENT_BOX.mountain_chief.id);

    const hardNoBox = rollCoopExtraRewards(
      "mountain_chief_hard",
      "silver",
      () => 0,
    );
    expect(hardNoBox.equipmentBoxId).toBeNull();
    expect(hardNoBox.bossMaterialName).toBe("산군의 흔적");

    const hardLegend = rollCoopExtraRewards(
      "mountain_chief_hard",
      "legend",
      () => 0.99,
    );
    expect(hardLegend.equipmentBoxId).toBe(
      COOP_EQUIPMENT_BOX.mountain_chief_hard.id,
    );
  });

  it("rollCoopEquipmentBoxItem — 상자 티어 범위의 정규 장비만 반환", () => {
    for (const boss of COOP_BOSS_KIND_IDS) {
      const got = rollCoopEquipmentBoxItem(boss, () => 0);
      expect(got).toBeTruthy();
      const item = V2_EQUIPMENT[got!];
      if (
        boss === "mountain_chief_hard" ||
        boss === "abyssal_tyrant" ||
        boss === "canyon_predator_hard" ||
        boss === "lake_sovereign_hard"
      ) {
        expect(item.tier).toBe(
          boss === "canyon_predator_hard" || boss === "lake_sovereign_hard"
            ? 16
            : 13,
        );
        expect(item.setTags).toContain(
          boss === "abyssal_tyrant"
            ? "abyssal_current"
            : boss === "canyon_predator_hard"
              ? "catastrophe_venom"
              : boss === "lake_sovereign_hard"
                ? "frozen_lake_guard"
                : "hard_sangoon",
        );
        expect(COOP_EQUIPMENT_BOX[boss].itemIds).toContain(got);
        continue;
      }
      const catalogTiers = COOP_EQUIPMENT_BOX[boss].catalogTiers;
      expect(catalogTiers).toContain(item.tier);
      expect(isUnique(item)).toBe(false);
      expect(item.craftOnly).not.toBe(true);
      expect(item.starterOnly).not.toBe(true);
    }
  });

  it("rollCoopEquipmentBoxItem — 2/3/4티어 상자는 낮은 티어로 fallback 하지 않는다", () => {
    for (const boss of [
      "canyon_predator",
      "lake_sovereign",
      "void_priest",
    ] as const) {
      const catalogTiers = COOP_EQUIPMENT_BOX[boss].catalogTiers;
      for (const point of [0, 0.25, 0.5, 0.75, 0.999]) {
        const got = rollCoopEquipmentBoxItem(boss, () => point);
        expect(got).toBeTruthy();
        expect(catalogTiers).toContain(V2_EQUIPMENT[got!].tier);
      }
    }
  });
});
