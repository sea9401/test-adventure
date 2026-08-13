import { describe, expect, it } from "vitest";
import {
  BAND_UNIQUE_POOLS,
  BAND_COMMON_POOLS,
  SIGNATURE_UNIQUE_CHANCE,
  UNIQUE_FLOOR_POOLS,
  V2_UNIQUE_IDS,
  bandUniquePoolForDepth,
  bandCommonPoolForDepth,
  bandCommonChance,
  bandCommonChanceForDepth,
  commonIdsForDepthRange,
  rollBandUniqueDrop,
  rollBandCommonDrop,
  rollSkyRiftWeaponDrop,
  SKY_RIFT_SIGNATURE_UNIQUE_CHANCE,
  SKY_RIFT_SIGNATURE_UNIQUE_IDS,
  STAR_GRAVE_SIGNATURE_UNIQUE_CHANCE,
  SKY_RIFT_WEAPON_DROP_CHANCE,
  SKY_RIFT_WEAPON_IDS,
  rollUniqueDrop,
  uniqueIdsForDepthRange,
} from "./dungeonUniqueDrops";
import {
  V2_EQUIPMENT,
  isUnique,
  shopPriceOf,
  type V2EquipmentId,
} from "./v2Equipment";
import { rollEquipDrop } from "./dungeonEquipDrops";
import { BOSS_UNIQUE_IDS } from "./coopBosses";
import type { DungeonFloorId } from "./types";

const FLOORS: DungeonFloorId[] = [1, 2, 3, 4, 5, 6, 7, 8];

// 결정적 rng — 미리 정한 시퀀스를 순서대로. 소진 후 0.
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0);
}

