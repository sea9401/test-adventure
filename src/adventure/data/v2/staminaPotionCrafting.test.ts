import { describe, expect, it } from "vitest";
import { V2_MATERIALS } from "./dungeonDrops";
import {
  STAMINA_SHARD_COMBINE_COST,
  STAMINA_SHARD_DROP_PCT,
  STAMINA_SHARD_MATERIAL_ID,
  rollStaminaShardDrop,
} from "./staminaPotionCrafting";

describe("stamina potion crafting material", () => {
  it("registers the vitality shard as a tradable material", () => {
    expect(V2_MATERIALS[STAMINA_SHARD_MATERIAL_ID]).toMatchObject({
      id: STAMINA_SHARD_MATERIAL_ID,
      name: "활력의 파편",
    });
    expect(STAMINA_SHARD_COMBINE_COST).toBe(6);
  });

  it("drops at the configured global hunt rate", () => {
    expect(rollStaminaShardDrop(() => STAMINA_SHARD_DROP_PCT / 100 - 0.000001)).toBe(1);
    expect(rollStaminaShardDrop(() => STAMINA_SHARD_DROP_PCT / 100)).toBe(0);
  });
});
