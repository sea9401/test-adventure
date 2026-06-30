import { describe, expect, it } from "vitest";
import {
  CONCEPT_LABELS,
  SLOT_CONCEPTS,
  V2_EQUIPMENT,
  V2_EQUIP_OPTION_KEYS,
  V2_EQUIP_SETS,
  V2_EQUIP_TAG_SETS,
  signatureLabel,
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

describe("powerBandOf — 레거시 절대 위력 구간(부위별 step)", () => {
  // powerBandOf 는 item.slot·item.power 만 읽음 → 최소 객체로 경계 검증.
  const mk = (slot: V2EquipSlot, power: number) =>
    ({ slot, power }) as V2Equipment;

  it("무기는 75 단위로 구간 상승", () => {
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

  it("실효 위력 반영 — 굴림으로 오른 위력으로 구간 결정", () => {
    // 기본 위력 110(무기 step 75)=1. 굴림 166이면 2.
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
const REGULAR_GRID_TIERS: V2EquipTier[] = [1, 2, 3];

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

// 한 (슬롯, 컨셉) 라인의 스타터 정규 티어(T1~T3, 티어 정렬).
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

describe("V2_EQUIPMENT grid (제작 전용 포함 — 6슬롯)", () => {
  it("정규 그리드 29종 + 유니크 36 + 제작전용 14 + 전문화 스타터 3", () => {
    // 누적 정리(무기 8→4 #823 · 세트 38→12 #824 · 장갑/신발 중갑 폐기 · 들판 유니크 6 삭제) 후 카탈로그 104:
    //   정규 그리드 29 = 비무기 18(갑옷 6 + 장갑 3 + 신발 3 + 반지 3 + 목걸이 3) + 무기 11
    //     (대검 3·지팡이 3·활 3 + 단검 정규 2). 장갑/신발 중갑 정규 6자루 제거(경갑 단일).
    //   전문화 스타터 3 · noDrop 105(밴드 흔한 풀 105, 강등된 옛 필드 유니크 포함) · 유니크 36
    //     (고유 아이템 15 + 보스 3). 2026-06-26 유니크 재정의: 옛 필드 유니크 15 → noDrop(일반)·
    //     신규 고유 아이템 15 → unique. 검은 왕도 noDrop 12종 + 고유 5종 추가.
    //     총 187 = 정규 29 + 유니크 36 + 제작전용 14 + 전문화 스타터 3 + noDrop 105.
    const all = Object.values(V2_EQUIPMENT);
    expect(
      all.filter(
        (i) => !isUnique(i) && !i.craftOnly && !i.starterOnly && !i.noDrop,
      ),
      "정규 그리드",
    ).toHaveLength(29);
    expect(all.filter((i) => isUnique(i)), "유니크").toHaveLength(36);
    expect(all.filter((i) => i.craftOnly), "제작전용").toHaveLength(14);
    expect(all.filter((i) => i.starterOnly), "전문화 스타터").toHaveLength(3);
    expect(all.filter((i) => i.noDrop), "noDrop(밴드흔한+강등 필드유니크)").toHaveLength(105);
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

  it("제작 전용 장비는 상점 구매 불가지만 판매가는 가진다", () => {
    const crafted = Object.values(V2_EQUIPMENT).filter((i) => i.craftOnly);
    expect(crafted.map((i) => i.id).sort()).toEqual([
      "v2_crafted_aether_necklace",
      "v2_crafted_astral_grimoire",
      "v2_crafted_aurora_crown",
      "v2_crafted_bulwark_shield",
      "v2_crafted_gale_bow",
      "v2_crafted_kingbreaker_axe",
      "v2_crafted_master_ring",
      "v2_crafted_oathblade",
      "v2_crafted_runic_staff",
      "v2_crafted_spark_gloves",
      "v2_crafted_stormlance",
      "v2_crafted_sunforge_blade",
      "v2_crafted_ward_plate",
      "v2_crafted_windstep_boots",
    ]);
    for (const item of crafted) {
      expect(shopPriceOf(item), `${item.id} 구매불가`).toBeUndefined();
      expect(sellPriceOf(item), `${item.id} 판매가`).toBeGreaterThan(0);
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

  it("태그 세트(V2_EQUIP_TAG_SETS)는 실제 아이템 setTags 와 연결되고 단계가 증가", () => {
    for (const set of V2_EQUIP_TAG_SETS) {
      const pieces = Object.values(V2_EQUIPMENT).filter((item) =>
        item.setTags?.includes(set.id),
      );
      expect(pieces.length, `${set.id} tagged pieces`).toBeGreaterThanOrEqual(3);
      let prev = 0;
      for (const threshold of set.thresholds) {
        expect(threshold.count, `${set.id} threshold order`).toBeGreaterThan(prev);
        expect(Object.keys(threshold.bonus).length, `${set.id} bonus`).toBeGreaterThan(0);
        prev = threshold.count;
      }
    }
  });

  it("제작 전용 장비는 장인표 태그 세트를 6장착 기준으로 구성한다", () => {
    const crafted = Object.values(V2_EQUIPMENT).filter((item) => item.craftOnly);
    expect(crafted).toHaveLength(14);
    expect(crafted.every((item) => item.setTags?.includes("artisan_crafted"))).toBe(
      true,
    );
    const set = V2_EQUIP_TAG_SETS.find((s) => s.id === "artisan_crafted");
    expect(set?.thresholds.map((t) => t.count)).toEqual([2, 4, 6]);
    expect(set?.thresholds.at(-1)?.bonus).toMatchObject({
      hp: 180,
      mp: 120,
      crit: 6,
      eva: 6,
      spd: 9,
      critMult: 24,
      healPowerPct: 4,
    });
  });

  it("제작 전용 장비는 대장간 진행용 짝수 티어에 배치된다", () => {
    const tiers = Object.fromEntries(
      Object.values(V2_EQUIPMENT)
        .filter((item) => item.craftOnly)
        .map((item) => [item.id, item.tier]),
    );
    expect(tiers).toMatchObject({
      v2_crafted_oathblade: 4,
      v2_crafted_gale_bow: 4,
      v2_crafted_runic_staff: 4,
      v2_crafted_spark_gloves: 4,
      v2_crafted_windstep_boots: 4,
      v2_crafted_master_ring: 6,
      v2_crafted_ward_plate: 6,
      v2_crafted_aether_necklace: 6,
      v2_crafted_sunforge_blade: 8,
      v2_crafted_aurora_crown: 10,
    });
  });

  it("제작 전용 장비는 재정립된 티어에 맞는 위력 기준을 가진다", () => {
    expect(V2_EQUIPMENT.v2_crafted_oathblade.power).toBe(72);
    expect(V2_EQUIPMENT.v2_crafted_gale_bow.power).toBe(68);
    expect(V2_EQUIPMENT.v2_crafted_runic_staff.power).toBe(76);
    expect(V2_EQUIPMENT.v2_crafted_ward_plate.power).toBe(64);
    expect(V2_EQUIPMENT.v2_crafted_master_ring.power).toBe(12);
    expect(V2_EQUIPMENT.v2_crafted_aether_necklace.power).toBe(12);
    expect(V2_EQUIPMENT.v2_crafted_sunforge_blade.power).toBe(224);
    expect(V2_EQUIPMENT.v2_crafted_aurora_crown.power).toBe(41);
  });

  it("정규 그리드 완전성 — 비무기는 (슬롯,컨셉) T1~T3, 무기는 weaponType별 T1~T3", () => {
    // 비무기 슬롯: (슬롯, 컨셉) 라인이 스타터 정규 T1~T3 한 종씩.
    for (const slot of ALL_SLOTS) {
      if (slot === "weapon") continue;
      for (const concept of SLOT_CONCEPTS[slot]) {
        expect(slotConceptLine(slot, concept), `${slot}/${concept}`).toEqual(
          REGULAR_GRID_TIERS,
        );
      }
    }
    // 무기: weaponType별 라인. 정규 티어는 중복 없음 + (정규 ∪ 스타터 T1) = T1~T3.
    for (const wt of WEAPON_TYPES) {
      const reg = weaponTypeRegularTiers(wt);
      expect(new Set(reg).size, `${wt} 정규 티어 중복`).toBe(reg.length);
      expect(weaponTypeTiersWithStarter(wt), `weapon/${wt}`).toEqual(
        REGULAR_GRID_TIERS,
      );
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
              !i.starterOnly &&
              !i.noDrop, // 정규 그리드(T1→T5)만 — 밴드 흔한·강등 사이드그레이드(noDrop)는 제외.
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
            !i.starterOnly &&
            !i.noDrop, // 정규 그리드만 — 밴드 흔한·강등 사이드그레이드(noDrop) 제외.
        )
        .sort((a, b) => a.tier - b.tier)
        .map((i) => i.power);
      checkMono(values, `weapon/${wt}`);
    }
  });

  it("tier 값이 1~12 범위 안에 있고 정수", () => {
    for (const item of Object.values(V2_EQUIPMENT)) {
      expect(Number.isInteger(item.tier)).toBe(true);
      expect(item.tier).toBeGreaterThanOrEqual(1);
      expect(item.tier).toBeLessThanOrEqual(12);
    }
  });
});

describe("v2EquipStatRows (표시 행)", () => {
  it("기본 전투 스탯 → 무게 → 옵션 순, 0 은 생략", () => {
    // 별노래궁(무기): 위력=카탈로그 기준, weight 2 → 표시 ×4=8(WEAPON_WEIGHT_SCALE), crit 2.
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_starsong_bow);
    expect(rows).toEqual([
      { label: "공격력", value: `+${V2_EQUIPMENT.v2_starsong_bow.power}` },
      { label: "무게", value: "8" },
      { label: "치명", value: "+2%" },
    ]);
  });

  it("지팡이는 마법 공격력으로 표시한다", () => {
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_oak_staff);
    expect(rows[0]).toEqual({
      label: "마법 공격력",
      value: `+${V2_EQUIPMENT.v2_oak_staff.power}`,
    });
  });

  it("반지 critMult 옵션 — 마법 방어력 + 치명피해 배수 표기(+0.12×)", () => {
    // 은가락지 T1: 위력 2(×2), weight 0, critMult 12(백분의일) → "+0.12×".
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_silver_ring);
    expect(rows).toEqual([
      { label: "마법 방어력", value: "+2" },
      { label: "치명피해", value: "+0.12×" },
    ]);
  });

  it("mp 옵션은 % 없이 flat", () => {
    // 마나의 정수 T3: 위력 4(×2), weight 0, mp 48 + eva 3 + 회복 8%(SPI gear PR-2).
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_mana_essence);
    expect(rows).toEqual([
      { label: "마법 방어력", value: "+4" },
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

  it("굴림(roll) 주면 굴림값 표시 — 별노래궁(무기) 굴림(16/1/crit3), 무게 ×4=4", () => {
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_starsong_bow, {
      power: 16,
      weight: 1,
      options: { crit: 3 },
    });
    expect(rows).toEqual([
      { label: "공격력", value: "+16" },
      { label: "무게", value: "4" },
      { label: "치명", value: "+3%" },
    ]);
  });
});

describe("parseEquipmentSave (개체 instance 모델)", () => {
  it("null/undefined → 빈 결과", () => {
    expect(parseEquipmentSave(null)).toEqual({ owned: [], equipped: {} });
    expect(parseEquipmentSave(undefined)).toEqual({ owned: [], equipped: {} });
  });

  it("owned 의 알 수 없는 id 개체·비객체는 제거", () => {
    const r = parseEquipmentSave({
      owned: [
        { iid: "a", id: "v2_iron_sword" },
        { iid: "b", id: "v2_fake_item" },
        42,
        null,
      ],
    });
    expect(r.owned.map((i) => i.id)).toEqual(["v2_iron_sword"]);
  });

  it("equipped 가 slot→id(방어적 폴백)면 보유 개체 iid 로 해석, 미보유는 제외", () => {
    const r = parseEquipmentSave({
      owned: [{ iid: "w0", id: "v2_iron_sword" }],
      equipped: { weapon: "v2_iron_sword", armor: "v2_leather_armor" },
    });
    expect(r.equipped).toEqual({ weapon: "w0" });
  });

  it("stored slot 무시·카탈로그 슬롯 배치(3→6), accessory→ring, iid 매핑", () => {
    const r = parseEquipmentSave({
      owned: [
        { iid: "w0", id: "v2_iron_sword" },
        { iid: "r0", id: "v2_silver_ring" },
        { iid: "n0", id: "v2_jade_amulet" },
      ],
      equipped: {
        armor: "v2_iron_sword",
        accessory: "v2_silver_ring",
      },
    });
    expect(r.equipped).toEqual({
      weapon: "w0",
      ring: "r0",
    });
  });

  it("roll 클램프·옵션 정수·무효 roll 드롭(개체는 남음)", () => {
    const r = parseEquipmentSave({
      owned: [
        { iid: "a", id: "v2_iron_sword", roll: { power: 4, weight: 1 } },
        {
          iid: "b",
          id: "v2_starsong_bow",
          roll: { power: 16, weight: 2, options: { crit: 3, bad: 9 } },
        },
        { iid: "c", id: "v2_silver_ring", roll: { power: -5, weight: -2 } }, // 클램프 → 1, 0
        { iid: "d", id: "v2_iron_sword", roll: { weight: 2 } }, // power 없음 → roll 드롭
      ],
    });
    const rollByIid = Object.fromEntries(r.owned.map((i) => [i.iid, i.roll]));
    expect(rollByIid.a).toEqual({ power: 4, weight: 1 });
    expect(rollByIid.b).toEqual({
      power: 16,
      weight: 2,
      options: { crit: 3 }, // 허용 키만(bad 제거)
    });
    expect(rollByIid.c).toEqual({ power: 1, weight: 0 });
    expect(rollByIid.d).toBeUndefined();
    expect(r.owned).toHaveLength(4);
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

  it("craftedBy 제작자 표식을 보존하고 정규화", () => {
    const r = parseEquipmentSave({
      owned: [
        {
          iid: "a1",
          id: "v2_iron_sword",
          craftedBy: {
            userId: "u1",
            name: "  장인  ",
            profession: "blacksmith",
            level: 2.9,
            craftedAt: "2026-06-29T00:00:00.000Z",
            masterwork: true,
          },
        },
        {
          iid: "b2",
          id: "v2_iron_sword",
          craftedBy: { userId: "u2", profession: "alchemy", level: 9 },
        },
      ],
    });
    expect(r.owned[0].craftedBy).toEqual({
      userId: "u1",
      name: "장인",
      profession: "blacksmith",
      level: 2,
      craftedAt: "2026-06-29T00:00:00.000Z",
      masterwork: true,
    });
    expect(r.owned[1].craftedBy).toBeUndefined();
  });

  it("legacy crafted quality enhance is migrated to craftQuality", () => {
    const r = parseEquipmentSave({
      owned: [
        {
          iid: "crafted",
          id: "v2_iron_sword",
          enhance: { level: 1, bonusPct: 5 },
          craftedBy: {
            userId: "u1",
            profession: "blacksmith",
            level: 8,
            craftedAt: "2026-06-29T00:00:00.000Z",
          },
        },
        {
          iid: "normal",
          id: "v2_iron_sword",
          enhance: { level: 1, bonusPct: 5 },
        },
      ],
    });

    expect(r.owned.find((i) => i.iid === "crafted")?.craftQuality).toEqual({
      level: 1,
      bonusPct: 5,
    });
    expect(r.owned.find((i) => i.iid === "crafted")?.enhance).toBeUndefined();
    expect(r.owned.find((i) => i.iid === "normal")?.enhance).toEqual({
      level: 1,
      bonusPct: 2,
    });
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
  it("weaponTypeOf — 태깅된 무기는 종류 반환, 비무기·미장착은 undefined", () => {
    expect(weaponTypeOf("v2_greatsword")).toBe("greatsword"); // 태깅됨
    expect(weaponTypeOf("v2_toxic_dagger")).toBe("dagger"); // 태깅됨(단검)
    // 무기는 이제 전부 전문화타입 태깅(들판 유니크 삭제 후). 비무기는 weaponType 없음.
    expect(weaponTypeOf("v2_leather_armor")).toBeUndefined(); // 비무기(방어구)
    expect(weaponTypeOf(undefined)).toBeUndefined();
    expect(weaponTypeOf(null)).toBeUndefined();
  });

  it("weaponGateOpen — 일치=통과, 타입 불일치/비무기=차단, required 없으면 항상 통과", () => {
    expect(weaponGateOpen("v2_greatsword", "greatsword")).toBe(true); // 일치
    expect(weaponGateOpen("v2_toxic_dagger", "greatsword")).toBe(false); // 타입 불일치(단검≠대검) → 완전 비활성
    expect(weaponGateOpen("v2_greatsword", "staff")).toBe(false); // 다른 무기군
    expect(weaponGateOpen("v2_leather_armor", "greatsword")).toBe(false); // 비무기
    expect(weaponGateOpen(undefined, "greatsword")).toBe(false); // 미장착
    expect(weaponGateOpen("v2_greatsword", undefined)).toBe(true); // 게이트 없는 패시브(베이스)
  });

  it("weaponType 필드는 무기 슬롯에서만 — 방어구·장신구엔 미부여", () => {
    for (const item of Object.values(V2_EQUIPMENT)) {
      if (item.weaponType !== undefined) expect(item.slot).toBe("weapon");
    }
  });
});

describe("signatureLabel (시그니처 효과 표기·툴팁용)", () => {
  it("트리거별 한국어 한 줄 — 11 효과", () => {
    expect(
      signatureLabel({
        trigger: "battle_start",
        label: "검은 왕좌",
        battleStartShieldPctMaxHp: 12,
      }),
    ).toBe("전투 시작 시 최대 HP의 12% 보호막");
    expect(
      signatureLabel({
        trigger: "low_hp",
        label: "성물",
        hpThresholdPct: 30,
        damageTakenReductionPct: 25,
      }),
    ).toBe("체력 30% 이하일 때 받는 피해 −25%");
    expect(
      signatureLabel({ trigger: "on_heal", label: "묵주", healToShieldPct: 25 }),
    ).toBe("회복 시 회복량의 25% 보호막");
    expect(
      signatureLabel({ trigger: "every_n_hits", label: "포식자", everyNHits: 3 }),
    ).toBe("3타마다 추가타 1회");
    expect(
      signatureLabel({
        trigger: "on_dodge",
        label: "독왕",
        spdBuffPct: 25,
        buffActions: 3,
      }),
    ).toBe("회피 시 속도 +25% (3행동)");
    expect(
      signatureLabel({ trigger: "on_dodge", label: "봉인", healPct: 8 }),
    ).toBe("회피 시 HP +8% 회복");
    expect(
      signatureLabel({ trigger: "on_crit", label: "독니", poisonOnCrit: true }),
    ).toBe("치명타 시 대상 중독(독)");
    expect(
      signatureLabel({
        trigger: "on_crit",
        label: "군림",
        spdBuffPct: 20,
        buffActions: 2,
      }),
    ).toBe("치명타 시 속도 +20% (2행동)");
    expect(
      signatureLabel({
        trigger: "on_hit_taken",
        label: "백왕좌",
        defGainOnHitPct: 35,
      }),
    ).toBe("피격 시 받은 HP 피해의 35%만큼 방어 상승");
    expect(
      signatureLabel({
        trigger: "on_skill_cast",
        label: "왕릉성",
        mpRefundPctOfCost: 25,
      }),
    ).toBe("스킬 사용 시 소모 MP의 25% 환급");
    expect(
      signatureLabel({
        trigger: "status_block_once",
        label: "공허왕관",
        statusBlockOnce: true,
      }),
    ).toBe("전투당 1회 상태이상 무효");
  });

  it("세트/단품 카탈로그 시그니처 전부 비어있지 않은 표기", () => {
    for (const s of V2_EQUIP_SETS) {
      if (s.signature) expect(signatureLabel(s.signature).length).toBeGreaterThan(0);
    }
    for (const it of Object.values(V2_EQUIPMENT)) {
      if (it.signature)
        expect(signatureLabel(it.signature).length).toBeGreaterThan(0);
    }
  });
});
