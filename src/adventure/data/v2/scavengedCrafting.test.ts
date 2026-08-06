import { describe, expect, it } from "vitest";
import { V2_MATERIALS } from "./dungeonDrops";
import {
  ENHANCE_EMBER_BLUE_COST,
  ENHANCE_EMBER_DROP_PCT,
  ENHANCE_EMBER_MATERIAL_ID,
  ENHANCE_EMBER_RED_COST,
  TORN_MAP_FRAGMENT_COMBINE_COST,
  TORN_MAP_FRAGMENT_DROP_PCT,
  TORN_MAP_FRAGMENT_MATERIAL_ID,
  craftedRareMapDepthOptions,
  defaultCraftedRareMapDepth,
  rollCraftedRareMapKind,
  rollEnhanceEmberDrop,
  rollTornMapFragmentDrop,
} from "./scavengedCrafting";
import { floorPowerGate } from "./dungeonLadder";

describe("scavenged crafting materials", () => {
  it("registers both tradable materials and recipe costs", () => {
    expect(V2_MATERIALS[ENHANCE_EMBER_MATERIAL_ID]?.name).toBe("강화의 불씨");
    expect(V2_MATERIALS[TORN_MAP_FRAGMENT_MATERIAL_ID]?.name).toBe(
      "찢어진 지도 조각",
    );
    expect(ENHANCE_EMBER_BLUE_COST).toBe(8);
    expect(ENHANCE_EMBER_RED_COST).toBe(24);
    expect(TORN_MAP_FRAGMENT_COMBINE_COST).toBe(10);
  });

  it("uses strict independent global-drop thresholds", () => {
    expect(
      rollEnhanceEmberDrop(() => ENHANCE_EMBER_DROP_PCT / 100 - 0.000001),
    ).toBe(1);
    expect(rollEnhanceEmberDrop(() => ENHANCE_EMBER_DROP_PCT / 100)).toBe(0);
    expect(
      rollTornMapFragmentDrop(
        () => TORN_MAP_FRAGMENT_DROP_PCT / 100 - 0.000001,
      ),
    ).toBe(1);
    expect(
      rollTornMapFragmentDrop(() => TORN_MAP_FRAGMENT_DROP_PCT / 100),
    ).toBe(0);
  });

  it("crafts only naturally droppable maps while preserving rarity order", () => {
    expect(rollCraftedRareMapKind(() => 0)).toBe("worn_map");
    expect(rollCraftedRareMapKind(() => 0.999999)).toBe("rename_map");
    expect(rollCraftedRareMapKind(() => 1)).not.toBe("exp_tome");
  });

  it("offers only conquered hunt stages and defaults to current power", () => {
    expect(craftedRareMapDepthOptions(7)).toEqual([2, 4, 6]);
    expect(craftedRareMapDepthOptions(8).at(-1)).toBe(8);
    expect(defaultCraftedRareMapDepth(20, floorPowerGate(12))).toBe(12);
    expect(defaultCraftedRareMapDepth(20, floorPowerGate(2) - 1)).toBe(2);
    expect(defaultCraftedRareMapDepth(20, null)).toBe(20);
  });
});
