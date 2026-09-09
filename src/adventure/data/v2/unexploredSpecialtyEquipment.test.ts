import { describe, expect, it } from "vitest";
import {
  V2_EQUIPMENT,
  V2_EQUIP_TAG_SETS,
  v2EquipCatalogTierToDisplayTier,
} from "./v2Equipment";
import {
  collectUnexploredSetEffects,
  UNEXPLORED_SPECIALTY_EQUIPMENT_IDS,
  UNEXPLORED_SPECIALTY_SET_IDS,
  UNEXPLORED_SPECIALTY_TAG_SETS,
} from "./unexploredSpecialtyEquipment";

describe("unexplored specialty equipment", () => {
  it("36개 장비와 12개 2/3단계 세트를 노출한다", () => {
    expect(UNEXPLORED_SPECIALTY_EQUIPMENT_IDS).toHaveLength(36);
    expect(new Set(UNEXPLORED_SPECIALTY_EQUIPMENT_IDS).size).toBe(36);
    expect(UNEXPLORED_SPECIALTY_SET_IDS).toHaveLength(12);
    for (const id of UNEXPLORED_SPECIALTY_EQUIPMENT_IDS) {
      expect(v2EquipCatalogTierToDisplayTier(V2_EQUIPMENT[id].tier)).toBe(6);
      expect(V2_EQUIPMENT[id].slot).not.toBe("weapon");
      expect(V2_EQUIPMENT[id].rarity ?? "common").toBe("common");
      expect(V2_EQUIPMENT[id].noDrop).toBe(true);
    }
    for (const id of UNEXPLORED_SPECIALTY_SET_IDS) {
      const set = V2_EQUIP_TAG_SETS.find((candidate) => candidate.id === id)!;
      expect(set.thresholds.map(({ count }) => count)).toEqual([2, 3]);
      expect(
        UNEXPLORED_SPECIALTY_EQUIPMENT_IDS.filter((itemId) =>
          V2_EQUIPMENT[itemId].setTags?.includes(id),
        ),
      ).toHaveLength(3);
    }
  });

  it("승인된 위력은 6티어 보정 없이 그대로 노출한다", () => {
    expect(
      Object.fromEntries(
        UNEXPLORED_SPECIALTY_EQUIPMENT_IDS.map((id) => [
          id,
          V2_EQUIPMENT[id].power,
        ]),
      ),
    ).toEqual({
      v2_unexplored_iron_line_armor: 260,
      v2_unexplored_iron_line_gloves: 86,
      v2_unexplored_iron_line_boots: 80,
      v2_unexplored_mana_barrier_armor: 255,
      v2_unexplored_mana_barrier_ring: 140,
      v2_unexplored_mana_barrier_necklace: 165,
      v2_unexplored_regrowth_colony_armor: 258,
      v2_unexplored_regrowth_colony_gloves: 88,
      v2_unexplored_regrowth_colony_necklace: 160,
      v2_unexplored_battle_revenge_gloves: 90,
      v2_unexplored_battle_revenge_boots: 82,
      v2_unexplored_battle_revenge_ring: 144,
      v2_unexplored_crystal_barrage_armor: 254,
      v2_unexplored_crystal_barrage_gloves: 88,
      v2_unexplored_crystal_barrage_necklace: 158,
      v2_unexplored_precision_hunt_boots: 80,
      v2_unexplored_precision_hunt_ring: 142,
      v2_unexplored_precision_hunt_gloves: 88,
      v2_unexplored_chain_drive_boots: 82,
      v2_unexplored_chain_drive_gloves: 88,
      v2_unexplored_chain_drive_ring: 142,
      v2_unexplored_afterimage_hunt_boots: 80,
      v2_unexplored_afterimage_hunt_gloves: 86,
      v2_unexplored_afterimage_hunt_armor: 248,
      v2_unexplored_triad_decay_gloves: 86,
      v2_unexplored_triad_decay_ring: 138,
      v2_unexplored_triad_decay_armor: 252,
      v2_unexplored_unyielding_dead_gloves: 86,
      v2_unexplored_unyielding_dead_boots: 80,
      v2_unexplored_unyielding_dead_armor: 252,
      v2_unexplored_freezing_lock_gloves: 86,
      v2_unexplored_freezing_lock_ring: 140,
      v2_unexplored_freezing_lock_armor: 252,
      v2_unexplored_crushing_pressure_armor: 268,
      v2_unexplored_crushing_pressure_gloves: 90,
      v2_unexplored_crushing_pressure_boots: 84,
    });
  });

  it("각 장비의 이름·슬롯·옵션·세트 연결을 고정한다", () => {
    const expected = [
      ["v2_unexplored_iron_line_armor", "철갑 전열갑", "armor", { hp: 1_350, def: 135, magicDef: 60, critResist: 15, spd: -8 }, "unexplored_iron_line"],
      ["v2_unexplored_iron_line_gloves", "장창 수호완갑", "gloves", { hp: 400, def: 70, accuracy: 18, critResist: 10 }, "unexplored_iron_line"],
      ["v2_unexplored_iron_line_boots", "파쇄 지주화", "boots", { hp: 420, def: 60, magicDef: 30, critResist: 10, spd: -2 }, "unexplored_iron_line"],
      ["v2_unexplored_mana_barrier_armor", "영맥 방벽의", "armor", { hp: 1_000, mp: 400, magicDef: 150, critResist: 12, statusDamageReductionPct: 18 }, "unexplored_mana_barrier"],
      ["v2_unexplored_mana_barrier_ring", "집행 룬환", "ring", { mp: 340, magicDef: 55, crit: 10, accuracy: 20, statusDamageReductionPct: 8 }, "unexplored_mana_barrier"],
      ["v2_unexplored_mana_barrier_necklace", "봉인 감시목걸이", "necklace", { hp: 550, mp: 480, magicDef: 130, critResist: 12, statusDamageReductionPct: 12, healPowerPct: 8 }, "unexplored_mana_barrier"],
      ["v2_unexplored_regrowth_colony_armor", "되살이 포자갑", "armor", { hp: 1_250, mp: 250, def: 70, magicDef: 70, healPowerPct: 15, statusDamageReductionPct: 10 }, "unexplored_regrowth_colony"],
      ["v2_unexplored_regrowth_colony_gloves", "포식 생체완갑", "gloves", { hp: 450, def: 55, magicDef: 40, accuracy: 16, healPowerPct: 10 }, "unexplored_regrowth_colony"],
      ["v2_unexplored_regrowth_colony_necklace", "증식 생명핵", "necklace", { hp: 650, mp: 350, magicDef: 90, critResist: 10, healPowerPct: 12 }, "unexplored_regrowth_colony"],
      ["v2_unexplored_battle_revenge_gloves", "격전 완갑", "gloves", { hp: 360, def: 35, crit: 14, critMult: 55, accuracy: 16 }, "unexplored_battle_revenge"],
      ["v2_unexplored_battle_revenge_boots", "혈전 추격화", "boots", { hp: 300, crit: 12, critMult: 45, eva: 8, accuracy: 14, spd: 20 }, "unexplored_battle_revenge"],
      ["v2_unexplored_battle_revenge_ring", "응징 처형환", "ring", { hp: 400, magicDef: 35, crit: 14, critMult: 65, accuracy: 18 }, "unexplored_battle_revenge"],
      ["v2_unexplored_crystal_barrage_armor", "수정 각인법의", "armor", { hp: 780, mp: 400, magicDef: 90, accuracy: 10 }, "unexplored_crystal_barrage"],
      ["v2_unexplored_crystal_barrage_gloves", "굴절 조준완갑", "gloves", { hp: 180, mp: 180, crit: 12, critMult: 50, accuracy: 20 }, "unexplored_crystal_barrage"],
      ["v2_unexplored_crystal_barrage_necklace", "집속 포격핵", "necklace", { hp: 350, mp: 380, magicDef: 75, crit: 10, critMult: 40, accuracy: 16 }, "unexplored_crystal_barrage"],
      ["v2_unexplored_precision_hunt_boots", "선행 관측화", "boots", { hp: 240, crit: 8, eva: 12, accuracy: 24, spd: 24 }, "unexplored_precision_hunt"],
      ["v2_unexplored_precision_hunt_ring", "정점 조준환", "ring", { hp: 220, mp: 160, crit: 16, critMult: 70, accuracy: 26 }, "unexplored_precision_hunt"],
      ["v2_unexplored_precision_hunt_gloves", "파갑 사냥완갑", "gloves", { hp: 280, def: 40, crit: 12, critMult: 50, accuracy: 28 }, "unexplored_precision_hunt"],
      ["v2_unexplored_chain_drive_boots", "과열 추진화", "boots", { hp: 220, crit: 10, eva: 12, accuracy: 12, spd: 24 }, "unexplored_chain_drive"],
      ["v2_unexplored_chain_drive_gloves", "연격 구동완갑", "gloves", { hp: 240, crit: 12, critMult: 50, accuracy: 18, spd: 10 }, "unexplored_chain_drive"],
      ["v2_unexplored_chain_drive_ring", "폭주 동력환", "ring", { hp: 280, mp: 180, crit: 12, critMult: 60, accuracy: 16, spd: 8 }, "unexplored_chain_drive"],
      ["v2_unexplored_afterimage_hunt_boots", "암영 정찰화", "boots", { hp: 300, eva: 20, critResist: 6, spd: 24 }, "unexplored_afterimage_hunt"],
      ["v2_unexplored_afterimage_hunt_gloves", "야습 암살완갑", "gloves", { hp: 320, def: 45, magicDef: 30, eva: 12, accuracy: 18, spd: 10 }, "unexplored_afterimage_hunt"],
      ["v2_unexplored_afterimage_hunt_armor", "허상 피막갑", "armor", { hp: 950, def: 55, magicDef: 75, eva: 20, critResist: 10, statusDamageReductionPct: 8 }, "unexplored_afterimage_hunt"],
      ["v2_unexplored_triad_decay_gloves", "독니 침식완갑", "gloves", { hp: 300, def: 40, crit: 10, accuracy: 20, spd: 10 }, "unexplored_triad_decay"],
      ["v2_unexplored_triad_decay_ring", "독무 분사환", "ring", { hp: 300, mp: 220, magicDef: 45, accuracy: 18, spd: 10 }, "unexplored_triad_decay"],
      ["v2_unexplored_triad_decay_armor", "부식 군체갑", "armor", { hp: 1_050, def: 70, magicDef: 70, critResist: 8, statusDamageReductionPct: 12 }, "unexplored_triad_decay"],
      ["v2_unexplored_unyielding_dead_gloves", "갈고리 혈흔완갑", "gloves", { hp: 350, def: 45, crit: 12, critMult: 45, accuracy: 18 }, "unexplored_unyielding_dead"],
      ["v2_unexplored_unyielding_dead_boots", "혈주 추격화", "boots", { hp: 300, crit: 10, eva: 8, accuracy: 16, spd: 22 }, "unexplored_unyielding_dead"],
      ["v2_unexplored_unyielding_dead_armor", "절단 망자갑", "armor", { hp: 1_000, def: 80, magicDef: 60, critResist: 10, statusDamageReductionPct: 8 }, "unexplored_unyielding_dead"],
      ["v2_unexplored_freezing_lock_gloves", "서리 접촉완갑", "gloves", { hp: 260, mp: 180, crit: 12, critMult: 45, accuracy: 18 }, "unexplored_freezing_lock"],
      ["v2_unexplored_freezing_lock_ring", "빙결 주문환", "ring", { hp: 280, mp: 280, magicDef: 50, crit: 14, critMult: 55, accuracy: 16 }, "unexplored_freezing_lock"],
      ["v2_unexplored_freezing_lock_armor", "혹한 파수갑", "armor", { hp: 900, mp: 250, def: 65, magicDef: 90, critResist: 8, statusDamageReductionPct: 8 }, "unexplored_freezing_lock"],
      ["v2_unexplored_crushing_pressure_armor", "암반 거수갑", "armor", { hp: 1_350, def: 120, magicDef: 45, critResist: 10, spd: -6 }, "unexplored_crushing_pressure"],
      ["v2_unexplored_crushing_pressure_gloves", "철벽 분쇄완갑", "gloves", { hp: 400, def: 60, crit: 12, critMult: 50, accuracy: 16, spd: -2 }, "unexplored_crushing_pressure"],
      ["v2_unexplored_crushing_pressure_boots", "지각 파쇄화", "boots", { hp: 420, def: 55, magicDef: 25, crit: 10, critMult: 45, spd: -4 }, "unexplored_crushing_pressure"],
    ] as const;

    for (const [id, name, slot, options, setId] of expected) {
      expect(V2_EQUIPMENT[id]).toMatchObject({
        id,
        name,
        slot,
        concept: slot === "armor" ? "heavy" : slot === "ring" ? "luck" : slot === "necklace" ? "mana" : "light",
        tier: 16,
        weight: 0,
        rarity: "common",
        noDrop: true,
        description: `${name}. 미개척지 특화 세트 장비.`,
        options,
        setTags: [setId],
      });
    }
  });

  it("각 세트의 단계 보너스와 고유 효과를 고정한다", () => {
    expect(UNEXPLORED_SPECIALTY_TAG_SETS.map(({ id, name, thresholds }) => ({ id, name, thresholds }))).toEqual([
      { id: "unexplored_iron_line", name: "철갑 전열", thresholds: [{ count: 2, bonus: { hp: 400, def: 45, critResist: 6 } }, { count: 3, bonus: { hp: 250, magicDef: 25 }, effect: { kind: "iron_wall", label: "철벽 누적" } }] },
      { id: "unexplored_mana_barrier", name: "영맥 방벽", thresholds: [{ count: 2, bonus: { mp: 220, magicDef: 50, statusDamageReductionPct: 8 } }, { count: 3, bonus: { hp: 300, critResist: 5 }, effect: { kind: "mana_redeployment", label: "영맥 재전개" } }] },
      { id: "unexplored_regrowth_colony", name: "증식 생체", thresholds: [{ count: 2, bonus: { hp: 450, healPowerPct: 10, statusDamageReductionPct: 6 } }, { count: 3, bonus: { hp: 300, def: 30, magicDef: 30 }, effect: { kind: "colony_regeneration", label: "군체 재생" } }] },
      { id: "unexplored_battle_revenge", name: "혈전 반격", thresholds: [{ count: 2, bonus: { hp: 400, crit: 5, accuracy: 10 } }, { count: 3, bonus: { hp: 350, crit: 6, critMult: 40 }, effect: { kind: "battle_revenge", label: "격전 본능" } }] },
      { id: "unexplored_crystal_barrage", name: "굴절 포격", thresholds: [{ count: 2, bonus: { mp: 180, accuracy: 8, crit: 4 } }, { count: 3, bonus: { hp: 200, magicDef: 20, critMult: 25 }, effect: { kind: "crystal_focus", label: "수정 집속" } }] },
      { id: "unexplored_precision_hunt", name: "무결점 사냥", thresholds: [{ count: 2, bonus: { hp: 200, accuracy: 18, spd: 5, basicAttackDamagePct: 15 } }, { count: 3, bonus: { accuracy: 10, crit: 7, critMult: 45 }, effect: { kind: "precision_shot", label: "정밀 사격" } }] },
      { id: "unexplored_chain_drive", name: "연쇄 구동", thresholds: [{ count: 2, bonus: { spd: 10, accuracy: 10, extraBasicAttackDamagePct: 20 } }, { count: 3, bonus: { hp: 250, crit: 5, critMult: 35 }, effect: { kind: "chain_drive", label: "연쇄 구동" } }] },
      { id: "unexplored_afterimage_hunt", name: "잔영 추적", thresholds: [{ count: 2, bonus: { hp: 350, eva: 12, critResist: 6 } }, { count: 3, bonus: { hp: 450, def: 30, magicDef: 30, statusDamageReductionPct: 8 }, effect: { kind: "afterimage_coating", label: "허상 피막" } }] },
      { id: "unexplored_triad_decay", name: "삼재 침식", thresholds: [{ count: 2, bonus: { hp: 300, mp: 180, accuracy: 10, statusDotDamagePct: 15 } }, { count: 3, bonus: { hp: 300, spd: 8, statusDotDamagePct: 25 } }] },
      { id: "unexplored_unyielding_dead", name: "망자의 완강", thresholds: [{ count: 2, bonus: { hp: 350, magicDef: 20, critResist: 6, statusDamageReductionPct: 6 } }, { count: 3, bonus: { hp: 400, def: 30, magicDef: 30, critResist: 8 }, effect: { kind: "unyielding_dead", label: "망자의 완강" } }] },
      { id: "unexplored_freezing_lock", name: "빙점 봉쇄", thresholds: [{ count: 2, bonus: { hp: 250, mp: 180, crit: 5, magicDef: 20 }, effect: { kind: "frost_mark", label: "서리 표식" } }, { count: 3, bonus: { hp: 350, magicDef: 30, critResist: 6, critMult: 35 }, effect: { kind: "freezing_lock", label: "빙점 봉쇄" } }] },
      { id: "unexplored_crushing_pressure", name: "중압 파쇄", thresholds: [{ count: 2, bonus: { hp: 400, def: 40, magicDef: 20, critResist: 6 } }, { count: 3, bonus: { hp: 350, def: 25, crit: 6, critMult: 35 }, effect: { kind: "colossus_crush", label: "거수 파쇄" } }] },
    ]);
  });

  it("활성 세트 단계의 고유 효과를 낮은 단계부터 모은다", () => {
    expect(
      collectUnexploredSetEffects({
        gloves: "v2_unexplored_freezing_lock_gloves",
        ring: "v2_unexplored_freezing_lock_ring",
        armor: "v2_unexplored_freezing_lock_armor",
      }),
    ).toEqual([
      { kind: "frost_mark", label: "서리 표식" },
      { kind: "freezing_lock", label: "빙점 봉쇄" },
    ]);
  });

  it("같은 장비 ID를 여러 슬롯에 넣어도 세트 조각 하나로만 센다", () => {
    expect(
      collectUnexploredSetEffects({
        gloves: "v2_unexplored_freezing_lock_gloves",
        boots: "v2_unexplored_freezing_lock_gloves",
      }),
    ).toEqual([]);
  });
});