describe("BAND_COMMON_POOLS / rollBandCommonDrop (흔한 밴드 장비)", () => {
  it("기존 밴드는 흔한 ≥9종, 천공 균열은 깊이별 6T 방어구 풀 — 전부 noDrop·비유니크", () => {
    // 2026-06-26 유니크 재정의: 옛 필드 유니크가 일반(noDrop)으로 강등돼 흔한 풀에 합류 →
    //   밴드별 9 + 강등분(canyon/lake+2·cave+4·sanctum/swamp+2·den+3).
    expect(BAND_COMMON_POOLS).toHaveLength(17);
    for (const p of BAND_COMMON_POOLS) {
      expect(p.ids.length, `밴드 ${p.minDepth}`).toBeGreaterThanOrEqual(
        p.minDepth >= 73 ? 6 : 9,
      );
      for (const id of p.ids) {
        expect(V2_EQUIPMENT[id], id).toBeDefined();
        expect(isUnique(V2_EQUIPMENT[id]), `${id} 흔한=비유니크`).toBe(false);
        expect(V2_EQUIPMENT[id].noDrop, `${id} noDrop`).toBe(true);
      }
    }
  });

  it("흔한/유니크 풀이 겹치지 않음(같은 밴드 내 분리)", () => {
    for (const cp of BAND_COMMON_POOLS) {
      const up = BAND_UNIQUE_POOLS.find((u) => u.minDepth === cp.minDepth);
      if (!up) continue;
      const overlap = cp.ids.filter((id) => up.ids.includes(id));
      expect(overlap, `밴드 ${cp.minDepth} 겹침`).toEqual([]);
    }
  });

  it("기본 드랍률 램프 — 로컬 깊이 1·2=0.3% / 3·4=0.45% / 5·6=0.6%", () => {
    expect(bandCommonChance(1)).toBe(0.003);
    expect(bandCommonChance(2)).toBe(0.003);
    expect(bandCommonChance(3)).toBe(0.0045);
    expect(bandCommonChance(4)).toBe(0.0045);
    expect(bandCommonChance(5)).toBe(0.006);
    expect(bandCommonChance(6)).toBe(0.006);
  });

  it("붉은 벌판까지는 로컬 깊이별 일반 장비 드랍률이 동일", () => {
    expect(bandCommonChanceForDepth(25)).toBe(0.003); // 성소 로컬1
    expect(bandCommonChanceForDepth(30)).toBe(0.006); // 성소 로컬6
    expect(bandCommonChanceForDepth(31)).toBe(0.003); // 늪지 로컬1
    expect(bandCommonChanceForDepth(36)).toBe(0.006); // 늪지 로컬6
    expect(bandCommonChanceForDepth(37)).toBe(0.003); // 소굴 로컬1
    expect(bandCommonChanceForDepth(42)).toBe(0.006); // 소굴 로컬6
    expect(bandCommonChanceForDepth(43)).toBe(0.003); // 검은 왕도 로컬1
    expect(bandCommonChanceForDepth(48)).toBe(0.006); // 검은 왕도 로컬6
    expect(bandCommonChanceForDepth(49)).toBe(0.003); // 붉은 벌판 로컬1
    expect(bandCommonChanceForDepth(54)).toBe(0.006); // 붉은 벌판 로컬6
  });

  it("최상위 3개 테마는 최심부 장비 합산 약 800승 곡선을 쓴다", () => {
    for (const start of [55, 61, 67]) {
      expect(bandCommonChanceForDepth(start)).toBe(0.0005);
      expect(bandCommonChanceForDepth(start + 1)).toBe(0.0005);
      expect(bandCommonChanceForDepth(start + 2)).toBe(0.000625);
      expect(bandCommonChanceForDepth(start + 3)).toBe(0.000625);
      expect(bandCommonChanceForDepth(start + 4)).toBe(0.00075);
      expect(bandCommonChanceForDepth(start + 5)).toBe(0.00075);
    }

    const combined =
      1 -
      (1 - bandCommonChanceForDepth(72)) *
        (1 - SIGNATURE_UNIQUE_CHANCE);
    expect(1 / combined).toBeCloseTo(800, 0);
  });

  it("천공 균열은 깊어질수록 6T 방어구 드랍률이 0.05%→0.075%→0.10%로 상승한다", () => {
    expect([73, 74].map(bandCommonChanceForDepth)).toEqual([0.0005, 0.0005]);
    expect([75, 76].map(bandCommonChanceForDepth)).toEqual([0.00075, 0.00075]);
    expect([77, 78].map(bandCommonChanceForDepth)).toEqual([0.001, 0.001]);
    expect(commonIdsForDepthRange(73, 78)).toHaveLength(21);
  });

  it("별의 무덤은 천공 균열과 같은 21종 방어구 풀과 단계별 확률을 사용한다", () => {
    const skyIds = commonIdsForDepthRange(73, 78);
    expect(commonIdsForDepthRange(79, 84)).toEqual(skyIds);
    expect([79, 80, 81, 82, 83, 84].map(bandCommonChanceForDepth)).toEqual([
      0.0005,
      0.0005,
      0.00075,
      0.00075,
      0.001,
      0.001,
    ]);
  });

  it("rollBandCommonDrop — 깊이별 chance 로 통과/실패, 통과 시 흔한 후보 반환", () => {
    const canyon = bandCommonPoolForDepth(7)!;
    expect(rollBandCommonDrop(7, seqRng([0.0029, 0]))).toBe(canyon.ids[0]); // 로컬1 0.003 미만 통과
    expect(rollBandCommonDrop(7, () => 0.003)).toBeNull(); // 로컬1 경계값은 실패
    expect(rollBandCommonDrop(11, seqRng([0.0059, 0]))).toBe(canyon.ids[0]); // 로컬5 0.006 미만 통과
  });

  it("밴드 밖 깊이 → rng 미소비하고 null (rollEquipDrop 결과와 ?? 합성 안전)", () => {
    let calls = 0;
    const rng = () => {
      calls++;
      return 0;
    };
    // 밴드 = 7~84(들판 1~6 전·마지막 별의 무덤 밴드 84에서 끝=프론티어 캡).
    expect(rollBandCommonDrop(6, rng)).toBeNull(); // 들판(밴드 전)
    expect(rollBandCommonDrop(85, rng)).toBeNull(); // 마지막 밴드(84) 너머 = 프론티어 끝
    expect(calls).toBe(0);
  });

  it("천공 균열과 별의 무덤은 같은 21종 방어구 전역 드랍 풀을 사용함", () => {
    const den = bandCommonPoolForDepth(37)!;
    expect(bandCommonPoolForDepth(42)).toBe(den);
    const throne = bandCommonPoolForDepth(43)!;
    expect(throne).not.toBe(den);
    expect(bandCommonPoolForDepth(48)).toBe(throne);
    const redField = bandCommonPoolForDepth(49)!;
    expect(redField).not.toBe(throne);
    expect(bandCommonPoolForDepth(54)).toBe(redField);
    const plateau = bandCommonPoolForDepth(55)!;
    expect(plateau).not.toBe(redField);
    expect(bandCommonPoolForDepth(60)).toBe(plateau);
    const storm = bandCommonPoolForDepth(61)!;
    expect(storm).not.toBe(plateau);
    expect(bandCommonPoolForDepth(66)).toBe(storm);
    const abyss = bandCommonPoolForDepth(67)!;
    expect(abyss).not.toBe(storm);
    expect(bandCommonPoolForDepth(72)).toBe(abyss);
    const skyEntry = bandCommonPoolForDepth(73)!;
    const skyMiddle = bandCommonPoolForDepth(75)!;
    const skyDeep = bandCommonPoolForDepth(77)!;
    expect(bandCommonPoolForDepth(74)).toBe(skyEntry);
    expect(bandCommonPoolForDepth(76)).toBe(skyMiddle);
    expect(bandCommonPoolForDepth(78)).toBe(skyDeep);
    expect(skyEntry.ids).toHaveLength(21);
    expect(skyMiddle.ids).toEqual(skyEntry.ids);
    expect(skyDeep.ids).toEqual(skyEntry.ids);
    expect(skyEntry.ids).toContain("v2_storm_wreckage_armor");
    expect(skyEntry.ids).toContain("v2_storm_gale_armor");
    expect(skyEntry.ids).toContain("v2_storm_thunder_armor");
    const starEntry = bandCommonPoolForDepth(79)!;
    const starMiddle = bandCommonPoolForDepth(81)!;
    const starDeep = bandCommonPoolForDepth(83)!;
    expect(bandCommonPoolForDepth(80)).toBe(starEntry);
    expect(bandCommonPoolForDepth(82)).toBe(starMiddle);
    expect(bandCommonPoolForDepth(84)).toBe(starDeep);
    expect(starEntry.ids).toEqual(skyEntry.ids);
    expect(starMiddle.ids).toEqual(skyEntry.ids);
    expect(starDeep.ids).toEqual(skyEntry.ids);
    expect(bandCommonPoolForDepth(85)).toBeNull();
    expect(rollBandCommonDrop(40, seqRng([0.0004, 0]))).toBe(den.ids[0]); // 밴드 내 드랍
    expect(rollBandCommonDrop(46, seqRng([0.0004, 0]))).toBe(throne.ids[0]); // 신규 밴드 내 드랍
    expect(rollBandCommonDrop(46, seqRng([0.005, 0]))).toBeNull(); // 로컬4 0.0045 이상이라 실패
    expect(rollBandCommonDrop(49, seqRng([0.0002, 0]))).toBe(redField.ids[0]);
    expect(rollBandCommonDrop(55, seqRng([0.0002, 0]))).toBe(plateau.ids[0]);
    expect(rollBandCommonDrop(55, () => 0.0005)).toBeNull();
    expect(rollBandCommonDrop(61, seqRng([0.0002, 0]))).toBe(storm.ids[0]);
    expect(rollBandCommonDrop(67, seqRng([0.0002, 0]))).toBe(abyss.ids[0]);
  });

  it("78단계 무기는 0.05% 완제품 우회 드롭이며 다른 깊이에서는 RNG를 쓰지 않는다", () => {
    expect(SKY_RIFT_WEAPON_DROP_CHANCE).toBe(0.0005);
    expect(SKY_RIFT_WEAPON_IDS).toHaveLength(7);
    let calls = 0;
    expect(rollSkyRiftWeaponDrop(77, () => (calls++, 0))).toBeNull();
    expect(calls).toBe(0);
    expect(rollSkyRiftWeaponDrop(78, seqRng([0.00049, 0]))).toBe(
      SKY_RIFT_WEAPON_IDS[0],
    );
    expect(rollSkyRiftWeaponDrop(78, () => 0.0005)).toBeNull();
  });
});

