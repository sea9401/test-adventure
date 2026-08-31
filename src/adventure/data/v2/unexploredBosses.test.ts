import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { V2_MATERIALS, materialSellPriceOf } from "./dungeonDrops";
import { V2_EQUIPMENT } from "./v2Equipment";
import {
  UNEXPLORED_BOSS_CORE_MATERIAL,
  UNEXPLORED_BOSS_EQUIPMENT_CRAFT_RECIPES,
  UNEXPLORED_BOSSES,
  UNEXPLORED_BOSS_IDS,
  UNEXPLORED_SUMMON_STONE_GOLD_COST,
  UNEXPLORED_SUMMON_STONE_MATERIALS,
  UNEXPLORED_SUMMON_STONE_SCROLL_COST,
  unexploredBossEquipmentCraftRecipe,
  type UnexploredBossUniqueDrop,
} from "./unexploredBosses";

describe("미개척지 개인 보스 카탈로그", () => {
  it("운영 결정으로 확정한 소환석 골드·소환서 비용을 고정한다", () => {
    expect(UNEXPLORED_SUMMON_STONE_GOLD_COST).toBe(5_000_000);
    expect(UNEXPLORED_SUMMON_STONE_SCROLL_COST).toBe(30);
  });

  it("출시 보스 3종과 연결된 상위 풀 조합을 고정한다", () => {
    expect(UNEXPLORED_BOSS_IDS).toEqual([
      "tracking_weapon",
      "toxic_blood_lord",
      "glacial_colossus",
    ]);
    expect(UNEXPLORED_BOSSES.tracking_weapon.pools).toEqual([
      "runaway_machines",
      "shadow_stalkers",
    ]);
    expect(UNEXPLORED_BOSSES.toxic_blood_lord.pools).toEqual([
      "venom_colony",
      "bloodstained_dead",
    ]);
    expect(UNEXPLORED_BOSSES.glacial_colossus.pools).toEqual([
      "frozen_legion",
      "crushing_colossi",
    ]);
  });

  it("보스마다 거래 가능한 소환석과 독립 고유 3종을 가진다", () => {
    for (const boss of Object.values(UNEXPLORED_BOSSES)) {
      expect(V2_MATERIALS[boss.summonMaterialId]).toEqual(
        UNEXPLORED_SUMMON_STONE_MATERIALS[boss.summonMaterialId],
      );
      expect(materialSellPriceOf(boss.summonMaterialId)).toBeUndefined();
      expect(boss.uniqueDrops.map((drop) => drop.chancePct)).toEqual([
        30, 10, 0.5,
      ]);
      expect(new Set(boss.uniqueDrops.map((drop) => drop.equipmentId)).size).toBe(3);
    }
  });

  it("공용 우두머리 핵은 거래소 재료이며 NPC 판매가는 없다", () => {
    expect(V2_MATERIALS.v2_unexplored_boss_core).toEqual(
      UNEXPLORED_BOSS_CORE_MATERIAL,
    );
    expect(materialSellPriceOf("v2_unexplored_boss_core")).toBeUndefined();
  });

  it("30%·10% 일반 고유 6종만 확정 제작하고 등급별 핵·연결 재료 비용을 적용한다", () => {
    expect(
      UNEXPLORED_BOSS_EQUIPMENT_CRAFT_RECIPES.map(
        (recipe) => recipe.equipmentId,
      ),
    ).toEqual([
      "v2_unexplored_tracking_blade_dagger",
      "v2_unexplored_phantom_acceleration_boots",
      "v2_unexplored_toxic_blood_claw",
      "v2_unexplored_coagulated_venom_ring",
      "v2_unexplored_glacial_crushing_hammer",
      "v2_unexplored_frozen_great_armor",
    ]);

    for (const recipe of UNEXPLORED_BOSS_EQUIPMENT_CRAFT_RECIPES) {
      expect(recipe.equipmentName).toBe(V2_EQUIPMENT[recipe.equipmentId].name);
      expect([
        recipe.bossCoreCost,
        ...recipe.materialCosts.map((cost) => cost.count),
      ]).toEqual(recipe.chancePct === 30 ? [8, 25, 25] : [25, 75, 75]);
    }

    expect(
      unexploredBossEquipmentCraftRecipe(
        "v2_unexplored_infinite_orbit_heart",
      ),
    ).toBeNull();
    expect(
      unexploredBossEquipmentCraftRecipe("v2_unexplored_uncorrupted_heart"),
    ).toBeNull();
    expect(
      unexploredBossEquipmentCraftRecipe(
        "v2_unexplored_absolute_zero_core",
      ),
    ).toBeNull();
  });

  it("고유 장비 9종은 6티어 드랍 전용이며 실제 이미지가 존재한다", () => {
    const drops = Object.values(UNEXPLORED_BOSSES).flatMap(
      (boss): UnexploredBossUniqueDrop[] => [...boss.uniqueDrops],
    );
    const equipmentIds = drops.map((drop) => drop.equipmentId);
    expect(equipmentIds).toHaveLength(9);
    for (const id of equipmentIds) {
      const item = V2_EQUIPMENT[id];
      expect(item).toBeDefined();
      expect(item.name).toBe(
        drops.find((drop) => drop.equipmentId === id)?.equipmentName,
      );
      expect(item.tier).toBe(16);
      expect(item.rarity).toBe("unique");
      expect(item.noDrop).toBe(true);
      expect(item.image).toMatch(/^\/images\/equipment\/unexplored-[a-z0-9-]+\.webp$/);
      expect(existsSync(join(process.cwd(), "public", item.image!.slice(1)))).toBe(true);
    }
  });
});
