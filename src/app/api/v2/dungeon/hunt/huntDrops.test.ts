import { afterEach, describe, expect, it, vi } from "vitest";
import {
  STAMINA_SHARD_DROP_PCT,
  STAMINA_SHARD_MATERIAL_ID,
  rollStaminaShardDrop,
} from "@/adventure/data/v2/staminaPotionCrafting";
import {
  ENHANCE_EMBER_DROP_PCT,
  ENHANCE_EMBER_MATERIAL_ID,
  TORN_MAP_FRAGMENT_DROP_PCT,
  TORN_MAP_FRAGMENT_MATERIAL_ID,
  rollEnhanceEmberDrop,
  rollTornMapFragmentDrop,
} from "@/adventure/data/v2/scavengedCrafting";
import {
  SUMMON_SCROLL_DROP_PCT,
  rollSummonScrollDrop,
} from "@/adventure/data/v2/coopBosses";
import {
  GUILD_WORKSHOP_MATERIAL_DROP_PCT,
  GUILD_WORKSHOP_MATERIAL_ID,
  rollGuildWorkshopMaterialDrops,
} from "@/adventure/data/v2/guildWorkshopMaterials";
import { emptyEquippedLiberationEffects } from "@/adventure/data/v2/equipmentLiberationEffects";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";
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
  it("카테고리 배율을 기존 독립 드롭 확률에 곱한다", () => {
    expect(
      rollSummonScrollDrop(() => (SUMMON_SCROLL_DROP_PCT / 100) * 1.1),
    ).toBe(0);
    expect(
      rollSummonScrollDrop(
        () => (SUMMON_SCROLL_DROP_PCT / 100) * 1.1,
        1.2,
      ),
    ).toBe(1);

    expect(
      rollStaminaShardDrop(() => (STAMINA_SHARD_DROP_PCT / 100) * 1.1, 1.2),
    ).toBe(1);
    expect(
      rollEnhanceEmberDrop(() => (ENHANCE_EMBER_DROP_PCT / 100) * 1.1, 1.2),
    ).toBe(1);
    expect(
      rollTornMapFragmentDrop(
        () => (TORN_MAP_FRAGMENT_DROP_PCT / 100) * 1.1,
        1.2,
      ),
    ).toBe(1);

    const workshopId = GUILD_WORKSHOP_MATERIAL_ID.refinedIron;
    const workshopBoundary = GUILD_WORKSHOP_MATERIAL_DROP_PCT[workshopId];
    expect(rollGuildWorkshopMaterialDrops(7, () => workshopBoundary * 1.1))
      .toEqual({});
    expect(
      rollGuildWorkshopMaterialDrops(7, () => workshopBoundary * 1.1, 1.2),
    ).toEqual({ [workshopId]: 1 });
  });

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

  it("사냥에서 발급된 일반·고유 장비의 최소 품질을 함께 보장한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const effects = emptyEquippedLiberationEffects().hunt;

    const result = rollHuntDrops({
      ...baseParams,
      won: true,
      liberationHuntEffects: {
        ...effects,
        equipmentDropPct: 100_000,
        minimumEquipmentQualityPp: 10,
      },
    });

    expect(result.nextOwned.length).toBeGreaterThan(0);
    for (const instance of result.nextOwned) {
      expect(rollQualityPct(V2_EQUIPMENT[instance.id], instance.roll)).toBeGreaterThanOrEqual(10);
    }
  });
});
