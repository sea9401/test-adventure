import { describe, expect, it } from "vitest";
import {
  CRAFTED_EQUIP_TAG_SET_IDS,
  CONCEPT_LABELS,
  SLOT_CONCEPTS,
  V2_EQUIPMENT,
  V2_EQUIP_DISPLAY_TIER_SOURCE_LABEL,
  V2_EQUIP_OPTION_KEYS,
  V2_EQUIP_SETS,
  V2_EQUIP_TAG_SETS,
  V2_EQUIP_CATALOG_TIER_ORDER,
  ENHANCE_DISPLAY_TIER_6_COST_PREMIUM,
  TIER_6_POWER_SCALE_VERSION,
  enhanceGoldCostForEquipment,
  enhancePowerForCost,
  enhancementResetError,
  signatureLabel,
  isUnique,
  parseEquipmentSave,
  powerBandOf,
  POWER_BAND_COUNT,
  resetInstanceEnhancement,
  setInstanceLock,
  sellPriceOf,
  shopPriceOf,
  shopPriceForSell,
  v2EquipCatalogTierToDisplayTier,
  v2EquipStatRows,
  v2EquipCatalogTierDisplayLabel,
  v2EquipmentBySlot,
  weaponGateOpen,
  weaponTypeOf,
  type V2Equipment,
  type V2EquipConcept,
  type V2EquipmentId,
  type V2EquipSlot,
  type V2EquipCatalogTier,
  type V2WeaponType,
} from "./v2Equipment";

describe("장비 이름 식별성", () => {
  it("서로 다른 장비가 완전히 같은 이름을 사용하지 않는다", () => {
    const byName = new Map<string, V2EquipmentId[]>();
    for (const item of Object.values(V2_EQUIPMENT)) {
      const ids = byName.get(item.name) ?? [];
      ids.push(item.id);
      byName.set(item.name, ids);
    }

    const duplicates = [...byName].filter(([, ids]) => ids.length > 1);
    expect(duplicates).toEqual([]);
  });

  it("무관한 장비 이름에 반복되던 '성벽'은 대표 고유 장비 하나에만 남긴다", () => {
    const names = Object.values(V2_EQUIPMENT)
      .map((item) => item.name)
      .filter((name) => name.includes("성벽"));

    expect(names).toEqual(["백골성벽"]);
  });
});

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