describe("유니크 카탈로그 (66종 — 기존 48 + 6T 시그니처 18)", () => {
  it("V2_UNIQUE_IDS 66종, 전부 rarity:unique + 카탈로그 존재", () => {
    expect(V2_UNIQUE_IDS).toHaveLength(66);
    for (const id of V2_UNIQUE_IDS) {
      expect(V2_EQUIPMENT[id], id).toBeDefined();
      expect(isUnique(V2_EQUIPMENT[id]), id).toBe(true);
    }
  });

  it("유니크는 상점 비매(undefined)", () => {
    for (const id of V2_UNIQUE_IDS) {
      expect(shopPriceOf(V2_EQUIPMENT[id]), `${id} 상점`).toBeUndefined();
    }
  });
});

describe("UNIQUE_FLOOR_POOLS", () => {
  it("들판 유니크 삭제 후 1~8층 전부 빈 풀(드랍 없음)", () => {
    for (const f of FLOORS) {
      expect(UNIQUE_FLOOR_POOLS[f].ids, `floor ${f}`).toEqual([]);
    }
  });

  it("원정 전용 6종을 제외한 전부가 밴드 또는 보스 풀에 등장한다", () => {
    const inPools = new Set<string>();
    // 심층 밴드 풀(마른 협곡 등)의 유니크 — 깊이 밴드 드랍.
    for (const pool of BAND_UNIQUE_POOLS) {
      for (const id of pool.ids) {
        expect(isUnique(V2_EQUIPMENT[id]), id).toBe(true);
        inPools.add(id);
      }
    }
    // 테마 보스 전용 유니크(보스 처치 드랍).
    for (const id of BOSS_UNIQUE_IDS) {
      expect(isUnique(V2_EQUIPMENT[id]), id).toBe(true);
      inPools.add(id);
    }
    const expeditionOnly = new Set<V2EquipmentId>([
      "v2_storm_sig_wreckage_power_armor",
      "v2_storm_sig_gale_orbit_boots",
      "v2_storm_sig_thunder_return_ring",
      "v2_storm_sig_triphase_gloves",
      "v2_storm_sig_confluence_necklace",
      "v2_storm_sig_heart_necklace",
    ]);
    for (const id of V2_UNIQUE_IDS.filter((id) => !expeditionOnly.has(id))) {
      expect(inPools.has(id), `${id} 어느 풀에도 안 떨어짐`).toBe(true);
    }
  });
});

