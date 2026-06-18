import { describe, expect, it } from "vitest";
import {
  CONCEPT_LABELS,
  SLOT_CONCEPTS,
  V2_EQUIPMENT,
  V2_EQUIP_OPTION_KEYS,
  V2_EQUIP_SETS,
  isUnique,
  parseEquipmentSave,
  powerBandOf,
  POWER_BAND_COUNT,
  setInstanceLock,
  sellPriceOf,
  shopPriceOf,
  shopPriceForSell,
  v2EquipStatRows,
  v2EquipmentBySlot,
  weaponGateOpen,
  weaponTypeOf,
  type V2Equipment,
  type V2EquipConcept,
  type V2EquipmentId,
  type V2EquipSlot,
  type V2EquipTier,
  type V2WeaponType,
} from "./v2Equipment";

describe("무기 속성 폐지 (속성 = 캐릭터 선택/스킬, 무기는 위력 전담)", () => {
  it("모든 장비(무기 포함)에 element 없음 — 평타 속성은 캐릭터 선택으로", () => {
    for (const item of Object.values(V2_EQUIPMENT)) {
      expect(item.element, `${item.id} element 폐지`).toBeUndefined();
    }
  });
});

describe("powerBandOf — 등급 대신 절대 위력 색 구간(부위별 step)", () => {
  // powerBandOf 는 item.slot·item.power 만 읽음 → 최소 객체로 경계 검증.
  const mk = (slot: V2EquipSlot, power: number) =>
    ({ slot, power }) as V2Equipment;

  it("무기는 75 단위로 색 구간 상승", () => {
    expect(powerBandOf(mk("weapon", 0))).toBe(0);
    expect(powerBandOf(mk("weapon", 74))).toBe(0);
    expect(powerBandOf(mk("weapon", 75))).toBe(1);
    expect(powerBandOf(mk("weapon", 149))).toBe(1);
    expect(powerBandOf(mk("weapon", 150))).toBe(2);
  });

  it("부위별 step 차등 — 같은 위력도 부위 따라 구간 다름", () => {
    // 위력 11: 반지(step 5)=floor(11/5)=2, 무기(step 75)=0.
    expect(powerBandOf(mk("ring", 11))).toBe(2);
    expect(powerBandOf(mk("weapon", 11))).toBe(0);
  });

  it("실효 위력 반영 — 굴림으로 오른 위력으로 색 결정(표시 위력과 일치)", () => {
    // 기본 위력 110(무기 step 75) = 옅은보라(1). 굴림 166 이면 보라(2) — 표시 위력 따라 색 상승.
    const w = mk("weapon", 110);
    expect(powerBandOf(w)).toBe(1); // roll 없음 → 카탈로그 110
    expect(powerBandOf(w, { power: 166, weight: 0 })).toBe(2); // 굴림 166 → floor(166/75)=2
    expect(powerBandOf(w, { power: 60, weight: 0 })).toBe(0); // 굴림 60 → floor(60/75)=0
  });

  it("구간은 0…POWER_BAND_COUNT-1 클램프(초고위력도 상한)", () => {
    expect(powerBandOf(mk("weapon", 99999))).toBe(POWER_BAND_COUNT - 1);
    for (const item of Object.values(V2_EQUIPMENT)) {
      const b = powerBandOf(item);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(POWER_BAND_COUNT - 1);
    }
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
const ALL_TIERS: V2EquipTier[] = [1, 2, 3];

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
    .filter(
      (i) =>
        i.concept === concept &&
        !isUnique(i) &&
        !i.craftOnly &&
        !i.starterOnly &&
        !i.noDrop,
    ) // 그리드는 정규만(유니크·제작전용·전문화스타터·밴드 흔한[noDrop] 제외)
    .sort((a, b) => a.tier - b.tier)
    .map((i) => i.tier);
}

// 무기는 weaponType 별 라인(8 전문화타입). 그리드 검증은 컨셉이 아니라 weaponType 으로.
const WEAPON_TYPES: V2WeaponType[] = ["greatsword", "staff", "bow", "dagger"];
// weaponType 라인의 정규 티어(정렬). 스타터·제작·유니크 제외.
function weaponTypeRegularTiers(wt: V2WeaponType): V2EquipTier[] {
  return v2EquipmentBySlot("weapon")
    .filter(
      (i) =>
        i.weaponType === wt &&
        !isUnique(i) &&
        !i.craftOnly &&
        !i.starterOnly &&
        !i.noDrop,
    )
    .map((i) => i.tier)
    .sort((a, b) => a - b);
}
// 정규 + 스타터(전직 지급, T1) 합집합 — 5 신규타입은 스타터가 T1 을 채운다.
function weaponTypeTiersWithStarter(wt: V2WeaponType): V2EquipTier[] {
  const tiers = new Set<V2EquipTier>();
  for (const i of v2EquipmentBySlot("weapon")) {
    if (i.weaponType === wt && !isUnique(i) && !i.craftOnly && !i.noDrop)
      tiers.add(i.tier);
  }
  return [...tiers].sort((a, b) => a - b);
}

describe("V2_EQUIPMENT grid (215종 — 6슬롯)", () => {
  it("정규 그리드 35종 + 유니크 87 + 전문화 스타터 3 (제작전용 0; weaponType 8→4 통합 후)", () => {
    // weaponType 8→4 통합(검방·권갑→대검, 세검·권조→단검) 후 카탈로그 215→179:
    //   정규 그리드 35 = 비무기 24 + 무기 11(대검 3·지팡이 3·활 3 + 단검 정규 2). 무기 8자루 제거.
    //   전문화 스타터 7→3(제거 4타입의 스타터 off-grid 삭제).
    //   밴드 흔한 78→54(밴드당 무기 8→4 = -24, 6밴드).
    //   유니크 87 불변(제거 4타입의 유니크 7자루는 생존 무기군으로 retag — 삭제 X).
    // 총 179 = 정규 35 + 유니크 87 + 전문화 스타터 3 + 밴드 흔한 54.
    const all = Object.values(V2_EQUIPMENT);
    expect(
      all.filter(
        (i) => !isUnique(i) && !i.craftOnly && !i.starterOnly && !i.noDrop,
      ),
      "정규 그리드",
    ).toHaveLength(35);
    expect(all.filter((i) => isUnique(i)), "유니크").toHaveLength(24);
    expect(all.filter((i) => i.craftOnly), "제작전용(제거됨)").toHaveLength(0);
    expect(all.filter((i) => i.starterOnly), "전문화 스타터").toHaveLength(3);
    expect(all.filter((i) => i.noDrop), "밴드 흔한(드랍 전용)").toHaveLength(54);
  });

  it("상점 구매=스타터(T1)만, 판매는 전 티어 — shopPriceOf vs shopPriceForSell", () => {
    const grid = Object.values(V2_EQUIPMENT).filter(
      (i) => !isUnique(i) && !i.craftOnly && !i.starterOnly,
    );
    for (const it of grid) {
      if (it.tier === 1) {
        expect(shopPriceOf(it), `${it.id} T1 구매가능`).toBeGreaterThan(0);
      } else {
        // T3/T5 = 드랍 전용 → 구매 불가
        expect(shopPriceOf(it), `${it.id} T${it.tier} 구매불가`).toBeUndefined();
      }
      // 정규 그리드는 티어 무관 전부 판매 가능(드랍 장비 환금).
      expect(shopPriceForSell(it), `${it.id} 판매가능`).toBeGreaterThan(0);
    }
  });

  it("전 장비 판매 가능 — 유니크·제작전용·수련용도 판매 OK (구매는 여전히 불가)", () => {
    // 2026-06-07 사용자 결정: 인벤 클러터(전직 지급 수련용 등) 정리 위해 전 장비 판매 허용.
    //   실수 판매는 잠금으로 방지. 단 구매(상점 비치)는 여전히 스타터 T1 만.
    const offGrid = Object.values(V2_EQUIPMENT).filter(
      (i) => isUnique(i) || i.craftOnly || i.starterOnly,
    );
    expect(offGrid.length).toBeGreaterThan(0);
    for (const it of offGrid) {
      expect(shopPriceForSell(it), `${it.id} 판매가능`).toBeGreaterThan(0);
      expect(sellPriceOf(it), `${it.id} sellPrice 비-null`).not.toBeNull();
      expect(shopPriceOf(it), `${it.id} 구매불가 유지`).toBeUndefined();
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

  it("정규 그리드 완전성 — 비무기는 (슬롯,컨셉) T1~T5, 무기는 weaponType별 T1~T5", () => {
    // 비무기 슬롯: (슬롯, 컨셉) 라인이 T1~T5 한 종씩.
    for (const slot of ALL_SLOTS) {
      if (slot === "weapon") continue;
      for (const concept of SLOT_CONCEPTS[slot]) {
        expect(slotConceptLine(slot, concept), `${slot}/${concept}`).toEqual(
          ALL_TIERS,
        );
      }
    }
    // 무기: 8 전문화타입별 라인. 정규 티어는 중복 없음 + (정규 ∪ 스타터 T1) = T1~T5.
    // greatsword/bow/staff = 기존 라인 태깅(정규 T1~T5), 5신규타입 = 정규 T2~T5 + 스타터 T1.
    for (const wt of WEAPON_TYPES) {
      const reg = weaponTypeRegularTiers(wt);
      expect(new Set(reg).size, `${wt} 정규 티어 중복`).toBe(reg.length);
      expect(weaponTypeTiersWithStarter(wt), `weapon/${wt}`).toEqual(ALL_TIERS);
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

  it("위력은 라인별 T1→T5 비감소 + 전체로 증가 (비무기=컨셉, 무기=weaponType)", () => {
    // 저위력 슬롯은 정수 plateau(T2=T3 등) 허용 — 차별화는 옵션/무게로.
    // 단 라인 전체로는 T-last > T-first 로 티어 진행이 위력 우상향이어야 함.
    const checkMono = (values: number[], label: string) => {
      for (let i = 1; i < values.length; i++) {
        expect(
          values[i],
          `${label} T${i + 1} 위력 이 T${i} 보다 작음`,
        ).toBeGreaterThanOrEqual(values[i - 1]);
      }
      expect(
        values[values.length - 1],
        `${label} 마지막 위력 이 첫 이하`,
      ).toBeGreaterThan(values[0]);
    };
    // 비무기 슬롯: (슬롯, 컨셉) 라인.
    for (const slot of ALL_SLOTS) {
      if (slot === "weapon") continue;
      for (const concept of SLOT_CONCEPTS[slot]) {
        const values = v2EquipmentBySlot(slot)
          .filter(
            (i) =>
              i.concept === concept &&
              !isUnique(i) &&
              !i.craftOnly &&
              !i.starterOnly,
          )
          .sort((a, b) => a.tier - b.tier)
          .map((i) => i.power);
        checkMono(values, `${slot}/${concept}`);
      }
    }
    // 무기: weaponType 라인(정규만).
    for (const wt of WEAPON_TYPES) {
      const values = v2EquipmentBySlot("weapon")
        .filter(
          (i) =>
            i.weaponType === wt &&
            !isUnique(i) &&
            !i.craftOnly &&
            !i.starterOnly,
        )
        .sort((a, b) => a.tier - b.tier)
        .map((i) => i.power);
      checkMono(values, `weapon/${wt}`);
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
    // 별노래궁: 위력=카탈로그 기준(다이얼 견고), weight 2, crit 2.
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_starsong_bow);
    expect(rows).toEqual([
      { label: "위력", value: `+${V2_EQUIPMENT.v2_starsong_bow.power}` },
      { label: "무게", value: "2" },
      { label: "치명", value: "+2%" },
    ]);
  });

  it("반지 critMult 옵션 — 위력 + 치명피해 배수 표기(+0.12×)", () => {
    // 은가락지 T1: 위력 2(×2), weight 0, critMult 12(백분의일) → "+0.12×".
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_silver_ring);
    expect(rows).toEqual([
      { label: "위력", value: "+2" },
      { label: "치명피해", value: "+0.12×" },
    ]);
  });

  it("mp 옵션은 % 없이 flat", () => {
    // 마나의 정수 T3: 위력 4(×2), weight 0, mp 48 + eva 3 + 회복 8%(SPI gear PR-2).
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_mana_essence);
    expect(rows).toEqual([
      { label: "위력", value: "+4" },
      { label: "회피", value: "+3%" },
      { label: "MP", value: "+48" },
      { label: "회복", value: "+8%" },
    ]);
  });

  it("def 옵션(신설) — 방어 라벨 + flat 표기(+N), 키 등록", () => {
    expect(V2_EQUIP_OPTION_KEYS).toContain("def");
    // 카탈로그 def 아이템은 PR2 에서 추가 — 여기선 표시/키만(임의 옵션 주입).
    const fake = {
      ...V2_EQUIPMENT.v2_mithril_plate,
      options: { def: 20, hp: 40 },
    };
    const rows = v2EquipStatRows(fake);
    expect(rows).toContainEqual({ label: "방어", value: "+20" });
    expect(rows).toContainEqual({ label: "HP", value: "+40" });
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

  it("locked:true 는 보존, false/누락/비boolean 은 미잠금(키 없음)", () => {
    const r = parseEquipmentSave({
      owned: [
        { iid: "a1", id: "v2_iron_sword", locked: true },
        { iid: "b2", id: "v2_iron_sword", locked: false },
        { iid: "c3", id: "v2_iron_sword" },
        { iid: "d4", id: "v2_iron_sword", locked: "yes" },
      ],
    });
    expect(r.owned.find((i) => i.iid === "a1")?.locked).toBe(true);
    // false/누락/비boolean → locked 키 없음(세이브 클린).
    expect(r.owned.find((i) => i.iid === "b2")).not.toHaveProperty("locked");
    expect(r.owned.find((i) => i.iid === "c3")).not.toHaveProperty("locked");
    expect(r.owned.find((i) => i.iid === "d4")).not.toHaveProperty("locked");
  });

  // 티어 5→3 축소 마이그 — 제거된 옛 id(T2/T4)를 잔존 id 로 치환(고아 방지).
  it("제거 id(옛 형식 문자열) → 잔존 id 치환 + 굴림 리셋", () => {
    const r = parseEquipmentSave({
      owned: ["v2_steel_sword", "v2_silver_plate"],
      statRolls: { v2_steel_sword: { power: 99, weight: 9 } },
    });
    expect(r.owned.map((i) => i.id).sort()).toEqual(
      ["v2_greatsword", "v2_mithril_plate"].sort(),
    );
    // 치환분은 굴림 리셋(옛 99 위력 굴림이 새 아이템에 안 붙음).
    expect(r.owned.find((i) => i.id === "v2_greatsword")?.roll).toBeUndefined();
  });

  it("제거 id(신 형식 개체) → id 치환 + iid 보존(장착 정합)", () => {
    const r = parseEquipmentSave({
      owned: [{ iid: "keep1", id: "v2_silver_bow", roll: { power: 50, weight: 0 } }],
      equipped: { weapon: "keep1" }, // iid 로 장착 → 치환 후에도 정합 유지
    });
    expect(r.owned).toHaveLength(1);
    expect(r.owned[0].id).toBe("v2_starsong_bow"); // 치환됨
    expect(r.owned[0].iid).toBe("keep1"); // iid 보존
    expect(r.owned[0].roll).toBeUndefined(); // 치환분 굴림 리셋
    expect(r.equipped.weapon).toBe("keep1"); // 장착 슬롯 정합
  });

  it("제거 id(옛 slot→id 장착 형식) → 치환된 개체로 장착", () => {
    const r = parseEquipmentSave({
      owned: ["v2_gold_ring"],
      equipped: { ring: "v2_gold_ring" }, // 옛 형식: slot→id
    });
    expect(r.owned[0].id).toBe("v2_lucky_charm");
    expect(r.equipped.ring).toBe(r.owned[0].iid); // 치환 개체로 장착됨
  });
});

describe("setInstanceLock", () => {
  const owned = [
    { iid: "a1", id: "v2_iron_sword" as V2EquipmentId },
    { iid: "b2", id: "v2_iron_sword" as V2EquipmentId, locked: true },
  ];

  it("lock=true → 해당 iid 에 locked:true, 나머지 불변", () => {
    const next = setInstanceLock(owned, "a1", true);
    expect(next.find((i) => i.iid === "a1")?.locked).toBe(true);
    expect(next.find((i) => i.iid === "b2")?.locked).toBe(true);
    // 불변(새 배열·새 객체) — 원본 안 깨짐.
    expect(owned[0]).not.toHaveProperty("locked");
  });

  it("lock=false → locked 키 제거(세이브 클린)", () => {
    const next = setInstanceLock(owned, "b2", false);
    expect(next.find((i) => i.iid === "b2")).not.toHaveProperty("locked");
  });

  it("없는 iid → 원본 그대로(값 동일)", () => {
    const next = setInstanceLock(owned, "zzz", true);
    expect(next.map((i) => ({ iid: i.iid, locked: i.locked }))).toEqual(
      owned.map((i) => ({ iid: i.iid, locked: i.locked })),
    );
  });
});

// 전문화 무기 게이트 (docs/v2-job-spec-passives-plan.md §4) — 무기 종류 태깅 + 순수 헬퍼.
describe("무기 종류 게이트 (weaponType / weaponTypeOf / weaponGateOpen)", () => {
  it("weaponTypeOf — 태깅된 무기는 종류 반환, 일반 무기·미장착은 undefined", () => {
    expect(weaponTypeOf("v2_greatsword")).toBe("greatsword"); // 태깅됨
    // 정규 무기는 이제 전부 전문화타입 태깅. 미태깅은 유니크(드랍 전용)뿐.
    expect(weaponTypeOf("v2_uniq_starcleaver")).toBeUndefined(); // 유니크 무기(타입 없음)
    expect(weaponTypeOf(undefined)).toBeUndefined();
    expect(weaponTypeOf(null)).toBeUndefined();
  });

  it("weaponGateOpen — 일치=통과, 불일치/일반무기=차단, required 없으면 항상 통과", () => {
    expect(weaponGateOpen("v2_greatsword", "greatsword")).toBe(true); // 일치
    expect(weaponGateOpen("v2_uniq_starcleaver", "greatsword")).toBe(false); // 미태깅 무기 → 완전 비활성
    expect(weaponGateOpen("v2_greatsword", "staff")).toBe(false); // 다른 무기군
    expect(weaponGateOpen(undefined, "greatsword")).toBe(false); // 미장착
    expect(weaponGateOpen("v2_uniq_starcleaver", undefined)).toBe(true); // 게이트 없는 패시브(베이스)
  });

  it("weaponType 필드는 무기 슬롯에서만 — 방어구·장신구엔 미부여", () => {
    for (const item of Object.values(V2_EQUIPMENT)) {
      if (item.weaponType !== undefined) expect(item.slot).toBe("weapon");
    }
  });
});
