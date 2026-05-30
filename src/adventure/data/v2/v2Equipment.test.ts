import { describe, expect, it } from "vitest";
import {
  CONCEPT_LABELS,
  SLOT_CONCEPTS,
  V2_EQUIPMENT,
  V2_EQUIP_OPTION_KEYS,
  parseEquipmentSave,
  v2EquipStatRows,
  v2EquipmentByConcept,
  v2EquipmentBySlot,
  type V2EquipConcept,
  type V2EquipmentId,
  type V2EquipSlot,
  type V2EquipTier,
} from "./v2Equipment";

const ALL_SLOTS: V2EquipSlot[] = ["weapon", "armor", "accessory"];
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

  it("무게 0 인 슬롯 정합 — 장신구는 전부 무게 0", () => {
    for (const item of v2EquipmentBySlot("accessory")) {
      expect(item.weight, `${item.id} 장신구 무게`).toBe(0);
    }
  });
});

describe("V2_EQUIPMENT grid (35종 — 7컨셉 × T1~T5)", () => {
  it("총 35종", () => {
    expect(Object.keys(V2_EQUIPMENT)).toHaveLength(35);
  });

  it("모든 컨셉이 T1~T5 정확히 한 종씩", () => {
    for (const concept of ALL_CONCEPTS) {
      const items = v2EquipmentByConcept(concept);
      expect(items, `concept=${concept}`).toHaveLength(5);
      const tiers = items.map((i) => i.tier);
      expect(tiers).toEqual(ALL_TIERS);
    }
  });

  it("SLOT_CONCEPTS 와 카탈로그의 슬롯-컨셉 매핑이 일관", () => {
    for (const slot of ALL_SLOTS) {
      for (const concept of SLOT_CONCEPTS[slot]) {
        for (const item of v2EquipmentByConcept(concept)) {
          expect(item.slot, `${item.id} 의 slot 이 SLOT_CONCEPTS 와 불일치`).toBe(
            slot,
          );
        }
      }
    }
  });

  it("CONCEPT_LABELS 가 ALL_CONCEPTS 와 동일 키셋", () => {
    expect(new Set(Object.keys(CONCEPT_LABELS))).toEqual(new Set(ALL_CONCEPTS));
  });

  it("같은 컨셉의 위력은 T1→T5 비감소 + 전체로 증가", () => {
    // 저위력 장신구·경갑은 정수 plateau(T2=T3 등) 허용 — 차별화는 옵션/무게로.
    // 단 컨셉 전체로는 T5 > T1 로 티어 진행이 위력 우상향이어야 함.
    for (const concept of ALL_CONCEPTS) {
      const items = v2EquipmentByConcept(concept);
      const values = items.map((i) => i.power);
      for (let i = 1; i < values.length; i++) {
        expect(
          values[i],
          `${concept} T${i + 1} 위력 이 T${i} 보다 작음`,
        ).toBeGreaterThanOrEqual(values[i - 1]);
      }
      expect(
        values[values.length - 1],
        `${concept} T5 위력 이 T1 이하`,
      ).toBeGreaterThan(values[0]);
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
    // 별노래궁 T5: power 14, weight 2, crit 2.
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_starsong_bow);
    expect(rows).toEqual([
      { label: "위력", value: "+14" },
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
    // 마나의 정수 T5: power 3, weight 0, mp 30.
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_mana_essence);
    expect(rows).toEqual([
      { label: "위력", value: "+3" },
      { label: "MP", value: "+30" },
    ]);
  });
});

describe("parseEquipmentSave", () => {
  it("null/undefined → 빈 결과", () => {
    expect(parseEquipmentSave(null)).toEqual({ owned: [], equipped: {} });
    expect(parseEquipmentSave(undefined)).toEqual({ owned: [], equipped: {} });
  });

  it("owned 의 중복은 보존된다 (등장 횟수 = 보유 카운트)", () => {
    const r = parseEquipmentSave({
      owned: ["v2_iron_sword", "v2_iron_sword", "v2_leather_armor"],
    });
    expect(r.owned).toEqual([
      "v2_iron_sword",
      "v2_iron_sword",
      "v2_leather_armor",
    ]);
  });

  it("owned 의 알 수 없는 id 는 제거", () => {
    const r = parseEquipmentSave({
      owned: ["v2_iron_sword", "v2_fake_item", 42, null],
    });
    expect(r.owned).toEqual(["v2_iron_sword"]);
  });

  it("equipped 는 보유한 아이템만 인정 (race 보정)", () => {
    const r = parseEquipmentSave({
      owned: ["v2_iron_sword"],
      equipped: { weapon: "v2_iron_sword", armor: "v2_leather_armor" },
    });
    expect(r.equipped).toEqual({ weapon: "v2_iron_sword" });
  });

  it("equipped 의 slot mismatch 는 거절", () => {
    const r = parseEquipmentSave({
      owned: ["v2_iron_sword"],
      // 무기를 방어구 슬롯에 박으면 거절
      equipped: { armor: "v2_iron_sword" },
    });
    expect(r.equipped).toEqual({});
  });

  it("정상 raw 는 그대로 통과", () => {
    const raw = {
      owned: ["v2_iron_sword", "v2_chain_mail", "v2_jade_amulet"],
      equipped: {
        weapon: "v2_iron_sword",
        armor: "v2_chain_mail",
        accessory: "v2_jade_amulet",
      },
    };
    const r = parseEquipmentSave(raw);
    expect(r.owned).toEqual(raw.owned);
    expect(r.equipped).toEqual(raw.equipped);
  });

  it("equipped 의 알 수 없는 슬롯 키는 무시", () => {
    const r = parseEquipmentSave({
      owned: ["v2_iron_sword"],
      equipped: {
        weapon: "v2_iron_sword",
        boots: "v2_iron_sword",
      } as Record<string, V2EquipmentId>,
    });
    expect(r.equipped).toEqual({ weapon: "v2_iron_sword" });
  });
});
