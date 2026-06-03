import { describe, expect, it } from "vitest";
import {
  CONCEPT_LABELS,
  SLOT_CONCEPTS,
  V2_EQUIPMENT,
  V2_EQUIP_OPTION_KEYS,
  V2_EQUIP_SETS,
  isUnique,
  parseEquipmentSave,
  shopPriceOf,
  v2EquipStatRows,
  v2EquipmentByConcept,
  v2EquipmentBySlot,
  weaponGateOpen,
  weaponTypeOf,
  type V2EquipConcept,
  type V2EquipmentId,
  type V2EquipSlot,
  type V2EquipTier,
} from "./v2Equipment";
import { V2_ELEMENTS, V2_ELEMENT_CYCLE } from "./elements";

describe("무기 속성 전면 태깅", () => {
  it("무기 element 는 유효 V2Element, 방어구·장신구는 element 없음", () => {
    for (const item of Object.values(V2_EQUIPMENT)) {
      if (item.element !== undefined) {
        expect(V2_ELEMENTS, `${item.id}`).toContain(item.element);
      }
      // element 는 무기 슬롯에만 의미 — 방어구·장신구엔 미부여.
      if (item.slot !== "weapon") {
        expect(item.element, `${item.id} 비무기 element`).toBeUndefined();
      }
    }
  });

  it("무기 속성이 7-ring 전부 커버 + 일부 무속성(starter)", () => {
    const weaponEls = v2EquipmentBySlot("weapon")
      .map((w) => w.element)
      .filter((e): e is NonNullable<typeof e> => Boolean(e));
    const set = new Set(weaponEls);
    for (const e of V2_ELEMENT_CYCLE) {
      expect(set.has(e), `무기에 ${e} 없음`).toBe(true);
    }
    // 무속성 무기(저티어 starter)도 존재 — 캐릭 속성 선택 살림.
    expect(v2EquipmentBySlot("weapon").some((w) => !w.element)).toBe(true);
  });
});

const ALL_SLOTS: V2EquipSlot[] = [
  "weapon",
  "armor",
  "gloves",
  "boots",
  "ring",
  "necklace",
];
const ALL_CONCEPTS: V2EquipConcept[] = [
  "str",
  "dex",
  "int",
  "heavy",
  "light",
  "luck",
  "mana",
];
const ALL_TIERS: V2EquipTier[] = [1, 2, 3, 4, 5];

describe("V2_EQUIPMENT catalog", () => {
  it("모든 id 는 키와 일치해야 함 (self-id 일관성)", () => {
    for (const [key, item] of Object.entries(V2_EQUIPMENT)) {
      expect(item.id).toBe(key);
    }
  });

  it("모든 슬롯은 유효한 값이어야 함", () => {
    for (const item of Object.values(V2_EQUIPMENT)) {
      expect(ALL_SLOTS).toContain(item.slot);
    }
  });

  it("v2EquipmentBySlot 가 슬롯 일치 아이템만 반환", () => {
    for (const slot of ALL_SLOTS) {
      const items = v2EquipmentBySlot(slot);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.slot).toBe(slot);
      }
    }
  });

  it("모든 항목은 위력 ≥ 1 (유한 정수)", () => {
    for (const item of Object.values(V2_EQUIPMENT)) {
      expect(Number.isInteger(item.power), `${item.id}.power`).toBe(true);
      expect(item.power, `${item.id}.power`).toBeGreaterThanOrEqual(1);
    }
  });

  it("모든 항목의 무게는 ≥ 0 유한 정수", () => {
    for (const item of Object.values(V2_EQUIPMENT)) {
      expect(Number.isInteger(item.weight), `${item.id}.weight`).toBe(true);
      expect(item.weight, `${item.id}.weight`).toBeGreaterThanOrEqual(0);
    }
  });

  it("옵션은 허용 키(crit/eva/mp/hp)만, 값은 유한 정수", () => {
    const allowed = new Set<string>(V2_EQUIP_OPTION_KEYS);
    for (const item of Object.values(V2_EQUIPMENT)) {
      if (!item.options) continue;
      for (const [k, v] of Object.entries(item.options)) {
        expect(allowed.has(k), `${item.id}.options.${k} 가 허용 키가 아님`).toBe(
          true,
        );
        expect(Number.isFinite(v), `${item.id}.options.${k}`).toBe(true);
        expect(Number.isInteger(v), `${item.id}.options.${k}`).toBe(true);
      }
    }
  });

  it("무게 0 인 슬롯 정합 — 반지·목걸이는 전부 무게 0", () => {
    for (const item of [
      ...v2EquipmentBySlot("ring"),
      ...v2EquipmentBySlot("necklace"),
    ]) {
      expect(item.weight, `${item.id} 장신구 무게`).toBe(0);
    }
  });
});