describe("BAND_UNIQUE_POOLS — 게이트 전(7~24) 유니크 풀 비었음(유니크 재정의)", () => {
  const empty = new Set<V2EquipmentId>();
  it("마른협곡(7)·얼음호수(13)·심층동굴(19) = ids 빈 풀·chance 0 → 굴림 항상 null(rng 미소비)", () => {
    for (const minDepth of [7, 13, 19]) {
      const pool = BAND_UNIQUE_POOLS.find((p) => p.minDepth === minDepth)!;
      expect(pool.ids, `밴드 ${minDepth}`).toEqual([]);
      expect(pool.chance, `밴드 ${minDepth} chance`).toBe(0);
      let calls = 0;
      const rng = () => {
        calls++;
        return 0;
      };
      expect(rollBandUniqueDrop(minDepth, empty, rng)).toBeNull();
      expect(calls, `밴드 ${minDepth} rng 미소비`).toBe(0);
    }
  });
  it("uniqueIdsForDepthRange(7~24) = 빈 배열(게이트 전 유니크 없음)", () => {
    expect(uniqueIdsForDepthRange(7, 24)).toEqual([]);
  });
});

describe("BAND_UNIQUE_POOLS — 고유 아이템(Signature, 잊힌 성소 25~84)", () => {
  const empty = new Set<V2EquipmentId>();
  const sanctum = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 25)!;
  const swamp = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 31)!;
  const den = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 37)!;
  const throne = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 43)!;
  const redField = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 49)!;
  const plateau = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 55)!;
  const storm = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 61)!;
  const abyss = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 67)!;
  const skyRift = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 73)!;
  const starGrave = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 79)!;

  it("성소부터 심해 폐허까지 6깊이별 고유 5종, chance 0.0005, 전부 유니크", () => {
    for (const [pool, min, max] of [
      [sanctum, 25, 30],
      [swamp, 31, 36],
      [den, 37, 42],
      [throne, 43, 48],
      [redField, 49, 54],
      [plateau, 55, 60],
      [storm, 61, 66],
      [abyss, 67, 72],
    ] as const) {
      expect(pool.minDepth).toBe(min);
      expect(pool.maxDepth).toBe(max);
      expect(pool.ids).toHaveLength(5);
      expect(pool.chance).toBe(0.0005);
      for (const id of pool.ids) {
        expect(isUnique(V2_EQUIPMENT[id]), `${id} 유니크`).toBe(true);
      }
    }
  });

  it("천공 균열 전 구간은 낮아진 확률로 신규 유니크 12종 전체를 공유한다", () => {
    const expectedIds: V2EquipmentId[] = [
      "v2_sky_sig_collapse_armor",
      "v2_sky_sig_antigravity_ring",
      "v2_sky_sig_bloodline_greatsword",
      "v2_sky_sig_scar_counter_gloves",
      "v2_sky_sig_horizon_bow",
      "v2_sky_sig_windless_boots",
      "v2_sky_sig_venom_dagger",
      "v2_sky_sig_corrosion_ring",
      "v2_sky_sig_overload_staff",
      "v2_sky_sig_reverse_gloves",
      "v2_sky_sig_dawn_chalice",
      "v2_sky_sig_unity_cloak",
    ];

    expect(SKY_RIFT_SIGNATURE_UNIQUE_CHANCE).toBe(0.000025);
    expect(SKY_RIFT_SIGNATURE_UNIQUE_IDS).toEqual(expectedIds);
    expect(BAND_UNIQUE_POOLS.filter((p) => p.minDepth >= 73 && p.maxDepth <= 78)).toEqual([
      skyRift,
    ]);
    expect(skyRift).toMatchObject({
      minDepth: 73,
      maxDepth: 78,
      chance: 0.000025,
      ids: expectedIds,
    });

    for (const depth of [73, 74, 75, 76, 77, 78]) {
      const pool = bandUniquePoolForDepth(depth)!;
      expect(pool).toBe(skyRift);
      expect(rollBandUniqueDrop(depth, empty, seqRng([0.000025, 0]))).toBeNull();
      expect(rollBandUniqueDrop(depth, empty, seqRng([0, 0]))).toBe(expectedIds[0]);
      expect(rollBandUniqueDrop(depth, empty, seqRng([0, 0.999]))).toBe(
        expectedIds[11],
      );
      expect(rollBandUniqueDrop(depth, new Set(expectedIds), seqRng([0, 0]))).toBe(
        expectedIds[0],
      );
      expect(rollBandUniqueDrop(depth, empty, seqRng([0.000025, 0]), 2)).toBe(
        expectedIds[0],
      );
    }
  });

  it("별의 무덤 전 구간은 천공 균열 유니크 12종을 총 0.0035%로 추격한다", () => {
    expect(STAR_GRAVE_SIGNATURE_UNIQUE_CHANCE).toBe(0.000035);
    for (const depth of [79, 80, 81, 82, 83, 84]) {
      const pool = bandUniquePoolForDepth(depth)!;
      expect(pool.ids).toEqual(SKY_RIFT_SIGNATURE_UNIQUE_IDS);
      expect(pool.chance).toBe(STAR_GRAVE_SIGNATURE_UNIQUE_CHANCE);
      expect(
        rollBandUniqueDrop(
          depth,
          empty,
          seqRng([STAR_GRAVE_SIGNATURE_UNIQUE_CHANCE, 0]),
        ),
      ).toBeNull();
      expect(rollBandUniqueDrop(depth, empty, seqRng([0, 0]))).toBe(
        SKY_RIFT_SIGNATURE_UNIQUE_IDS[0],
      );
    }
  });

  it("깊이 매칭 — 24 이하 빈 풀, 25부터 성소→늪지→소굴→왕도→붉은 벌판→백골 고원→폭풍 산맥→심해 폐허→천공 균열→별의 무덤", () => {
    expect(bandUniquePoolForDepth(24)!.ids).toEqual([]); // 심층 동굴(빈 풀)
    expect(bandUniquePoolForDepth(25)).toBe(sanctum);
    expect(bandUniquePoolForDepth(30)).toBe(sanctum);
    expect(bandUniquePoolForDepth(31)).toBe(swamp);
    expect(bandUniquePoolForDepth(36)).toBe(swamp);
    expect(bandUniquePoolForDepth(37)).toBe(den);
    expect(bandUniquePoolForDepth(42)).toBe(den);
    expect(bandUniquePoolForDepth(43)).toBe(throne);
    expect(bandUniquePoolForDepth(48)).toBe(throne);
    expect(bandUniquePoolForDepth(49)).toBe(redField);
    expect(bandUniquePoolForDepth(54)).toBe(redField);
    expect(bandUniquePoolForDepth(55)).toBe(plateau);
    expect(bandUniquePoolForDepth(60)).toBe(plateau);
    expect(bandUniquePoolForDepth(61)).toBe(storm);
    expect(bandUniquePoolForDepth(66)).toBe(storm);
    expect(bandUniquePoolForDepth(67)).toBe(abyss);
    expect(bandUniquePoolForDepth(72)).toBe(abyss);
    for (let depth = 73; depth <= 78; depth++) {
      expect(bandUniquePoolForDepth(depth)).toBe(skyRift);
    }
    for (let depth = 79; depth <= 84; depth++) {
      expect(bandUniquePoolForDepth(depth)).toBe(starGrave);
    }
    expect(bandUniquePoolForDepth(85)).toBeNull();
  });

  it("통과 굴림(rng<chance) → 그 밴드 고유 반환(pick 0 → 첫 id)", () => {
    expect(rollBandUniqueDrop(25, empty, seqRng([0, 0]))).toBe(sanctum.ids[0]);
    expect(rollBandUniqueDrop(31, empty, seqRng([0, 0]))).toBe(swamp.ids[0]);
    expect(rollBandUniqueDrop(42, empty, seqRng([0, 0]))).toBe(den.ids[0]);
    expect(rollBandUniqueDrop(43, empty, seqRng([0, 0]))).toBe(throne.ids[0]);
    expect(rollBandUniqueDrop(49, empty, seqRng([0, 0]))).toBe(redField.ids[0]);
    expect(rollBandUniqueDrop(55, empty, seqRng([0, 0]))).toBe(plateau.ids[0]);
    expect(rollBandUniqueDrop(61, empty, seqRng([0, 0]))).toBe(storm.ids[0]);
    expect(rollBandUniqueDrop(67, empty, seqRng([0, 0]))).toBe(abyss.ids[0]);
  });

  it("굴림 실패(rng≥chance) → null", () => {
    expect(rollBandUniqueDrop(25, empty, () => 0.01)).toBeNull();
  });

  it("중복 드랍 허용 — 전종 보유해도 재드랍(god-roll 추격)", () => {
    const owned = new Set<V2EquipmentId>(den.ids);
    expect(rollBandUniqueDrop(37, owned, seqRng([0, 0]))).toBe(den.ids[0]);
  });

  it("성소 이후 모든 고유 밴드는 후보 풀이 서로 겹치지 않음", () => {
    const all = [sanctum, swamp, den, throne, redField, plateau, storm, abyss, skyRift];
    for (const a of all) {
      const others = all.filter((p) => p !== a).flatMap((p) => p.ids);
      expect(
        a.ids.filter((id) => others.includes(id)),
        `밴드 ${a.minDepth}`,
      ).toEqual([]);
    }
  });
});

