import { afterEach, describe, expect, it, vi } from "vitest";
import { STAMINA_SHARD_MATERIAL_ID } from "@/adventure/data/v2/staminaPotionCrafting";
import {
  ENHANCE_EMBER_MATERIAL_ID,
  TORN_MAP_FRAGMENT_MATERIAL_ID,
} from "@/adventure/data/v2/scavengedCrafting";
import { rollHuntDrops, rollHuntDropsRepeated } from "./huntDrops";

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

  it("압축 보상 횟수마다 실제 드랍 굴림과 장비 개체 생성을 독립 반복한다", () => {
    // Break caught: compressed settlement scales one drop chance instead of preserving rolls.
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const result = rollHuntDropsRepeated({
      ...baseParams,
      won: true,
      depth: 84,
      rewardRolls: 3,
      mapDropMult: 1_000,
      mapUniqueMult: 100_000,
      mapStoneMult: 1,
    });

    expect(result.droppedEquipments).toHaveLength(3);
    expect(result.droppedUniques).toHaveLength(3);
    expect(result.nextOwned).toHaveLength(6);
  });
});