// 한 (슬롯, 컨셉) 라인의 T1~T5 (티어 정렬).
function slotConceptLine(
  slot: V2EquipSlot,
  concept: V2EquipConcept,
): V2EquipTier[] {
  return v2EquipmentBySlot(slot)
    .filter((i) => i.concept === concept && !isUnique(i) && !i.craftOnly) // 그리드는 정규만(유니크·제작전용 제외)
    .sort((a, b) => a.tier - b.tier)
    .map((i) => i.tier);
}

describe("V2_EQUIPMENT grid (55종 — 6슬롯)", () => {
  it("정규 그리드 55종 + 유니크 6 + 제작전용 7 (그리드 밖)", () => {
    const all = Object.values(V2_EQUIPMENT);
    expect(
      all.filter((i) => !isUnique(i) && !i.craftOnly),
      "정규 그리드",
    ).toHaveLength(55);
    expect(all.filter((i) => isUnique(i)), "유니크").toHaveLength(6);
    expect(all.filter((i) => i.craftOnly), "제작전용").toHaveLength(7);
  });

  it("제작전용(craftOnly) 은 상점 비매품 (shopPriceOf undefined)", () => {
    const craftOnly = Object.values(V2_EQUIPMENT).filter((i) => i.craftOnly);
    expect(craftOnly.length).toBe(7);
    for (const it of craftOnly) {
      expect(shopPriceOf(it), `${it.id} 비매품`).toBeUndefined();
      expect(isUnique(it), `${it.id} 유니크아님`).toBe(false);
    }
  });

  it("세트(V2_EQUIP_SETS) 조각 id 가 전부 실재 + setId 일치", () => {
    for (const set of V2_EQUIP_SETS) {
      expect(set.pieces.length).toBeGreaterThanOrEqual(2);
      for (const id of set.pieces) {
        const item = V2_EQUIPMENT[id];
        expect(item, `${set.id} → ${id} 실재`).toBeDefined();
        expect(item.setId, `${id} setId`).toBe(set.id);
      }
    }
  });

  it("각 (슬롯, 컨셉) 조합이 T1~T5 정확히 한 종씩", () => {
    for (const slot of ALL_SLOTS) {
      for (const concept of SLOT_CONCEPTS[slot]) {
        expect(slotConceptLine(slot, concept), `${slot}/${concept}`).toEqual(
          ALL_TIERS,
        );
      }
    }
  });

  it("모든 아이템의 컨셉은 그 슬롯의 SLOT_CONCEPTS 안", () => {
    for (const item of Object.values(V2_EQUIPMENT)) {
      expect(
        SLOT_CONCEPTS[item.slot],
        `${item.id} concept=${item.concept} 이 slot ${item.slot} 에 없음`,
      ).toContain(item.concept);
    }
  });

  it("CONCEPT_LABELS 가 ALL_CONCEPTS 와 동일 키셋", () => {
    expect(new Set(Object.keys(CONCEPT_LABELS))).toEqual(new Set(ALL_CONCEPTS));
  });

  it("각 (슬롯, 컨셉)의 위력은 T1→T5 비감소 + 전체로 증가", () => {
    // 저위력 슬롯은 정수 plateau(T2=T3 등) 허용 — 차별화는 옵션/무게로.
    // 단 라인 전체로는 T5 > T1 로 티어 진행이 위력 우상향이어야 함.
    for (const slot of ALL_SLOTS) {
      for (const concept of SLOT_CONCEPTS[slot]) {
        const values = v2EquipmentBySlot(slot)
          .filter((i) => i.concept === concept && !isUnique(i) && !i.craftOnly) // 그리드는 정규만
          .sort((a, b) => a.tier - b.tier)
          .map((i) => i.power);
        for (let i = 1; i < values.length; i++) {
          expect(
            values[i],
            `${slot}/${concept} T${i + 1} 위력 이 T${i} 보다 작음`,
          ).toBeGreaterThanOrEqual(values[i - 1]);
        }
        expect(
          values[values.length - 1],
          `${slot}/${concept} T5 위력 이 T1 이하`,
        ).toBeGreaterThan(values[0]);
      }
    }
  });

  it("tier 값이 1~5 범위 안에 있고 정수", () => {
    for (const item of Object.values(V2_EQUIPMENT)) {
      expect(Number.isInteger(item.tier)).toBe(true);
      expect(item.tier).toBeGreaterThanOrEqual(1);
      expect(item.tier).toBeLessThanOrEqual(5);
    }
  });
});

