import { describe, expect, it } from "vitest";
import {
  GUILD_WORKSHOP_MATERIAL_ID,
  GUILD_WORKSHOP_MATERIAL_IDS,
  GUILD_WORKSHOP_MATERIALS,
  GUILD_WORKSHOP_MATERIAL_DROP_PCT,
  GUILD_WORKSHOP_MATERIAL_DROP_RULES,
  rollGuildWorkshopMaterialDrops,
} from "./guildWorkshopMaterials";

describe("guild workshop materials", () => {
  it("defines five tier bottleneck materials", () => {
    expect(GUILD_WORKSHOP_MATERIAL_IDS).toHaveLength(5);
    for (const id of GUILD_WORKSHOP_MATERIAL_IDS) {
      expect(GUILD_WORKSHOP_MATERIALS[id].name.length).toBeGreaterThan(0);
      expect(GUILD_WORKSHOP_MATERIALS[id].description.length).toBeGreaterThan(0);
    }
  });

  it("keeps the modestly increased material drop rates", () => {
    expect(GUILD_WORKSHOP_MATERIAL_DROP_PCT).toEqual({
      [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 0.0045,
      [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 0.0035,
      [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 0.0025,
      [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 0.002,
      [GUILD_WORKSHOP_MATERIAL_ID.abyssalStarsteel]: 0.0017,
    });
  });

  it("rolls only the material band for the current depth", () => {
    expect(GUILD_WORKSHOP_MATERIAL_DROP_RULES).toHaveLength(5);
    expect(rollGuildWorkshopMaterialDrops(7, () => 0)).toEqual({
      [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 1,
    });
    expect(rollGuildWorkshopMaterialDrops(19, () => 0)).toEqual({
      [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 1,
    });
    expect(rollGuildWorkshopMaterialDrops(31, () => 0)).toEqual({
      [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 1,
    });
    expect(rollGuildWorkshopMaterialDrops(43, () => 0)).toEqual({
      [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 1,
    });
    expect(rollGuildWorkshopMaterialDrops(65, () => 0)).toEqual({
      [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 1,
      [GUILD_WORKSHOP_MATERIAL_ID.abyssalStarsteel]: 1,
    });
  });

  it("does not drop workshop materials outside enabled bands or on failed rolls", () => {
    expect(rollGuildWorkshopMaterialDrops(6, () => 0)).toEqual({});
    expect(rollGuildWorkshopMaterialDrops(18, () => 0.99)).toEqual({});
  });
});
