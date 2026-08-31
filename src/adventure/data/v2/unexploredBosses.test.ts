import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { V2_MATERIALS, materialSellPriceOf } from "./dungeonDrops";
import { V2_EQUIPMENT } from "./v2Equipment";
import {
  UNEXPLORED_BOSS_CORE_MATERIAL,
  UNEXPLORED_BOSSES,
  UNEXPLORED_BOSS_IDS,
  UNEXPLORED_SUMMON_STONE_MATERIALS,
} from "./unexploredBosses";

describe("미개척지 개인 보스 카탈로그", () => {
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

  it("고유 장비 9종은 6티어 드랍 전용이며 실제 이미지가 존재한다", () => {
    const equipmentIds = Object.values(UNEXPLORED_BOSSES).flatMap((boss) =>
      boss.uniqueDrops.map((drop) => drop.equipmentId),
    );
    expect(equipmentIds).toHaveLength(9);
    for (const id of equipmentIds) {
      const item = V2_EQUIPMENT[id];
      expect(item).toBeDefined();
      expect(item.tier).toBe(16);
      expect(item.rarity).toBe("unique");
      expect(item.noDrop).toBe(true);
      expect(item.image).toMatch(/^\/images\/equipment\/unexplored-[a-z0-9-]+\.webp$/);
      expect(existsSync(join(process.cwd(), "public", item.image!.slice(1)))).toBe(true);
    }
  });
});
