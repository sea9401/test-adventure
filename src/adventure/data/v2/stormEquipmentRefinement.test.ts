import { describe, expect, it } from "vitest";
import {
  parseEquipmentSave,
  V2_EQUIPMENT,
  V2_EQUIP_TAG_SETS,
  type V2EquipInstance,
} from "./v2Equipment";
import { rollQualityPct } from "./v2EquipVariance";
import {
  STORM_REFINEMENT_GOLD_COST,
  STORM_REFINEMENT_MATERIAL_COST,
  canStormRefine,
  isStormRefinementCandidate,
  stormRefinedRoll,
  stormRefinementTargetBasePower,
} from "./stormEquipmentRefinement";
import {
  STORM_EXPEDITION_EQUIPMENT_IDS,
  STORM_ORIGIN_FRAGMENT_MATERIAL_ID,
} from "./stormExpeditionRewards";
import { BAND_COMMON_POOLS, SKY_RIFT_WEAPON_IDS } from "./dungeonUniqueDrops";
import { GUILD_WORKSHOP_RECIPES } from "./guildWorkshop";

const STORM_SET_IDS = [
  "storm_gravity",
  "storm_breaker",
  "storm_pursuit",
  "storm_shadow",
  "storm_venom",
  "storm_arcane",
  "storm_sanctuary",
] as const;

describe("6T 빌드 세트", () => {
  it("7개 컨셉이 각각 6부위이며 2·4부위 발동과 3·5부위 전환 보정을 제공한다", () => {
    for (const setId of STORM_SET_IDS) {
      const set = V2_EQUIP_TAG_SETS.find((candidate) => candidate.id === setId);
      expect(set?.thresholds.map((threshold) => threshold.count)).toEqual([
        2, 3, 4, 5,
      ]);
      const pieces = Object.values(V2_EQUIPMENT).filter((item) =>
        item.setTags?.includes(setId),
      );
      expect(pieces).toHaveLength(6);
      expect(new Set(pieces.map((item) => item.slot)).size).toBe(6);
      expect(pieces.every((item) => item.tier === 16 && item.noDrop)).toBe(true);
    }
  });

  it("3·5부위 보정은 세트별 생존 방식과 자원 축을 유지한다", () => {
    const threshold = (setId: (typeof STORM_SET_IDS)[number], count: 3 | 5) =>
      V2_EQUIP_TAG_SETS.find((set) => set.id === setId)?.thresholds.find(
        (candidate) => candidate.count === count,
      )?.bonus;

    expect(threshold("storm_gravity", 3)).toMatchObject({ def: 80, critResist: 8 });
    expect(threshold("storm_breaker", 3)).toMatchObject({ crit: 2, critMult: 15 });
    expect(threshold("storm_pursuit", 3)).toMatchObject({ eva: 4 });
    expect(threshold("storm_shadow", 3)).toMatchObject({ eva: 8 });
    expect(threshold("storm_venom", 3)).toMatchObject({
      statusDamageReductionPct: 5,
    });
    expect(threshold("storm_arcane", 3)).toMatchObject({ mp: 200 });
    expect(threshold("storm_sanctuary", 3)).toMatchObject({
      healPowerPct: 4,
    });
    for (const setId of STORM_SET_IDS) {
      expect(threshold(setId, 3)?.hp ?? 0).toBeGreaterThan(0);
      expect(threshold(setId, 5)?.hp ?? 0).toBeGreaterThan(0);
    }
  });

  it("무풍암영과 만독침식은 서로 다른 단검·세트 효과를 쓴다", () => {
    expect(V2_EQUIPMENT.v2_storm_gale_dagger.setTags).toEqual([
      "storm_shadow",
    ]);
    expect(V2_EQUIPMENT.v2_storm_venom_dagger.setTags).toEqual([
      "storm_venom",
    ]);
    const shadow = V2_EQUIP_TAG_SETS.find((set) => set.id === "storm_shadow");
    const venom = V2_EQUIP_TAG_SETS.find((set) => set.id === "storm_venom");
    expect(shadow?.buildTags).not.toContain("poison");
    expect(venom?.buildTags).toContain("poison");
  });

  it("공격 마법 세트의 비장신구 마방은 제거하고 성역 세트에만 특화한다", () => {
    for (const id of [
      "v2_storm_thunder_armor",
      "v2_storm_thunder_gloves",
      "v2_storm_thunder_boots",
    ] as const) {
      expect(V2_EQUIPMENT[id].options?.magicDef ?? 0).toBe(0);
    }
    expect(V2_EQUIPMENT.v2_storm_sanctuary_armor.options?.magicDef).toBeGreaterThan(
      100,
    );
  });

  it("6T 세트는 방어구=사냥, 장신구=원정, 무기=공방으로 수급처가 분리된다", () => {
    const rewardIds = new Set(Object.values(STORM_EXPEDITION_EQUIPMENT_IDS).flat());
    const huntIds = new Set(
      BAND_COMMON_POOLS.filter((pool) => pool.minDepth >= 73).flatMap(
        (pool) => pool.ids,
      ),
    );
    const workshopIds = new Set(
      Object.values(GUILD_WORKSHOP_RECIPES)
        .filter((recipe) => recipe.id.startsWith("storm_"))
        .map((recipe) => recipe.equipmentId),
    );
    for (const item of Object.values(V2_EQUIPMENT)) {
      if (item.setTags?.some((tag) => STORM_SET_IDS.includes(tag as never))) {
        if (item.slot === "weapon") expect(workshopIds.has(item.id)).toBe(true);
        else if (item.slot === "ring" || item.slot === "necklace") {
          expect(rewardIds.has(item.id)).toBe(true);
        } else expect(huntIds.has(item.id)).toBe(true);
      }
    }
    expect(new Set(SKY_RIFT_WEAPON_IDS)).toEqual(workshopIds);
  });
});