describe("rollUniqueDrop", () => {
  const empty = new Set<V2EquipmentId>();

  it("들판 유니크 삭제 후 — 1~8층 전부 빈 풀이라 굴림과 무관하게 항상 null", () => {
    for (const f of FLOORS) {
      // rng 가 통과값(0)이어도 후보 0 → null. rng 미소비도 함께 보장.
      let calls = 0;
      const rng = () => {
        calls++;
        return 0;
      };
      expect(rollUniqueDrop(f, empty, rng), `floor ${f}`).toBeNull();
      expect(calls, `floor ${f} rng 미소비`).toBe(0);
    }
  });
});

describe("정규 장비 드랍은 유니크를 절대 안 뱉음 (누수 가드)", () => {
  it("정규 T1 전부 보유 + 여러 굴림 — 유니크는 절대 안 나옴(중복 드랍이어도)", () => {
    // 중복 드랍(no-dup off)이라 정규 T1 전량 보유여도 정규 T1 dup 은 나오지만,
    // 유니크는 정규 후보에서 제외되므로 결코 안 나온다 → 누수 회귀 가드.
    const t1NonUnique = Object.values(V2_EQUIPMENT)
      .filter((i) => i.tier === 1 && !isUnique(i))
      .map((i) => i.id);
    const owned = new Set<V2EquipmentId>(t1NonUnique);
    for (let seed = 0; seed < 100; seed++) {
      // rng: pass(0<0.02) → tier pick(0 → tier1) → candidate pick(seed).
      const got = rollEquipDrop(1, owned, seqRng([0, 0, seed / 100]));
      if (got) {
        expect(isUnique(V2_EQUIPMENT[got])).toBe(false);
      }
    }
  });
});

