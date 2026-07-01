import { describe, expect, it } from "vitest";
import { COOP_BOSS_KIND_IDS, COOP_TIER_ORDER } from "./coopBosses";
import {
  COOP_BOSS_MATERIAL,
  COOP_COIN_MATERIAL_ID,
  COOP_EQUIPMENT_BOX,
  COOP_EQUIPMENT_BOX_ID,
  COOP_EXTRA_REWARD_RULES,
  COOP_REWARD_MATERIALS,
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

  it("rollCoopExtraRewards — 확정 보상 + 상자 확률 경계", () => {
    const noBox = rollCoopExtraRewards("mountain_chief", "silver", () => 0.99);
    expect(noBox.coin).toBe(COOP_EXTRA_REWARD_RULES.silver.coin);
    expect(noBox.bossMaterialId).toBe(COOP_BOSS_MATERIAL.mountain_chief.id);
    expect(noBox.equipmentBoxId).toBeNull();

    const gotBox = rollCoopExtraRewards("mountain_chief", "silver", () => 0);
    expect(gotBox.equipmentBoxId).toBe(COOP_EQUIPMENT_BOX.mountain_chief.id);
  });

  it("rollCoopEquipmentBoxItem — 상자 티어 범위의 정규 장비만 반환", () => {
    for (const boss of COOP_BOSS_KIND_IDS) {
      const got = rollCoopEquipmentBoxItem(boss, () => 0);
      expect(got).toBeTruthy();
      const item = V2_EQUIPMENT[got!];
      expect(item.tier).toBeLessThanOrEqual(
        Math.max(...COOP_EQUIPMENT_BOX[boss].tiers),
      );
      expect(isUnique(item)).toBe(false);
      expect(item.craftOnly).not.toBe(true);
      expect(item.starterOnly).not.toBe(true);
      expect(item.noDrop).not.toBe(true);
    }
  });
});