describe("특화 장비 폭풍 개량", () => {
  const item = V2_EQUIPMENT.v2_throne_sig_eclipse_staff;

  it("6T 이전 비세트 유니크만 대상으로 삼고 이미 개량한 장비는 다시 받지 않는다", () => {
    expect(isStormRefinementCandidate(item)).toBe(true);
    expect(canStormRefine(item, {})).toBe(true);
    expect(canStormRefine(item, { stormRefined: true })).toBe(false);
    expect(
      isStormRefinementCandidate(V2_EQUIPMENT.v2_sanctum_sig_priest_armor),
    ).toBe(false);
    expect(
      isStormRefinementCandidate(V2_EQUIPMENT.v2_boss_void_bastion),
    ).toBe(false);
    expect(
      isStormRefinementCandidate(V2_EQUIPMENT.v2_storm_thunder_staff),
    ).toBe(false);
    expect(
      canStormRefine(V2_EQUIPMENT.v2_abyssruin_sig_apostle_staff, {}),
    ).toBe(false);
  });

  it("대상 장비에는 구형·태그형 세트 장비가 한 개도 섞이지 않는다", () => {
    const candidates = Object.values(V2_EQUIPMENT).filter(
      isStormRefinementCandidate,
    );

    expect(candidates).toHaveLength(32);
    expect(candidates.every((candidate) => !candidate.setId)).toBe(true);
    expect(candidates.every((candidate) => !candidate.setTags?.length)).toBe(
      true,
    );
    expect(candidates.filter((candidate) => canStormRefine(candidate, {}))).toHaveLength(
      31,
    );
  });

  it("위력을 낮추지 않으면서 굴림 품질과 옵션을 보존한다", () => {
    const source: V2EquipInstance = {
      iid: "eq_test",
      id: item.id,
      roll: {
        power: Math.round(item.power * 0.7),
        weight: 0,
        options: { mp: 222, crit: 7, magicDef: 10 },
      },
      enhance: { level: 9, bonusPct: 28 },
      locked: true,
    };
    const oldQuality = rollQualityPct(item, source.roll);
    const refined = stormRefinedRoll(item, source);
    expect(stormRefinementTargetBasePower(item)).toBeGreaterThanOrEqual(item.power);
    expect(refined.power).toBeGreaterThanOrEqual(source.roll!.power);
    expect(refined.options).toEqual(source.roll!.options);
    expect(rollQualityPct(item, refined)).toBe(oldQuality);
  });

  it("저장 파싱에서 개량 표식과 새 품질 기준 위력을 유지한다", () => {
    const parsed = parseEquipmentSave({
      owned: [
        {
          iid: "eq_refined",
          id: item.id,
          roll: { power: 600, weight: 0, powerBase: 550 },
          stormRefined: true,
        },
      ],
    });
    expect(parsed.owned[0]).toMatchObject({
      iid: "eq_refined",
      stormRefined: true,
      roll: { power: 600, powerBase: 550 },
    });
  });

  it("7차 전직용 기원의 파편은 개량 재료로 소비하지 않는다", () => {
    expect(STORM_REFINEMENT_GOLD_COST).toBe(10_000_000);
    expect(STORM_REFINEMENT_MATERIAL_COST).not.toHaveProperty(
      STORM_ORIGIN_FRAGMENT_MATERIAL_ID,
    );
    expect(Object.keys(STORM_REFINEMENT_MATERIAL_COST)).toHaveLength(4);
  });
});
