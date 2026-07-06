import { describe, expect, it } from "vitest";
import { COOP_BOSS_KIND_IDS, COOP_TIER_ORDER } from "./coopBosses";
import {
  COOP_BOSS_MATERIAL,
  COOP_COIN_MATERIAL_ID,
  COOP_EQUIPMENT_BOX,
  COOP_EQUIPMENT_BOX_ID,
  COOP_EXTRA_REWARD_RULES,
  COOP_HARD_EXTRA_REWARD_RULES,
  COOP_MASTERY_TOME_GAIN,
  COOP_MASTERY_TOME_MATERIAL_ID,
  COOP_REWARD_MATERIALS,
  coopExtraRewardRuleFor,
  parseCoopEquipmentBoxId,
  rollCoopEquipmentBoxItem,
  rollCoopExtraRewards,
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
      tiers: [13],
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
      tiers: [13],
    });
    expect(coopExtraRewardRuleFor("abyssal_tyrant", "silver").equipmentBoxChance)
      .toBe(0);
    expect(coopExtraRewardRuleFor("abyssal_tyrant", "legend").equipmentBoxChance)
      .toBe(1);
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
      if (boss === "mountain_chief_hard" || boss === "abyssal_tyrant") {
        expect(item.tier).toBe(13);
        expect(item.setTags).toContain(
          boss === "abyssal_tyrant" ? "abyssal_current" : "hard_sangoon",
        );
        expect(COOP_EQUIPMENT_BOX[boss].itemIds).toContain(got);
        continue;
      }
      const tiers = COOP_EQUIPMENT_BOX[boss].tiers;
      expect(tiers).toContain(item.tier);
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
      const tiers = COOP_EQUIPMENT_BOX[boss].tiers;
      for (const point of [0, 0.25, 0.5, 0.75, 0.999]) {
        const got = rollCoopEquipmentBoxItem(boss, () => point);
        expect(got).toBeTruthy();
        expect(tiers).toContain(V2_EQUIPMENT[got!].tier);
      }
    }
  });
});