describe("enhanceGoldCostForEquipment — 표시 티어 비용 바닥", () => {
  const hardSangoonBySlot = {
    weapon: V2_EQUIPMENT.v2_hard_sangoon_cleaver,
    armor: V2_EQUIPMENT.v2_hard_sangoon_hide,
    gloves: V2_EQUIPMENT.v2_hard_sangoon_claws,
    boots: V2_EQUIPMENT.v2_hard_sangoon_stride,
    ring: V2_EQUIPMENT.v2_hard_sangoon_ring,
    necklace: V2_EQUIPMENT.v2_hard_sangoon_amulet,
  } satisfies Record<V2EquipSlot, V2Equipment>;

  it("하드 보스 5티어 장비는 같은 슬롯 4티어 최고 장비보다 강화비가 낮지 않다", () => {
    const hardSangoonIds = [
      "v2_hard_sangoon_cleaver",
      "v2_hard_sangoon_hide",
      "v2_hard_sangoon_claws",
      "v2_hard_sangoon_stride",
      "v2_hard_sangoon_ring",
      "v2_hard_sangoon_amulet",
    ] as const;

    for (const id of hardSangoonIds) {
      const item = V2_EQUIPMENT[id];
      const strongestDisplay4 = Object.values(V2_EQUIPMENT)
        .filter(
          (candidate) =>
            candidate.slot === item.slot &&
            v2EquipCatalogTierToDisplayTier(candidate.tier) === 4,
        )
        .reduce<V2Equipment | null>(
          (best, candidate) =>
            best == null || candidate.power > best.power ? candidate : best,
          null,
        );

      if (!strongestDisplay4) {
        throw new Error(`missing display 4T comparison for ${item.slot}`);
      }

      expect(enhancePowerForCost(item, item.power)).toBeGreaterThan(
        strongestDisplay4.power,
      );
      expect(enhanceGoldCostForEquipment(item, item.power, 9)).toBeGreaterThan(
        enhanceGoldCostForEquipment(
          strongestDisplay4,
          strongestDisplay4.power,
          9,
        ),
      );
    }
  });

  it("6티어 기본 위력은 같은 부위의 표준 산군 5티어보다 높다", () => {
    const displayTier6 = Object.values(V2_EQUIPMENT).filter(
      (item) => v2EquipCatalogTierToDisplayTier(item.tier) === 6,
    );

    for (const item of displayTier6) {
      expect(item.power, item.id).toBeGreaterThan(
        hardSangoonBySlot[item.slot].power,
      );
    }
  });

  it("6티어 저품질 굴림도 5티어 부위별 기준보다 강화비가 20% 높다", () => {
    const displayTier6 = Object.values(V2_EQUIPMENT).filter(
      (item) => v2EquipCatalogTierToDisplayTier(item.tier) === 6,
    );

    for (const item of displayTier6) {
      const displayTier5 = hardSangoonBySlot[item.slot];
      const displayTier5Floor = enhancePowerForCost(displayTier5, 1);
      const expectedTier6Floor = Math.ceil(
        displayTier5Floor * ENHANCE_DISPLAY_TIER_6_COST_PREMIUM,
      );

      expect(enhancePowerForCost(item, 1), item.id).toBe(expectedTier6Floor);
      expect(
        enhanceGoldCostForEquipment(item, 1, 9),
        item.id,
      ).toBeGreaterThan(
        enhanceGoldCostForEquipment(displayTier5, 1, 9),
      );
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
const REGULAR_GRID_TIERS: V2EquipCatalogTier[] = [1, 2, 3];

describe("V2_EQUIPMENT catalog", () => {
  it("모든 id 는 키와 일치해야 함 (self-id 일관성)", () => {
    for (const [key, item] of Object.entries(V2_EQUIPMENT)) {
      expect(item.id).toBe(key);
    }
  });

  it("카탈로그 모든 키는 저장 파서가 받는 유효 장비 id 여야 함", () => {
    const ids = Object.keys(V2_EQUIPMENT) as V2EquipmentId[];
    const parsed = parseEquipmentSave({
      owned: ids.map((id, index) => ({ iid: `catalog-${index}`, id })),
    });
    expect(parsed.owned).toHaveLength(ids.length);
    expect(new Set(parsed.owned.map((item) => item.id))).toEqual(new Set(ids));
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

// 한 (슬롯, 컨셉) 라인의 스타터 정규 카탈로그 티어(T1~T3, 정렬).
function slotConceptLine(
  slot: V2EquipSlot,
  concept: V2EquipConcept,
): V2EquipCatalogTier[] {
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
// weaponType 라인의 정규 카탈로그 티어(정렬). 스타터·제작·유니크 제외.
function weaponTypeRegularTiers(wt: V2WeaponType): V2EquipCatalogTier[] {
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
function weaponTypeTiersWithStarter(wt: V2WeaponType): V2EquipCatalogTier[] {
  const catalogTiers = new Set<V2EquipCatalogTier>();
  for (const i of v2EquipmentBySlot("weapon")) {
    if (i.weaponType === wt && !isUnique(i) && !i.craftOnly && !i.noDrop)
      catalogTiers.add(i.tier);
  }
  return [...catalogTiers].sort((a, b) => a - b);
}

describe("V2_EQUIPMENT grid (제작 전용 포함 — 6슬롯)", () => {
  it("기존 카탈로그에 폭풍 원정과 HARD 협동 보스 6T 장비를 더한다", () => {
    // 누적 정리(무기 8→4 #823 · 세트 38→12 #824 · 장갑/신발 중갑 폐기 · 들판 유니크 6 삭제):
    //   정규 그리드 29 = 비무기 18(갑옷 6 + 장갑 3 + 신발 3 + 반지 3 + 목걸이 3) + 무기 11
    //     (대검 3·지팡이 3·활 3 + 단검 정규 2). 장갑/신발 중갑 정규 6자루 제거(경갑 단일).
    //   전문화 스타터 3 · noDrop 198(기존 180 + 6T 시그니처 유니크 18종) · 유니크 66
    //     (고유 아이템 30 + 보스 8). 2026-06-26 유니크 재정의: 옛 필드 유니크 15 → noDrop(일반)·
    //     신규 고유 아이템 30 → unique. 검은 왕도 이후 보스 유니크 2종 추가.
    //     총 328 = 기존 304 + 6T 시그니처 유니크 18 + HARD 협동 보스 6.
    const all = Object.values(V2_EQUIPMENT);
    expect(
      all.filter(
        (i) => !isUnique(i) && !i.craftOnly && !i.starterOnly && !i.noDrop,
      ),
      "정규 그리드",
    ).toHaveLength(29);
    expect(all.filter((i) => isUnique(i)), "유니크").toHaveLength(72);
    expect(all.filter((i) => i.craftOnly), "제작전용").toHaveLength(67);
    expect(all.filter((i) => i.starterOnly), "전문화 스타터").toHaveLength(3);
    expect(
      all.filter((i) => i.noDrop),
      "noDrop(밴드흔한+하드 보스+폭풍 원정+강등 필드유니크)",
    ).toHaveLength(204);
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

  it("NPC 판매 기준가는 후반 티어만 압축하고 T1 구매가는 유지", () => {
    const starter = V2_EQUIPMENT.v2_iron_sword;
    expect(shopPriceOf(starter)).toBe(450);
    expect(shopPriceForSell(starter)).toBe(450);
    expect(sellPriceOf(starter)).toBe(22);

    const anchorWeapon = Object.values(V2_EQUIPMENT).find(
      (item) => item.tier === 3 && item.slot === "weapon",
    );
    expect(anchorWeapon).toBeDefined();
    expect(shopPriceForSell(anchorWeapon!)).toBe(583_200);
    expect(sellPriceOf(anchorWeapon!)).toBe(29_160);

    const endgameWeapon = V2_EQUIPMENT.v2_plateau_greatsword;
    const endgameArmor = V2_EQUIPMENT.v2_plateau_bone_armor;
    const endgameRing = V2_EQUIPMENT.v2_plateau_cairn_ring;
    expect(shopPriceOf(endgameWeapon)).toBeUndefined();
    expect(shopPriceForSell(endgameWeapon)).toBe(12_049_523);
    expect(sellPriceOf(endgameWeapon)).toBe(602_476);
    expect(sellPriceOf(endgameArmor)).toBe(401_650);
    expect(sellPriceOf(endgameRing)).toBe(200_825);
  });

  it("수련용 무기 3종은 T1 무기 가격으로 상점에서 구매할 수 있다", () => {
    const trainingIds = [
      "v2_starter_staff",
      "v2_starter_bow",
      "v2_starter_dagger",
    ] as const;
    for (const id of trainingIds) {
      expect(shopPriceOf(V2_EQUIPMENT[id]), id).toBe(450);
    }
  });

  it("제작 전용 장비는 상점 구매 불가지만 판매가는 가진다", () => {
    const crafted = Object.values(V2_EQUIPMENT).filter((i) => i.craftOnly);
    expect(crafted.map((i) => i.id).sort()).toEqual([
      "v2_crafted_abyss_mana_core",
      "v2_crafted_aether_necklace",
      "v2_crafted_astral_grimoire",
      "v2_crafted_aurora_crown",
      "v2_crafted_berserker_husk",
      "v2_crafted_blood_debt_greatsword",
      "v2_crafted_bulwark_shield",
      "v2_crafted_combo_boots",
      "v2_crafted_combo_bow",
      "v2_crafted_combo_coat",
      "v2_crafted_combo_gloves",
      "v2_crafted_combo_necklace",
      "v2_crafted_combo_ring",
      "v2_crafted_corrosion_armor",
      "v2_crafted_corrosion_boots",
      "v2_crafted_corrosion_dagger",
      "v2_crafted_corrosion_gloves",
      "v2_crafted_corrosion_necklace",
      "v2_crafted_corrosion_ring",
      "v2_crafted_first_dawn_shield",
      "v2_crafted_focus_boots",
      "v2_crafted_focus_gloves",
      "v2_crafted_focus_ring",
      "v2_crafted_focus_robe",
      "v2_crafted_fracture_blade",
      "v2_crafted_fury_boots",
      "v2_crafted_fury_necklace",
      "v2_crafted_fury_plate",
      "v2_crafted_gale_bow",
      "v2_crafted_guard_gauntlets",
      "v2_crafted_guard_greaves",
      "v2_crafted_guard_ring",
      "v2_crafted_guillotine_greatsword",
      "v2_crafted_immovable_bulwark",
      "v2_crafted_kingbreaker_axe",
      "v2_crafted_luminous_aegis_necklace",
      "v2_crafted_master_ring",
      "v2_crafted_monopoly_gloves",
      "v2_crafted_oathblade",
      "v2_crafted_oblivion_ring",
      "v2_crafted_one_eye_oath",
      "v2_crafted_overdrive_bow",
      "v2_crafted_painless_relic",
      "v2_crafted_pulsestone_guard",
      "v2_crafted_pursuit_coat",
      "v2_crafted_pursuit_grips",
      "v2_crafted_pursuit_necklace",
      "v2_crafted_pursuit_ring",
      "v2_crafted_runic_staff",
      "v2_crafted_spark_gloves",
      "v2_crafted_stilled_chalice",
      "v2_crafted_stormlance",
      "v2_crafted_sunforge_blade",
      "v2_crafted_thousand_league_boots",
      "v2_crafted_thunder_lock_bow",
      "v2_crafted_thunder_oracle_grimoire",
      "v2_crafted_thundercoil_gloves",
      "v2_crafted_toxic_mist_gloves",
      "v2_crafted_trench_hymn_necklace",
      "v2_crafted_veinbreaker_bow",
      "v2_crafted_venom_gland_dagger",
      "v2_crafted_venom_injector",
      "v2_crafted_voidstep_boots",
      "v2_crafted_voidveil_robe",
      "v2_crafted_ward_plate",
      "v2_crafted_white_night_grimoire",
      "v2_crafted_windstep_boots",
    ]);
    for (const item of crafted) {
      expect(shopPriceOf(item), `${item.id} 구매불가`).toBeUndefined();
      expect(sellPriceOf(item), `${item.id} 판매가`).toBeGreaterThan(0);
    }
  });

  it("전 장비 판매 가능 — 유니크·제작전용은 비매, 수련용은 구매 가능", () => {
    // 인벤 클러터 정리를 위해 전 장비 판매 허용. 실수 판매는 잠금으로 방지한다.
    // 구매는 T1 정규 장비와 수련용 무기만 가능하다.
    const offGrid = Object.values(V2_EQUIPMENT).filter(
      (i) => isUnique(i) || i.craftOnly || i.starterOnly,
    );
    expect(offGrid.length).toBeGreaterThan(0);
    for (const it of offGrid) {
      expect(shopPriceForSell(it), `${it.id} 판매가능`).toBeGreaterThan(0);
      expect(sellPriceOf(it), `${it.id} sellPrice 비-null`).not.toBeNull();
      if (it.starterOnly) {
        expect(shopPriceOf(it), `${it.id} 구매가능`).toBeGreaterThan(0);
      } else {
        expect(shopPriceOf(it), `${it.id} 구매불가 유지`).toBeUndefined();
      }
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

  it("setId 를 가진 장비는 실제 세트 정의의 pieces 에 역참조되어야 함", () => {
    const setsById = new Map(V2_EQUIP_SETS.map((set) => [set.id, set]));
    for (const item of Object.values(V2_EQUIPMENT)) {
      if (!item.setId) continue;
      const set = setsById.get(item.setId);
      expect(set, `${item.id}.setId=${item.setId} 세트 실재`).toBeDefined();
      expect(set?.pieces, `${item.id} 세트 pieces 역참조`).toContain(item.id);
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
        expect(threshold.count, `${set.id} threshold reachable`).toBeLessThanOrEqual(
          pieces.length,
        );
        expect(
          Object.keys(threshold.bonus).length > 0 || threshold.signature != null,
          `${set.id} bonus or signature`,
        ).toBe(true);
        prev = threshold.count;
      }
    }
  });

  it("6T HARD 협동 보스 장비 6종은 설계된 슬롯·수치·세트 태그를 가진다", () => {
    expect(V2_EQUIPMENT.v2_boss_catastrophe_gloves).toMatchObject({
      slot: "gloves",
      tier: 16,
      name: "재앙독 완갑",
      power: 74,
      noDrop: true,
      setTags: ["catastrophe_venom"],
      options: { hp: 180, crit: 13, spd: 10, accuracy: 12, statusDamageReductionPct: 4 },
    });
    expect(V2_EQUIPMENT.v2_boss_catastrophe_boots).toMatchObject({
      slot: "boots",
      tier: 16,
      name: "사막잠행 장화",
      power: 68,
      noDrop: true,
      setTags: ["catastrophe_venom"],
      options: { hp: 180, eva: 12, spd: 20, accuracy: 10, statusDamageReductionPct: 6 },
    });
    expect(V2_EQUIPMENT.v2_boss_catastrophe_ring).toMatchObject({
      slot: "ring",
      tier: 16,
      name: "독왕의 침환",
      power: 124,
      noDrop: true,
      setTags: ["catastrophe_venom"],
      options: { hp: 220, crit: 11, critMult: 65, spd: 8, accuracy: 10 },
    });
    expect(V2_EQUIPMENT.v2_boss_frozen_lake_armor).toMatchObject({
      slot: "armor",
      tier: 16,
      name: "빙호 갑주",
      power: 235,
      noDrop: true,
      setTags: ["frozen_lake_guard"],
      options: { hp: 760, mp: 120, def: 65, magicDef: 55, statusDamageReductionPct: 12 },
    });
    expect(V2_EQUIPMENT.v2_boss_frozen_lake_boots).toMatchObject({
      slot: "boots",
      tier: 16,
      name: "동결수면 장화",
      power: 68,
      noDrop: true,
      setTags: ["frozen_lake_guard"],
      options: { hp: 260, def: 30, magicDef: 25, spd: 4, statusDamageReductionPct: 10 },
    });
    expect(V2_EQUIPMENT.v2_boss_frozen_lake_necklace).toMatchObject({
      slot: "necklace",
      tier: 16,
      name: "혹한의 심장",
      power: 132,
      noDrop: true,
      setTags: ["frozen_lake_guard"],
      options: { hp: 320, mp: 220, magicDef: 55, healPowerPct: 6, statusDamageReductionPct: 10 },
    });

    const catastrophe = V2_EQUIP_TAG_SETS.find((set) => set.id === "catastrophe_venom");
    expect(catastrophe?.thresholds).toEqual([
      {
        count: 2,
        bonus: {},
        signature: {
          trigger: "direct_skill_hit",
          label: "재앙독 주입",
          poisonChancePct: 25,
          poisonStacks: 1,
        },
      },
      {
        count: 3,
        bonus: { spd: 8 },
        signature: {
          trigger: "direct_skill_hit",
          label: "맹독 추격",
          poisonedTargetDamagePct: 10,
        },
      },
    ]);
    const frozen = V2_EQUIP_TAG_SETS.find((set) => set.id === "frozen_lake_guard");
    expect(frozen?.thresholds).toEqual([
      {
        count: 2,
        bonus: { statusDamageReductionPct: 10 },
        signature: {
          trigger: "battle_start",
          label: "빙호수호",
          battleStartShieldPctMaxHp: 8,
        },
      },
      {
        count: 3,
        bonus: {},
        signature: {
          trigger: "tracked_shield_break",
          label: "빙호 해방",
          trackedShieldPctMaxHp: 8,
          cleanseHarmfulStatuses: true,
          damageTakenReductionPct: 15,
          buffActions: 2,
        },
      },
    ]);

    const allSix = [
      "v2_boss_catastrophe_gloves",
      "v2_boss_catastrophe_boots",
      "v2_boss_catastrophe_ring",
      "v2_boss_frozen_lake_armor",
      "v2_boss_frozen_lake_boots",
      "v2_boss_frozen_lake_necklace",
    ].map((id) => V2_EQUIPMENT[id as keyof typeof V2_EQUIPMENT]);
    expect(allSix.filter((item) => item.slot === "boots")).toHaveLength(2);
  });

  it("기존 제작 세트와 세트 없는 5T 키카드를 함께 구성한다", () => {
    const crafted = Object.values(V2_EQUIPMENT).filter((item) => item.craftOnly);
    const craftedSetIds = new Set<string>(CRAFTED_EQUIP_TAG_SET_IDS);
    const craftedSetPieces = crafted.filter((item) =>
      item.setTags?.some((tag) => craftedSetIds.has(tag)),
    );
    expect(crafted).toHaveLength(67);
    expect(craftedSetPieces).toHaveLength(40);
    expect(
      craftedSetPieces.every((item) =>
        item.setTags?.some((tag) => craftedSetIds.has(tag)),
      ),
    ).toBe(true);

    const piecesBySet = new Map<string, string[]>();
    for (const setId of CRAFTED_EQUIP_TAG_SET_IDS) {
      piecesBySet.set(setId, []);
    }
    for (const item of crafted) {
      for (const tag of item.setTags ?? []) {
        if (craftedSetIds.has(tag)) {
          piecesBySet.get(tag)?.push(item.id);
        }
      }
    }
    expect(piecesBySet.get("artisan_bulwark")).toEqual(
      expect.arrayContaining([
        "v2_crafted_oathblade",
        "v2_crafted_guard_gauntlets",
        "v2_crafted_guard_greaves",
        "v2_crafted_ward_plate",
        "v2_crafted_guard_ring",
        "v2_crafted_aurora_crown",
        "v2_crafted_bulwark_shield",
      ]),
    );
    expect(piecesBySet.get("artisan_fury")).toEqual(
      expect.arrayContaining([
        "v2_crafted_spark_gloves",
        "v2_crafted_fury_boots",
        "v2_crafted_master_ring",
        "v2_crafted_fury_plate",
        "v2_crafted_fury_necklace",
        "v2_crafted_sunforge_blade",
        "v2_crafted_kingbreaker_axe",
      ]),
    );
    expect(piecesBySet.get("artisan_gale")).toEqual(
      expect.arrayContaining([
        "v2_crafted_gale_bow",
        "v2_crafted_pursuit_grips",
        "v2_crafted_windstep_boots",
        "v2_crafted_pursuit_coat",
        "v2_crafted_pursuit_ring",
        "v2_crafted_pursuit_necklace",
        "v2_crafted_stormlance",
      ]),
    );
    expect(piecesBySet.get("artisan_arcane")).toEqual(
      expect.arrayContaining([
        "v2_crafted_runic_staff",
        "v2_crafted_focus_gloves",
        "v2_crafted_focus_boots",
        "v2_crafted_aether_necklace",
        "v2_crafted_focus_ring",
        "v2_crafted_focus_robe",
        "v2_crafted_astral_grimoire",
      ]),
    );
    expect(piecesBySet.get("artisan_combo")).toEqual(
      expect.arrayContaining([
        "v2_crafted_combo_bow",
        "v2_crafted_combo_coat",
        "v2_crafted_combo_gloves",
        "v2_crafted_combo_boots",
        "v2_crafted_combo_ring",
        "v2_crafted_combo_necklace",
      ]),
    );
    expect(piecesBySet.get("artisan_corrosion")).toEqual(
      expect.arrayContaining([
        "v2_crafted_corrosion_dagger",
        "v2_crafted_corrosion_armor",
        "v2_crafted_corrosion_gloves",
        "v2_crafted_corrosion_boots",
        "v2_crafted_corrosion_ring",
        "v2_crafted_corrosion_necklace",
      ]),
    );
    const allSlots = new Set([
      "weapon",
      "armor",
      "gloves",
      "boots",
      "ring",
      "necklace",
    ]);
    for (const setId of CRAFTED_EQUIP_TAG_SET_IDS) {
      const slots = new Set(
        crafted
          .filter((item) => item.setTags?.includes(setId))
          .map((item) => item.slot),
      );
      expect(slots, `${setId} slots`).toEqual(allSlots);
    }

    const thresholdCountsById = Object.fromEntries(
      V2_EQUIP_TAG_SETS.filter((set) => craftedSetIds.has(set.id)).map(
        (set) => [set.id, set.thresholds.map((threshold) => threshold.count)],
      ),
    );
    expect(thresholdCountsById).toEqual({
      artisan_bulwark: [2, 4, 6],
      artisan_fury: [2, 4, 6],
      artisan_gale: [2, 4, 6],
      artisan_arcane: [2, 4, 6],
      artisan_combo: [2, 4, 6],
      artisan_corrosion: [2, 4, 6],
    });
  });

  it("제작 전용 장비는 제작소 진행용 짝수 티어에 배치된다", () => {
    const tiers = Object.fromEntries(
      Object.values(V2_EQUIPMENT)
        .filter((item) => item.craftOnly)
        .map((item) => [item.id, item.tier]),
    );
    expect(tiers).toMatchObject({
      v2_crafted_oathblade: 4,
      v2_crafted_gale_bow: 4,
      v2_crafted_guard_gauntlets: 4,
      v2_crafted_guard_greaves: 4,
      v2_crafted_runic_staff: 4,
      v2_crafted_focus_gloves: 4,
      v2_crafted_focus_boots: 4,
      v2_crafted_spark_gloves: 4,
      v2_crafted_fury_boots: 4,
      v2_crafted_pursuit_grips: 4,
      v2_crafted_windstep_boots: 4,
      v2_crafted_combo_bow: 4,
      v2_crafted_combo_gloves: 4,
      v2_crafted_combo_boots: 4,
      v2_crafted_corrosion_dagger: 4,
      v2_crafted_corrosion_gloves: 4,
      v2_crafted_corrosion_boots: 4,
      v2_crafted_master_ring: 6,
      v2_crafted_ward_plate: 6,
      v2_crafted_guard_ring: 6,
      v2_crafted_fury_plate: 6,
      v2_crafted_pursuit_coat: 6,
      v2_crafted_pursuit_ring: 6,
      v2_crafted_aether_necklace: 6,
      v2_crafted_focus_ring: 6,
      v2_crafted_venom_gland_dagger: 6,
      v2_crafted_pulsestone_guard: 6,
      v2_crafted_thundercoil_gloves: 6,
      v2_crafted_veinbreaker_bow: 6,
      v2_crafted_combo_coat: 6,
      v2_crafted_combo_ring: 6,
      v2_crafted_corrosion_armor: 6,
      v2_crafted_corrosion_ring: 6,
      v2_crafted_fury_necklace: 8,
      v2_crafted_pursuit_necklace: 8,
      v2_crafted_focus_robe: 8,
      v2_crafted_sunforge_blade: 8,
      v2_crafted_combo_necklace: 8,
      v2_crafted_corrosion_necklace: 8,
      v2_crafted_luminous_aegis_necklace: 8,
      v2_crafted_toxic_mist_gloves: 8,
      v2_crafted_voidstep_boots: 8,
      v2_crafted_aurora_crown: 10,
      v2_crafted_fracture_blade: 12,
      v2_crafted_thunder_oracle_grimoire: 12,
      v2_crafted_trench_hymn_necklace: 12,
    });
  });

  it("제작 전용 장비는 재정립된 티어에 맞는 위력 기준을 가진다", () => {
    expect(V2_EQUIPMENT.v2_crafted_oathblade.power).toBe(72);
    expect(V2_EQUIPMENT.v2_crafted_gale_bow.power).toBe(65);
    expect(V2_EQUIPMENT.v2_crafted_runic_staff.power).toBe(76);
    expect(V2_EQUIPMENT.v2_crafted_guard_gauntlets.power).toBe(11);
    expect(V2_EQUIPMENT.v2_crafted_fury_plate.power).toBe(56);
    expect(V2_EQUIPMENT.v2_crafted_focus_robe.power).toBe(55);
    expect(V2_EQUIPMENT.v2_crafted_ward_plate.power).toBe(64);
    expect(V2_EQUIPMENT.v2_crafted_master_ring.power).toBe(22);
    expect(V2_EQUIPMENT.v2_crafted_aether_necklace.power).toBe(22);
    expect(V2_EQUIPMENT.v2_crafted_venom_gland_dagger.power).toBe(95);
    expect(V2_EQUIPMENT.v2_crafted_sunforge_blade.power).toBe(224);
    expect(V2_EQUIPMENT.v2_crafted_aurora_crown.power).toBe(73);
    expect(V2_EQUIPMENT.v2_crafted_pulsestone_guard.power).toBe(60);
    expect(V2_EQUIPMENT.v2_crafted_thundercoil_gloves.power).toBe(15);
    expect(V2_EQUIPMENT.v2_crafted_veinbreaker_bow.power).toBe(87);
    expect(V2_EQUIPMENT.v2_crafted_fracture_blade.power).toBe(475);
    expect(V2_EQUIPMENT.v2_crafted_thunder_oracle_grimoire.power).toBe(461);
    expect(V2_EQUIPMENT.v2_crafted_trench_hymn_necklace.power).toBe(99);
  });

  it("몬스터 소재 개량 장비 9종은 2T부터 4T까지 빌드 시그니처를 제공한다", () => {
    expect(V2_EQUIPMENT.v2_crafted_pulsestone_guard.signature).toMatchObject({
      trigger: "on_hit_taken",
      defGainOnHitPct: 30,
    });
    expect(V2_EQUIPMENT.v2_crafted_thundercoil_gloves.signature).toMatchObject({
      trigger: "on_hit",
      shockChancePct: 10,
    });
    expect(V2_EQUIPMENT.v2_crafted_veinbreaker_bow.signature).toMatchObject({
      trigger: "on_crit",
      enemyDefDebuffPct: 16,
    });
    expect(
      V2_EQUIPMENT.v2_crafted_luminous_aegis_necklace.signature,
    ).toMatchObject({ trigger: "on_heal", healToShieldPct: 18 });
    expect(V2_EQUIPMENT.v2_crafted_toxic_mist_gloves.signature).toMatchObject({
      trigger: "on_hit",
      poisonChancePct: 30,
    });
    expect(V2_EQUIPMENT.v2_crafted_voidstep_boots.signature).toMatchObject({
      trigger: "on_dodge",
      spdBuffPct: 20,
    });
    expect(V2_EQUIPMENT.v2_crafted_fracture_blade.signature).toMatchObject({
      trigger: "on_hit",
      bleedChancePct: 25,
    });
    expect(
      V2_EQUIPMENT.v2_crafted_thunder_oracle_grimoire.signature,
    ).toMatchObject({ trigger: "on_skill_cast", mpRefundPctOfCost: 22 });
    expect(V2_EQUIPMENT.v2_crafted_trench_hymn_necklace.signature).toMatchObject({
      trigger: "on_heal",
      healToShieldPct: 24,
    });
  });

  it("감전 장비와 세트는 행동 차단에 맞춘 낮은 발동 확률을 사용한다", () => {
    expect(V2_EQUIPMENT.v2_stormpeak_sig_wolf_dagger.signature).toMatchObject({
      shockChancePct: 5,
    });
    expect(V2_EQUIPMENT.v2_crafted_thundercoil_gloves.signature).toMatchObject({
      shockChancePct: 10,
    });
    expect(
      V2_EQUIP_TAG_SETS.find(({ id }) => id === "storm_arcane")?.thresholds.find(
        ({ count }) => count === 4,
      )?.signature,
    ).toMatchObject({ shockChancePct: 10 });
    expect(V2_EQUIPMENT.v2_crafted_thunder_lock_bow.signature).toMatchObject({
      shockChancePct: 15,
    });
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

  it("tier 값이 현행 카탈로그 순서 안에 있고 정수", () => {
    const validTiers = new Set(V2_EQUIP_CATALOG_TIER_ORDER);
    for (const item of Object.values(V2_EQUIPMENT)) {
      expect(Number.isInteger(item.tier)).toBe(true);
      expect(validTiers.has(item.tier)).toBe(true);
    }
  });

  it("표시 티어는 사냥터 1~4T, 하드 보스 5T, 폭풍 원정 6T로 노출", () => {
    expect(
      V2_EQUIP_CATALOG_TIER_ORDER.map((tier) =>
        v2EquipCatalogTierToDisplayTier(tier),
      ),
    ).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 6]);
    expect(v2EquipCatalogTierDisplayLabel(1)).toBe("1T");
    expect(v2EquipCatalogTierDisplayLabel(4)).toBe("2T");
    expect(v2EquipCatalogTierDisplayLabel(7)).toBe("3T");
    expect(v2EquipCatalogTierDisplayLabel(12)).toBe("4T");
    expect(v2EquipCatalogTierDisplayLabel(13)).toBe("5T");
    expect(v2EquipCatalogTierDisplayLabel(16)).toBe("6T");
    expect(Object.keys(V2_EQUIP_DISPLAY_TIER_SOURCE_LABEL)).toHaveLength(6);
  });
});

describe("v2EquipStatRows (표시 행)", () => {
  it("기본 전투 스탯 → 옵션 순, 0 은 생략", () => {
    // 별노래궁(무기): 위력=카탈로그 기준, crit 2, 과거 무게 페널티는 속도-4 옵션.
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_starsong_bow);
    expect(rows).toEqual([
      { label: "공격력", value: `+${V2_EQUIPMENT.v2_starsong_bow.power}` },
      { label: "치명타", value: "+2%" },
      { label: "속도", value: "-4" },
    ]);
  });

  it("지팡이는 마법 공격력으로 표시한다", () => {
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_oak_staff);
    expect(rows[0]).toEqual({
      label: "마법 공격력",
      value: `+${V2_EQUIPMENT.v2_oak_staff.power}`,
    });
  });

  it("반지 critMult 옵션 — 마법 방어력 + 치명타 피해 배수 표기(+0.12×)", () => {
    // 은가락지 T1: 위력 4, weight 0, critMult 12(백분의일) → "+0.12×".
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_silver_ring);
    expect(rows).toEqual([
      { label: "마법 방어력", value: "+4" },
      { label: "치명타 피해", value: "+0.12×" },
    ]);
  });

  it("mp 옵션은 % 없이 flat", () => {
    // 마나의 정수 T3: 위력 7, weight 0, mp 48 + eva 3 + 회복 8%(SPI gear PR-2).
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_mana_essence);
    expect(rows).toEqual([
      { label: "마법 방어력", value: "+7" },
      { label: "추가 회피도", value: "+3" },
      { label: "MP", value: "+48" },
      { label: "회복", value: "+8%" },
    ]);
  });

  it("def 옵션(신설) — 추가 방어력 라벨 + flat 표기(+N), 키 등록", () => {
    expect(V2_EQUIP_OPTION_KEYS).toContain("def");
    // 카탈로그 def 아이템은 PR2 에서 추가 — 여기선 표시/키만(임의 옵션 주입).
    const fake = {
      ...V2_EQUIPMENT.v2_mithril_plate,
      options: { def: 20, hp: 40 },
    };
    const rows = v2EquipStatRows(fake);
    expect(rows).toContainEqual({ label: "추가 방어력", value: "+20" });
    expect(rows).toContainEqual({ label: "HP", value: "+40" });
  });

  it("굴림(roll) 주면 굴림값 표시 — 별노래궁(무기) 굴림(16/crit3)", () => {
    const rows = v2EquipStatRows(V2_EQUIPMENT.v2_starsong_bow, {
      power: 16,
      weight: 1,
      options: { crit: 3 },
    });
    expect(rows).toEqual([
      { label: "공격력", value: "+16" },
      { label: "치명타", value: "+3%" },
      { label: "속도", value: "-4" },
    ]);
  });

  it("강화 장비는 최종 위력과 함께 강화 전 기본 수치·증가분을 제공한다", () => {
    const rows = v2EquipStatRows(
      V2_EQUIPMENT.v2_iron_sword,
      { power: 100, weight: 0, options: {} },
      { level: 5, bonusPct: 8 },
    );

    expect(rows[0]).toEqual({
      label: "공격력",
      value: "+108",
      detail: "기본 +100 · 강화 +8",
    });
  });

  it("소수 강화 위력과 증가분은 화면 표시용 정수로 반올림한다", () => {
    const rows = v2EquipStatRows(
      V2_EQUIPMENT.v2_storm_sanctuary_armor,
      {
        power: 255,
        weight: 0,
        options: { hp: 1_178, mp: 330, magicDef: 156, healPowerPct: 18 },
      },
      { level: 7, bonusPct: 12 },
    );

    expect(rows[0]).toEqual({
      label: "회피도",
      value: "+286",
      detail: "기본 +255 · 강화 +31",
    });
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

  it("기존 6티어 굴림 위력을 한 번만 10% 상향한다", () => {
    const first = parseEquipmentSave({
      owned: [
        {
          iid: "storm_old",
          id: "v2_storm_gale_bow",
          roll: { power: 500, weight: 0 },
        },
      ],
    });
    expect(first.owned[0].roll).toMatchObject({
      power: 550,
      powerScaleVersion: TIER_6_POWER_SCALE_VERSION,
    });

    const second = parseEquipmentSave({ owned: first.owned });
    expect(second.owned[0].roll).toEqual(first.owned[0].roll);
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
      bonusPct: 1,
    });
  });

  it("명시적 제작 품질과 실제 강화 상태를 함께 보존한다", () => {
    const r = parseEquipmentSave({
      owned: [
        {
          iid: "quality-crafted-necklace",
          id: "v2_crafted_fury_necklace",
          craftQuality: { level: 1, bonusPct: 999 },
          enhance: { level: 3, bonusPct: 999 },
          craftedBy: {
            userId: "u1",
            profession: "blacksmith",
            level: 6,
            craftedAt: "2026-08-09T00:00:00.000Z",
          },
        },
      ],
    });

    expect(r.owned[0].craftQuality).toEqual({ level: 1, bonusPct: 5 });
    expect(r.owned[0].enhance).toEqual({ level: 3, bonusPct: 4 });
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

describe("장비 강화 초기화", () => {
  const enhanced = {
    iid: "a1",
    id: "v2_iron_sword" as V2EquipmentId,
    roll: { power: 77, weight: 3 },
    enhance: { level: 8, bonusPct: 15 },
    craftQuality: { level: 1 as const, bonusPct: 5 },
    craftedBy: {
      userId: "u1",
      profession: "blacksmith" as const,
      level: 6,
      craftedAt: "2026-08-10T00:00:00.000Z",
    },
    stormRefined: true as const,
  };

  it("강화 필드만 제거하고 나머지 개체 정보를 보존한다", () => {
    const [next] = resetInstanceEnhancement([enhanced], "a1");

    expect(next).not.toHaveProperty("enhance");
    expect(next).toMatchObject({
      iid: "a1",
      id: "v2_iron_sword",
      roll: enhanced.roll,
      craftQuality: enhanced.craftQuality,
      craftedBy: enhanced.craftedBy,
      stormRefined: true,
    });
    expect(enhanced.enhance).toEqual({ level: 8, bonusPct: 15 });
  });

  it("미강화·장착·잠금 상태를 각각 거부한다", () => {
    expect(
      enhancementResetError({ ...enhanced, enhance: undefined }, {}),
    ).toBe("not_enhanced");
    expect(enhancementResetError(enhanced, { weapon: "a1" })).toBe(
      "equipped",
    );
    expect(
      enhancementResetError({ ...enhanced, locked: true }, {}),
    ).toBe("locked");
    expect(enhancementResetError(enhanced, {})).toBeNull();
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
  it("6티어 시그니처 유니크 18종은 세트에 속하지 않고 기준 장비 능력치를 복사한다", () => {
    const pairs = [
      ["v2_sky_sig_collapse_armor", "v2_storm_wreckage_armor", "gravity_reprisal"],
      ["v2_sky_sig_antigravity_ring", "v2_storm_wreckage_ring", "gravity_feedback"],
      ["v2_sky_sig_bloodline_greatsword", "v2_storm_breaker_greatsword", "bleed_burst"],
      ["v2_sky_sig_scar_counter_gloves", "v2_storm_breaker_gloves", "bleed_aftermath"],
      ["v2_sky_sig_horizon_bow", "v2_storm_gale_bow", "pursuit_mark"],
      ["v2_sky_sig_windless_boots", "v2_storm_shadow_boots", "shadow_echo"],
      ["v2_sky_sig_venom_dagger", "v2_storm_venom_dagger", "venom_burst"],
      ["v2_sky_sig_corrosion_ring", "v2_storm_venom_ring", "venom_balance"],
      ["v2_sky_sig_overload_staff", "v2_storm_thunder_staff", "arcane_overload"],
      ["v2_sky_sig_reverse_gloves", "v2_storm_thunder_gloves", "arcane_feedback"],
      ["v2_sky_sig_dawn_chalice", "v2_storm_sanctuary_necklace", "sanctuary_reserve"],
      ["v2_sky_sig_unity_cloak", "v2_storm_sanctuary_armor", "mechanic_unity"],
      ["v2_storm_sig_wreckage_power_armor", "v2_storm_wreckage_armor", "shield_conversion"],
      ["v2_storm_sig_gale_orbit_boots", "v2_storm_gale_boots", "gale_circuit"],
      ["v2_storm_sig_thunder_return_ring", "v2_storm_thunder_ring", "status_mana_return"],
      ["v2_storm_sig_triphase_gloves", "v2_storm_shadow_gloves", "triphase_link"],
      ["v2_storm_sig_confluence_necklace", "v2_storm_sanctuary_necklace", "storm_confluence"],
      ["v2_storm_sig_heart_necklace", "v2_storm_sanctuary_necklace", "dominant_heart"],
    ] as const;

    expect(pairs).toHaveLength(18);
    for (const [id, baseId, mechanic] of pairs) {
      const item = V2_EQUIPMENT[id];
      const base = V2_EQUIPMENT[baseId];
      expect(item).toMatchObject({
        tier: 16,
        rarity: "unique",
        noDrop: true,
        slot: base.slot,
        concept: base.concept,
        power: base.power,
        weight: base.weight,
        options: base.options,
        signature: { trigger: "tier6_unique", mechanic },
      });
      expect(item.weaponType).toBe(base.weaponType);
      expect(item.setId).toBeUndefined();
      expect(item.setTags).toBeUndefined();
    }
  });

  it("6티어 시그니처 유니크 효과는 모두 고유한 한국어 설명을 가진다", () => {
    const descriptions = Object.values(V2_EQUIPMENT)
      .filter((item) => item.signature?.trigger === "tier6_unique")
      .map((item) => signatureLabel(item.signature!));
    expect(descriptions).toHaveLength(18);
    expect(new Set(descriptions)).toHaveLength(18);
    expect(descriptions.every((description) => description.length >= 10)).toBe(true);
  });

  it("트리거별 한국어 한 줄 — 15 효과", () => {
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
    ).toBe("3회 공격 적중마다 추가 기본 공격 1회");
    expect(
      signatureLabel({
        trigger: "on_dodge",
        label: "독왕",
        spdBuffPct: 25,
        buffActions: 3,
      }),
    ).toBe("회피 시 속도 +25% (3행동)");
    expect(
      signatureLabel({
        trigger: "on_action_evasion",
        label: "봉인",
        lostHpHealPct: 4,
      }),
    ).toBe("행동 시 회피 경감률의 절반 확률로 잃은 HP의 4% 회복");
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
        trigger: "on_crit",
        label: "칼바람 낙인",
        enemyDefDebuffPct: 18,
        buffActions: 2,
      }),
    ).toBe("치명타 시 대상 표식 — 방어 −18% (2행동)");
    expect(
      signatureLabel({
        trigger: "on_hit",
        label: "청독",
        poisonChancePct: 35,
        poisonStacks: 1,
      }),
    ).toBe("공격 적중 시 35% 확률로 중독 1스택");
    expect(
      signatureLabel({
        trigger: "on_hit",
        label: "포식자",
        bleedChancePct: 30,
        bleedStacks: 1,
      }),
    ).toBe("공격 적중 시 30% 확률로 출혈 1스택");
    expect(
      signatureLabel({
        trigger: "on_hit",
        label: "뇌운",
        shockChancePct: 5,
      }),
    ).toBe("공격 적중 시 5% 확률로 감전 — 다음 행동 1회 불가");
    expect(
      signatureLabel({
        trigger: "on_hit_taken",
        label: "백골성벽",
        defGainOnHitPct: 35,
      }),
    ).toBe("피격 시 받은 HP 피해의 35%만큼 방어 상승");
    expect(
      signatureLabel({
        trigger: "on_skill_cast",
        label: "망자의 별",
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

  it("회피 회복 장비 3종은 행동 발동과 잃은 HP 4%/3%/3%를 사용", () => {
    expect(V2_EQUIPMENT.v2_sanctum_sig_sealed_ring.signature).toEqual({
      trigger: "on_action_evasion",
      label: "봉인",
      lostHpHealPct: 4,
    });
    expect(V2_EQUIPMENT.v2_throne_sig_shadow_ring.signature).toEqual({
      trigger: "on_action_evasion",
      label: "그림자",
      lostHpHealPct: 3,
    });
    expect(V2_EQUIPMENT.v2_abyssruin_sig_pursuer_bow.signature).toEqual({
      trigger: "on_action_evasion",
      label: "해연",
      lostHpHealPct: 3,
    });
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
