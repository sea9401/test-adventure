import { describe, expect, it } from "vitest";
import { GUILD_WORKSHOP_MATERIAL_ID } from "@/adventure/data/v2/guildWorkshopMaterials";
import {
  MINING_MATERIAL_ID,
  MINING_SPOT_IDS,
  MINING_SPOTS,
  miningNodeForSpot,
} from "@/adventure/data/v2/miningSpots";
import { MONSTER_CRAFT_MATERIAL_ID } from "@/adventure/data/v2/monsterCraftMaterials";
import {
  WOODCUTTING_MATERIAL_ID,
  WOODCUTTING_SPOT_IDS,
  WOODCUTTING_SPOTS,
  woodcuttingTreeForSpot,
} from "@/adventure/data/v2/woodcuttingSpots";
import { workshopBasicMaterialGroups } from "./workshopBasicMaterials";

describe("guild workshop basic material inventory", () => {
  it("생활지도의 지역 순서대로 목재와 주 광물을 나눈다", () => {
    const groups = workshopBasicMaterialGroups({});

    expect(groups.map((group) => group.label)).toEqual(["목재", "광물"]);
    expect(groups[0].entries.map((entry) => entry.key)).toEqual(
      WOODCUTTING_SPOT_IDS.map(
        (spotId) =>
          woodcuttingTreeForSpot(WOODCUTTING_SPOTS[spotId]).materialId,
      ),
    );
    expect(groups[1].entries.map((entry) => entry.key)).toEqual(
      MINING_SPOT_IDS.map(
        (spotId) => miningNodeForSpot(MINING_SPOTS[spotId]).materialId,
      ),
    );
  });

  it("does not include mining byproducts or special crafting materials", () => {
    const allIds = workshopBasicMaterialGroups({}).flatMap((group) =>
      group.entries.map((entry) => entry.key),
    );

    expect(allIds).not.toContain(MINING_MATERIAL_ID.stone);
    expect(allIds).not.toContain(MINING_MATERIAL_ID.coal);
    expect(allIds).not.toContain(MINING_MATERIAL_ID.roughGem);
    expect(allIds).not.toContain(GUILD_WORKSHOP_MATERIAL_ID.refinedIron);
    expect(allIds).not.toContain(
      MONSTER_CRAFT_MATERIAL_ID.caveSpiderVenomGland,
    );
  });

  it("normalizes displayed amounts", () => {
    const groups = workshopBasicMaterialGroups({
      [WOODCUTTING_MATERIAL_ID.pine]: 3.9,
      [MINING_MATERIAL_ID.iron]: -2,
    });

    expect(groups[0].entries[0].amount).toBe(3);
    expect(groups[1].entries[0].amount).toBe(0);
  });
});
