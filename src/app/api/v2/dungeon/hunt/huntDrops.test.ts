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
import { pickUnexploredSpecialtyEncounter } from "@/adventure/data/v2/unexploredSpecialtyPools";
import { rollHuntDrops, rollHuntDropsRepeated, rollUnexploredSpecialtyEquipmentDrop } from "./huntDrops";

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

const IRON_SHIELD_ENCOUNTER = pickUnexploredSpecialtyEncounter(
  { mode: "focused", poolId: "iron_legion" }, () => 0,
)!;
const specialtyParams = {
  ...baseParams,
  won: true,
  depth: 80,
  dropFloor: 8 as const,
  monsterKey: "성해의 파수꾼",
};

describe("unexplored specialty equipment drops", () => {
  it.each([
    [false, 0.003999, "v2_unexplored_iron_line_armor"],
    [false, 0.004000, null],
    [true, 0.005999, "v2_unexplored_iron_line_armor"],
    [true, 0.006000, null],
  ] as const)("focused=%s roll=%s respects the exact boundary", (focused, roll, expected) => {
    expect(rollUnexploredSpecialtyEquipmentDrop({
      encounter: IRON_SHIELD_ENCOUNTER, focused, rng: () => roll,
    })).toBe(expected);
  });

  it("uses the encounter equipment ID independently of its display name", () => {
    expect(rollUnexploredSpecialtyEquipmentDrop({
      encounter: { ...IRON_SHIELD_ENCOUNTER, equipmentId: "v2_unexplored_iron_line_gloves",
        enemy: { ...IRON_SHIELD_ENCOUNTER.enemy, name: "renamed" } },
      focused: false, rng: () => 0,
    })).toBe("v2_unexplored_iron_line_gloves");
  });

  it("does not consume specialty RNG without an encounter", () => {
    const rng = vi.fn(() => 0);
    expect(rollUnexploredSpecialtyEquipmentDrop({ encounter: null, focused: true, rng })).toBeNull();
    expect(rng).not.toHaveBeenCalled();
  });

  it("preserves all legacy result fields and the 12-roll no-drop sequence", () => {
    const rng = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { droppedSpecialty, ...legacy } = rollHuntDrops(specialtyParams);
    expect(legacy).toEqual({ drops: {}, droppedEquipment: null, droppedUnique: null, nextOwned: [] });
    expect(droppedSpecialty).toBeNull();
    expect(rng).toHaveBeenCalledTimes(12);
  });

  it("rolls specialty after legacy drops and mints a normal rolled instance", () => {
    let calls = 0;
    vi.spyOn(Math, "random").mockImplementation(() => ++calls <= 12 ? 0.99 : 0);
    const result = rollHuntDrops({ ...specialtyParams, specialtyEncounter: IRON_SHIELD_ENCOUNTER });
    expect(result).toMatchObject({ drops: {}, droppedEquipment: null, droppedUnique: null,
      droppedSpecialty: "v2_unexplored_iron_line_armor" });
    expect(result.nextOwned).toEqual([expect.objectContaining({
      id: "v2_unexplored_iron_line_armor", iid: expect.any(String), roll: expect.any(Object),
    })]);
  });

  it.each([false, true])("ignores map and liberation chance multipliers (focused=%s)", (specialtyFocused) => {
    vi.spyOn(Math, "random").mockReturnValue(0.006);
    const result = rollHuntDrops({ ...specialtyParams, specialtyEncounter: IRON_SHIELD_ENCOUNTER,
      specialtyFocused, mapDropMult: 1_000, mapUniqueMult: 1_000, mapStoneMult: 1_000,
      liberationHuntEffects: { ...emptyEquippedLiberationEffects().hunt, equipmentDropPct: 100_000 },
    });
    expect(result.droppedSpecialty).toBeNull();
    expect(result.nextOwned.some(({ id }) => id.startsWith("v2_unexplored_"))).toBe(false);
  });

  it("accumulates duplicate specialty equipment with separate rolled instances", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const result = rollHuntDropsRepeated({ ...specialtyParams, specialtyEncounter: IRON_SHIELD_ENCOUNTER,
      specialtyFocused: true, rewardRolls: 3 });
    expect(result.droppedSpecialties).toEqual(Array(3).fill("v2_unexplored_iron_line_armor"));
    const instances = result.nextOwned.filter(({ id }) => id === "v2_unexplored_iron_line_armor");
    expect(instances).toHaveLength(3);
    expect(new Set(instances.map(({ iid }) => iid)).size).toBe(3);
    expect(instances.every(({ roll }) => roll && Object.keys(roll).length > 0)).toBe(true);
  });

  it("does not roll specialty on defeat", () => {
    const rng = vi.spyOn(Math, "random");
    const result = rollHuntDrops({ ...specialtyParams, won: false, specialtyEncounter: IRON_SHIELD_ENCOUNTER });
    expect(result.droppedSpecialty).toBeNull();
    expect(result.nextOwned).toEqual([]);
    expect(rng).not.toHaveBeenCalled();
  });
});

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

    expect(result.drops.sp_fruit_6).toBeUndefined(); // VI는 노드 선택 후 미개척지 전용 보상이다.
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

  it("정규 장비 전용 배율로 미개척지 기본 드랍을 2,000승당 1개 수준으로 낮춘다", () => {
    // Break caught: unexplored hunts inherit the full 0.15% depth-84 regular
    // equipment chance instead of their lower content-specific rate.
    vi.spyOn(Math, "random").mockReturnValue(0.0005);

    const result = rollHuntDrops({
      ...baseParams,
      won: true,
      depth: 84,
      regularEquipmentChanceMult: 0.31,
    });

    expect(result.droppedEquipment).toBeNull();
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