describe("v2EquipStatRows (표시 행)", () => {
  it("위력 → 무게 → 옵션 순, 0 은 생략", () => {
    // 별노래궁 T5: power 26, weight 2, crit 2.
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_starsong_bow);
    expect(rows).toEqual([
      { label: "위력", value: "+26" },
      { label: "무게", value: "2" },
      { label: "치명", value: "+2%" },
    ]);
  });

  it("무게 0·옵션 없음 → 위력 행만", () => {
    // 은가락지 T1: power 1, weight 0, 옵션 없음.
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_silver_ring);
    expect(rows).toEqual([{ label: "위력", value: "+1" }]);
  });

  it("mp 옵션은 % 없이 flat", () => {
    // 마나의 정수 T5: power 2, weight 0, mp 30.
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_mana_essence);
    expect(rows).toEqual([
      { label: "위력", value: "+2" },
      { label: "MP", value: "+30" },
    ]);
  });

  it("굴림(roll) 주면 굴림값 표시 — 별노래궁 카탈로그(14/2/crit2) → 굴림(16/1/crit3)", () => {
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_starsong_bow, {
      power: 16,
      weight: 1,
      options: { crit: 3 },
    });
    expect(rows).toEqual([
      { label: "위력", value: "+16" },
      { label: "무게", value: "1" },
      { label: "치명", value: "+3%" },
    ]);
  });
});