describe("uniqueIdsForDepthRange (코덱스 사냥터 도감)", () => {
  it("들판(1~6) — 유니크 없음(들판 유니크 삭제·floor 풀 전부 빈 풀)", () => {
    expect(uniqueIdsForDepthRange(1, 6)).toEqual([]);
  });

  it("마른 협곡(7~12) — 첫 밴드 유니크 풀(깊은 산 삭제 후 깊이 7부터 밴드)", () => {
    const canyon = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 7)!;
    expect(new Set(uniqueIdsForDepthRange(7, 12))).toEqual(new Set(canyon.ids));
  });

  it("정의된 각 밴드 범위 — 그 밴드 유니크 풀과 일치", () => {
    // 밴드가 늘어나도(협곡·얼음호수·…) 자동 검증 — 각 밴드 깊이 범위로 조회하면 그 풀과 같다.
    for (const band of BAND_UNIQUE_POOLS) {
      const ids = uniqueIdsForDepthRange(band.minDepth, band.maxDepth);
      expect(new Set(ids), `밴드 ${band.minDepth}~${band.maxDepth}`).toEqual(
        new Set(band.ids),
      );
    }
  });

  it("시그니처 유니크 밴드 너머 — 빈 배열", () => {
    const beyond =
      Math.max(8, ...BAND_UNIQUE_POOLS.map((p) => p.maxDepth)) + 1;
    expect(uniqueIdsForDepthRange(beyond, beyond + 5)).toEqual([]);
  });
});
