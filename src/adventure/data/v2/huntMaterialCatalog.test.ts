import { describe, expect, it } from "vitest";
import { SUMMON_SCROLL_MATERIAL_ID } from "./coopBosses";
import {
  commonHuntMaterialDrops,
  formatHuntMaterialDropChance,
  regionalHuntMaterialDrops,
} from "./huntMaterialCatalog";
import { GUILD_WORKSHOP_MATERIAL_ID } from "./guildWorkshopMaterials";
import { MONSTER_CRAFT_MATERIAL_ID } from "./monsterCraftMaterials";
import { REFORGE_STONE_MATERIAL_ID } from "./v2EquipVariance";
import { SETTLEMENT_MATERIAL_ID } from "./settlementMaterials";

describe("hunt material codex catalog", () => {
  it("shows only materials that can currently drop in every hunting ground", () => {
    const entries = commonHuntMaterialDrops();
    const ids = entries.map((entry) => entry.id);

    expect(ids).toContain(SUMMON_SCROLL_MATERIAL_ID);
    expect(ids).not.toContain(SETTLEMENT_MATERIAL_ID.timber);
    expect(ids).not.toContain(SETTLEMENT_MATERIAL_ID.ironOre);
    expect(ids).not.toContain(REFORGE_STONE_MATERIAL_ID.basic);
    expect(ids).not.toContain(REFORGE_STONE_MATERIAL_ID.high);
    expect(entries.every((entry) => entry.chancePct > 0)).toBe(true);
    expect(entries.map((entry) => entry.chancePct)).toEqual(
      [...entries]
        .sort((a, b) => b.chancePct - a.chancePct || a.name.localeCompare(b.name))
        .map((entry) => entry.chancePct),
    );
  });

  it("combines the current depth material and matching monster-only material", () => {
    const entries = regionalHuntMaterialDrops({
      areaName: "마른 협곡",
      depthStart: 7,
      depthEnd: 12,
      monsterKeys: ["스파크 전갈", "협곡 도적"],
    });

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: GUILD_WORKSHOP_MATERIAL_ID.refinedIron,
          chancePct: 0.45,
          source: "지역 공통",
          boost: null,
        }),
        expect.objectContaining({
          id: MONSTER_CRAFT_MATERIAL_ID.sparkScorpionConductiveSac,
          chancePct: 2,
          source: "스파크 전갈 전용",
          boost: "drop",
        }),
      ]),
    );
  });

  it("labels a material that only drops in part of a theme with its depth range", () => {
    const entries = regionalHuntMaterialDrops({
      depthStart: 61,
      depthEnd: 66,
      monsterKeys: [],
    });

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal,
          source: "지역 공통",
        }),
        expect.objectContaining({
          id: GUILD_WORKSHOP_MATERIAL_ID.abyssalStarsteel,
          source: "깊이 65~66",
        }),
      ]),
    );
  });

  it("formats small base chances without unnecessary trailing zeroes", () => {
    expect(formatHuntMaterialDropChance(2)).toBe("2%");
    expect(formatHuntMaterialDropChance(0.6)).toBe("0.6%");
    expect(formatHuntMaterialDropChance(0.45)).toBe("0.45%");
    expect(formatHuntMaterialDropChance(0.04)).toBe("0.04%");
  });
});