describe("parseEquipmentSave (개체 instance 모델)", () => {
  it("null/undefined → 빈 결과", () => {
    expect(parseEquipmentSave(null)).toEqual({ owned: [], equipped: {} });
    expect(parseEquipmentSave(undefined)).toEqual({ owned: [], equipped: {} });
  });

  it("옛 id[] owned → 개체 마이그(결정적 iid `id~n`), 중복 보존, 굴림 이식", () => {
    const r = parseEquipmentSave({
      owned: ["v2_iron_sword", "v2_iron_sword", "v2_leather_armor"],
      statRolls: { v2_iron_sword: { power: 4, weight: 1 } },
    });
    expect(r.owned).toEqual([
      {
        iid: "v2_iron_sword~0",
        id: "v2_iron_sword",
        roll: { power: 4, weight: 1 },
      },
      {
        iid: "v2_iron_sword~1",
        id: "v2_iron_sword",
        roll: { power: 4, weight: 1 },
      },
      { iid: "v2_leather_armor~0", id: "v2_leather_armor" },
    ]);
  });

  it("owned 의 알 수 없는 id 는 제거", () => {
    const r = parseEquipmentSave({
      owned: ["v2_iron_sword", "v2_fake_item", 42, null],
    });
    expect(r.owned.map((i) => i.id)).toEqual(["v2_iron_sword"]);
  });

  it("옛 equipped(slot→id) → 보유 개체 iid 로 마이그, 미보유는 제외", () => {
    const r = parseEquipmentSave({
      owned: ["v2_iron_sword"],
      equipped: { weapon: "v2_iron_sword", armor: "v2_leather_armor" },
    });
    expect(r.equipped).toEqual({ weapon: "v2_iron_sword~0" });
  });

  it("stored slot 무시·카탈로그 슬롯 배치(3→6), accessory→ring/necklace, iid 매핑", () => {
    const r = parseEquipmentSave({
      owned: ["v2_iron_sword", "v2_silver_ring", "v2_jade_amulet"],
      equipped: {
        armor: "v2_iron_sword",
        accessory: "v2_silver_ring",
      },
    });
    expect(r.equipped).toEqual({
      weapon: "v2_iron_sword~0",
      ring: "v2_silver_ring~0",
    });
  });

  it("옛 statRolls → 개체 roll 이식(클램프·옵션 정수·무효는 roll 없음)", () => {
    const r = parseEquipmentSave({
      owned: [
        "v2_iron_sword",
        "v2_starsong_bow",
        "v2_silver_ring",
        "v2_steel_sword",
      ],
      statRolls: {
        v2_iron_sword: { power: 4, weight: 1 },
        v2_starsong_bow: { power: 16, weight: 2, options: { crit: 3, bad: 9 } },
        v2_silver_ring: { power: -5, weight: -2 }, // 클램프 → 1, 0
        v2_steel_sword: { weight: 2 }, // power 없음 → roll 드롭(개체는 남음)
      },
    });
    const rollById = Object.fromEntries(r.owned.map((i) => [i.id, i.roll]));
    expect(rollById.v2_iron_sword).toEqual({ power: 4, weight: 1 });
    expect(rollById.v2_starsong_bow).toEqual({
      power: 16,
      weight: 2,
      options: { crit: 3 }, // 허용 키만(bad 제거)
    });
    expect(rollById.v2_silver_ring).toEqual({ power: 1, weight: 0 });
    expect(rollById.v2_steel_sword).toBeUndefined();
  });

  it("신 형식 — 개체(iid/id/roll)·equipped(slot→iid) 보존", () => {
    const r = parseEquipmentSave({
      owned: [
        { iid: "a1", id: "v2_iron_sword", roll: { power: 7, weight: 1 } },
        { iid: "b2", id: "v2_iron_sword" },
      ],
      equipped: { weapon: "b2" },
    });
    expect(r.owned).toEqual([
      { iid: "a1", id: "v2_iron_sword", roll: { power: 7, weight: 1 } },
      { iid: "b2", id: "v2_iron_sword" },
    ]);
    expect(r.equipped).toEqual({ weapon: "b2" });
  });

  it("신 형식 — 알 수 없는 id 개체 제거", () => {
    const r = parseEquipmentSave({
      owned: [
        { iid: "a1", id: "v2_fake" },
        { iid: "b2", id: "v2_iron_sword" },
      ],
    });
    expect(r.owned.map((i) => i.id)).toEqual(["v2_iron_sword"]);
  });
});

// 계파 무기 게이트 (docs/v2-job-spec-passives-plan.md §4) — 무기 종류 태깅 + 순수 헬퍼.
describe("무기 종류 게이트 (weaponType / weaponTypeOf / weaponGateOpen)", () => {
  it("weaponTypeOf — 태깅된 무기는 종류 반환, 일반 무기·미장착은 undefined", () => {
    expect(weaponTypeOf("v2_greatsword")).toBe("greatsword"); // 태깅됨
    expect(weaponTypeOf("v2_iron_sword")).toBeUndefined(); // 일반 무기(타입 없음)
    expect(weaponTypeOf(undefined)).toBeUndefined();
    expect(weaponTypeOf(null)).toBeUndefined();
  });

  it("weaponGateOpen — 일치=통과, 불일치/일반무기=차단, required 없으면 항상 통과", () => {
    expect(weaponGateOpen("v2_greatsword", "greatsword")).toBe(true); // 일치
    expect(weaponGateOpen("v2_iron_sword", "greatsword")).toBe(false); // 일반 무기 → 완전 비활성
    expect(weaponGateOpen("v2_greatsword", "rapier")).toBe(false); // 다른 계파 무기
    expect(weaponGateOpen(undefined, "greatsword")).toBe(false); // 미장착
    expect(weaponGateOpen("v2_iron_sword", undefined)).toBe(true); // 게이트 없는 패시브(베이스)
  });

  it("weaponType 필드는 무기 슬롯에서만 — 방어구·장신구엔 미부여", () => {
    for (const item of Object.values(V2_EQUIPMENT)) {
      if (item.weaponType !== undefined) expect(item.slot).toBe("weapon");
    }
  });
});
