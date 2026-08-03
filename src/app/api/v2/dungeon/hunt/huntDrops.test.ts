import { afterEach, describe, expect, it, vi } from "vitest";
import { STAMINA_SHARD_MATERIAL_ID } from "@/adventure/data/v2/staminaPotionCrafting";
import {
  ENHANCE_EMBER_MATERIAL_ID,
  TORN_MAP_FRAGMENT_MATERIAL_ID,
} from "@/adventure/data/v2/scavengedCrafting";
import { rollHuntDrops } from "./huntDrops";

const baseParams = {
  dropFloor: 1 as const,
  depth: 1,
  monsterKey: "테스트 몬스터",
  ownedEquip: [],
  mapDropMult: 1,
  mapUniqueMult: 1,
  mapStoneMult: 1,
};

afterEach(() => vi.restoreAllMocks());

describe("rollHuntDrops global crafting materials", () => {
  it("rolls all global materials after a hunt victory", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = rollHuntDrops({ ...baseParams, won: true });

    expect(result.drops[STAMINA_SHARD_MATERIAL_ID]).toBe(1);
    expect(result.drops[ENHANCE_EMBER_MATERIAL_ID]).toBe(1);
    expect(result.drops[TORN_MAP_FRAGMENT_MATERIAL_ID]).toBe(1);
  });

  it("does not roll any global drop after a loss", () => {
    const random = vi.spyOn(Math, "random");

    const result = rollHuntDrops({ ...baseParams, won: false });

    expect(result.drops[STAMINA_SHARD_MATERIAL_ID]).toBeUndefined();
    expect(result.drops[ENHANCE_EMBER_MATERIAL_ID]).toBeUndefined();
    expect(result.drops[TORN_MAP_FRAGMENT_MATERIAL_ID]).toBeUndefined();
    expect(random).not.toHaveBeenCalled();
  });
});
