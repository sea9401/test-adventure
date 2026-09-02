import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  actionInterval,
  monsterActionSpd,
} from "@/adventure/v2/combat/combatTimeline";
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

  it("출시 보스 순서와 연결된 특화 풀 조합을 고정한다", () => {
    expect(UNEXPLORED_BOSS_IDS).toEqual([
      "tracking_weapon",
      "toxic_blood_lord",
      "glacial_colossus",
      "invincible_fortress",
      "skyward_crystal_eye",
      "immortal_berserker",
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
    expect(UNEXPLORED_BOSSES.invincible_fortress.pools).toEqual([
      "iron_legion",
      "mana_barrier",
    ]);
    expect(UNEXPLORED_BOSSES.invincible_fortress.monster).toMatchObject({
      hp: 1_250,
      atk: 6.2,
      def: 50,
      magicDef: 50,
      spd: 20,
      accuracy: -205,
      evasionPct: 8,
    });
    expect(UNEXPLORED_BOSSES.skyward_crystal_eye).toMatchObject({
      pools: ["crystal_artillery", "precision_hunters"],
      sharedMaxHp: 32_400_000,
      anchorDepth: 120,
      monster: {
        hp: 1_150,
        atk: 11.2,
        atkType: "magic",
        def: 42,
        magicDef: 48,
        spd: 22,
        accuracy: -185,
        evasionPct: 16,
      },
    });
    expect(UNEXPLORED_BOSSES.immortal_berserker).toMatchObject({
      pools: ["regenerating_swarm", "red_berserkers"],
      sharedMaxHp: 32_400_000,
      monster: {
        hp: 1_200,
        atk: 15,
        def: 42,
        magicDef: 38,
        spd: 21,
        accuracy: -205,
        evasionPct: 10,
      },
    });
  });

  it("초기 두 보스는 1,500만, 후속 보스는 3,240만 체력으로 전투를 시작한다", () => {
    expect(UNEXPLORED_BOSSES.tracking_weapon.sharedMaxHp).toBe(15_000_000);
    expect(UNEXPLORED_BOSSES.toxic_blood_lord.sharedMaxHp).toBe(15_000_000);

    for (const id of [
      "glacial_colossus",
      "invincible_fortress",
      "skyward_crystal_eye",
      "immortal_berserker",
    ] as const) {
      expect(UNEXPLORED_BOSSES[id].sharedMaxHp).toBe(32_400_000);
    }
  });

  it("추적 병기는 표시 속도 322로 45틱마다 행동한다", () => {
    const monster = UNEXPLORED_BOSSES.tracking_weapon.monster;
    const actionSpd = monsterActionSpd(monster);

    expect(monster.spd).toBe(52);
    expect(actionSpd).toBe(322);
    expect(actionInterval(actionSpd)).toBe(45);
  });

  it("독혈 군주는 표시 속도 322로 45틱마다 행동한다", () => {
    const monster = UNEXPLORED_BOSSES.toxic_blood_lord.monster;
    const actionSpd = monsterActionSpd(monster);

    expect(monster).toMatchObject({ spd: 52, def: 44, magicDef: 46 });
    expect(actionSpd).toBe(322);
    expect(actionInterval(actionSpd)).toBe(45);
  });

  it("모든 미개척지 보스는 평타 사이에 정체성에 맞는 기본 스킬을 섞는다", () => {
    expect(UNEXPLORED_BOSSES.tracking_weapon.monster).toMatchObject({
      v2Skills: {
        learned: ["mob_crushing_blow"],
        equipped: ["mob_crushing_blow"],
      },
      v2MaxMp: 90,
    });
    expect(UNEXPLORED_BOSSES.toxic_blood_lord.monster).toMatchObject({
      v2Skills: {
        learned: ["mob_venom_sunder", "mob_crushing_blow"],
        equipped: ["mob_venom_sunder", "mob_crushing_blow"],
      },
      v2MaxMp: 90,
    });
    expect(UNEXPLORED_BOSSES.glacial_colossus.monster).toMatchObject({
      v2Skills: {
        learned: ["mob_arcane_nova"],
        equipped: ["mob_arcane_nova"],
      },
      v2MaxMp: 105,
    });
    expect(UNEXPLORED_BOSSES.invincible_fortress.monster).toMatchObject({
      v2Skills: {
        learned: ["mob_arcane_bolt"],
        equipped: ["mob_arcane_bolt"],
      },
      v2MaxMp: 0,
    });
    expect(UNEXPLORED_BOSSES.skyward_crystal_eye.monster).toMatchObject({
      v2Skills: {
        learned: ["mob_arcane_nova"],
        equipped: ["mob_arcane_nova"],
      },
      v2MaxMp: 105,
    });
    expect(UNEXPLORED_BOSSES.immortal_berserker.monster).toMatchObject({
      v2Skills: {
        learned: ["mob_savage_roar"],
        equipped: ["mob_savage_roar"],
      },
      v2MaxMp: 75,
    });
  });

  it("보스마다 거래 가능한 소환석과 독립 고유 3종을 가진다", () => {
    for (const boss of Object.values(UNEXPLORED_BOSSES)) {
      expect(UNEXPLORED_BOSSES[boss.id]).toBe(boss);
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

  it("보스별 30%·10% 일반 고유만 확정 제작하고 등급별 핵·연결 재료 비용을 적용한다", () => {
    const expectedCraftIds = UNEXPLORED_BOSS_IDS.flatMap((bossId) =>
      UNEXPLORED_BOSSES[bossId].uniqueDrops
        .slice(0, 2)
        .map((drop) => drop.equipmentId),
    );
    expect(
      UNEXPLORED_BOSS_EQUIPMENT_CRAFT_RECIPES.map(
        (recipe) => recipe.equipmentId,
      ),
    ).toEqual(expectedCraftIds);
    expect(UNEXPLORED_BOSS_EQUIPMENT_CRAFT_RECIPES).toHaveLength(
      UNEXPLORED_BOSS_IDS.length * 2,
    );

    for (const recipe of UNEXPLORED_BOSS_EQUIPMENT_CRAFT_RECIPES) {
      expect(recipe.equipmentName).toBe(V2_EQUIPMENT[recipe.equipmentId].name);
      expect([
        recipe.bossCoreCost,
        ...recipe.materialCosts.map((cost) => cost.count),
      ]).toEqual(recipe.chancePct === 30 ? [8, 25, 25] : [25, 75, 75]);
    }

    for (const bossId of UNEXPLORED_BOSS_IDS) {
      expect(
        unexploredBossEquipmentCraftRecipe(
          UNEXPLORED_BOSSES[bossId].uniqueDrops[2].equipmentId,
        ),
      ).toBeNull();
    }
  });

  it("모든 고유 장비는 6티어 드랍 전용이며 실제 이미지가 존재한다", () => {
    const drops = Object.values(UNEXPLORED_BOSSES).flatMap(
      (boss): UnexploredBossUniqueDrop[] => [...boss.uniqueDrops],
    );
    const equipmentIds = drops.map((drop) => drop.equipmentId);
    expect(equipmentIds).toHaveLength(UNEXPLORED_BOSS_IDS.length * 3);
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
