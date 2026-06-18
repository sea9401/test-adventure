import { describe, expect, it } from "vitest";
import {
  BAND_UNIQUE_POOLS,
  BAND_COMMON_POOLS,
  UNIQUE_FLOOR_POOLS,
  V2_UNIQUE_IDS,
  bandUniquePoolForDepth,
  bandCommonPoolForDepth,
  bandCommonChance,
  rollBandUniqueDrop,
  rollBandCommonDrop,
  rollUniqueDrop,
  uniqueIdsForDepthRange,
} from "./dungeonUniqueDrops";
import {
  V2_EQUIPMENT,
  isUnique,
  shopPriceOf,
  type V2EquipmentId,
} from "./v2Equipment";
import { V2_RECIPES } from "./v2Recipes";
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
  it("밴드당 흔한 9종(무기 4 + 기본세트 3 + 기본장신구 2; weaponType 8→4 후), 깊이 13~48 커버", () => {
    expect(BAND_COMMON_POOLS).toHaveLength(6);
    for (const p of BAND_COMMON_POOLS) {
      expect(p.ids).toHaveLength(9);
      for (const id of p.ids) {
        expect(V2_EQUIPMENT[id], id).toBeDefined();
        expect(isUnique(V2_EQUIPMENT[id]), `${id} 흔한=비유니크`).toBe(false);
        expect(V2_EQUIPMENT[id].noDrop, `${id} noDrop`).toBe(true);
      }
    }
  });

  it("흔한/유니크 풀이 겹치지 않음(같은 밴드 내 분리)", () => {
    for (const cp of BAND_COMMON_POOLS) {
      const up = BAND_UNIQUE_POOLS.find((u) => u.minDepth === cp.minDepth)!;
      const overlap = cp.ids.filter((id) => up.ids.includes(id));
      expect(overlap, `밴드 ${cp.minDepth} 겹침`).toEqual([]);
    }
  });

  it("드랍률 램프(2026-06-13 ÷5) — 밴드 로컬 깊이 1·2=0.1% / 3·4=0.14% / 5·6=0.18%", () => {
    expect(bandCommonChance(1)).toBe(0.001);
    expect(bandCommonChance(2)).toBe(0.001);
    expect(bandCommonChance(3)).toBe(0.0014);
    expect(bandCommonChance(4)).toBe(0.0014);
    expect(bandCommonChance(5)).toBe(0.0018);
    expect(bandCommonChance(6)).toBe(0.0018);
  });

  it("rollBandCommonDrop — 깊이별 chance 로 통과/실패, 통과 시 흔한 후보 반환", () => {
    const canyon = bandCommonPoolForDepth(13)!;
    expect(rollBandCommonDrop(13, seqRng([0.0005, 0]))).toBe(canyon.ids[0]); // 로컬1 0.001 통과
    expect(rollBandCommonDrop(13, () => 0.03)).toBeNull(); // 0.03≥0.001 실패
    expect(rollBandCommonDrop(17, seqRng([0.0015, 0]))).toBe(canyon.ids[0]); // 로컬5 0.0018 통과
  });

  it("밴드 밖 깊이 → rng 미소비하고 null (rollEquipDrop 결과와 ?? 합성 안전)", () => {
    let calls = 0;
    const rng = () => {
      calls++;
      return 0;
    };
    expect(rollBandCommonDrop(12, rng)).toBeNull();
    expect(rollBandCommonDrop(49, rng)).toBeNull();
    expect(calls).toBe(0);
  });
});

describe("유니크 카탈로그 (87종 — 기존 6 + 밴드 유니크 78[특화세트+사이드그레이드+추가 2피스] + 보스 3)", () => {
  it("V2_UNIQUE_IDS 87종, 전부 rarity:unique + 카탈로그 존재", () => {
    expect(V2_UNIQUE_IDS).toHaveLength(87);
    for (const id of V2_UNIQUE_IDS) {
      expect(V2_EQUIPMENT[id], id).toBeDefined();
      expect(isUnique(V2_EQUIPMENT[id]), id).toBe(true);
    }
  });

  it("유니크는 상점 비매(undefined) + 제작 불가(레시피 없음)", () => {
    for (const id of V2_UNIQUE_IDS) {
      expect(shopPriceOf(V2_EQUIPMENT[id]), `${id} 상점`).toBeUndefined();
      expect(V2_RECIPES[id], `${id} 레시피`).toBeUndefined();
    }
  });
});

describe("UNIQUE_FLOOR_POOLS", () => {
  it("1~5층 풀 채워짐(chance>0, ids 비어있지 않음), 6~8층 빈 풀", () => {
    for (const f of [1, 2, 3, 4, 5] as DungeonFloorId[]) {
      expect(UNIQUE_FLOOR_POOLS[f].chance, `floor ${f}`).toBeGreaterThan(0);
      expect(UNIQUE_FLOOR_POOLS[f].ids.length, `floor ${f}`).toBeGreaterThan(0);
    }
    for (const f of [6, 7, 8] as DungeonFloorId[]) {
      expect(UNIQUE_FLOOR_POOLS[f].ids, `floor ${f}`).toEqual([]);
    }
  });

  it("풀의 모든 id 가 유효 유니크 + 17종 전부 어느 풀엔가 등장(층 또는 밴드, 고아 없음)", () => {
    const inPools = new Set<string>();
    for (const f of FLOORS) {
      for (const id of UNIQUE_FLOOR_POOLS[f].ids) {
        expect(isUnique(V2_EQUIPMENT[id]), id).toBe(true);
        inPools.add(id);
      }
    }
    // 심층 밴드 풀(마른 협곡 등)의 유니크도 합산 — 깊이 밴드 드랍.
    for (const pool of BAND_UNIQUE_POOLS) {
      for (const id of pool.ids) {
        expect(isUnique(V2_EQUIPMENT[id]), id).toBe(true);
        inPools.add(id);
      }
    }
    // 테마 보스 전용 유니크(보스 처치 드랍) — 일반 풀엔 없지만 보스 풀에 등장.
    for (const id of BOSS_UNIQUE_IDS) {
      expect(isUnique(V2_EQUIPMENT[id]), id).toBe(true);
      inPools.add(id);
    }
    for (const id of V2_UNIQUE_IDS) {
      expect(inPools.has(id), `${id} 어느 풀에도 안 떨어짐`).toBe(true);
    }
  });
});

describe("BAND_UNIQUE_POOLS / rollBandUniqueDrop (심층 밴드 — 마른 협곡)", () => {
  const empty = new Set<V2EquipmentId>();
  const canyon = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 13)!;

  it("마른 협곡 유니크 = 깊이 13~18, 11종(바위문 수호구 3·녹슨 독니 2·사이드그레이드 2·추가 2피스 4), 총 0.1% 고정", () => {
    expect(canyon).toBeDefined();
    expect(canyon.maxDepth).toBe(18);
    expect(canyon.ids).toHaveLength(11);
    // chance 0.001 고정(2026-06-13 ÷5 — 흔한 장비와 별개·어디서나 귀함). 흔한 13종은 BAND_COMMON_POOLS.
    expect(canyon.chance).toBe(0.001);
  });

  it("마른 협곡 깊이 매칭 — 12 이하는 null(레거시 층 롤과 비중복), 13~18 캐년", () => {
    expect(bandUniquePoolForDepth(12)).toBeNull();
    expect(bandUniquePoolForDepth(13)).toBe(canyon);
    expect(bandUniquePoolForDepth(18)).toBe(canyon);
    // 19+ 는 더 이상 null 이 아니라 다음 밴드(얼음 호수). 캐년 풀이 아님만 확인.
    expect(bandUniquePoolForDepth(19)).not.toBe(canyon);
  });

  it("통과 굴림(rng<chance) → 그 밴드 유니크 반환 (pick 0 → 첫 id)", () => {
    expect(rollBandUniqueDrop(13, empty, seqRng([0, 0]))).toBe(canyon.ids[0]);
  });

  it("굴림 실패(rng≥chance) → null", () => {
    expect(rollBandUniqueDrop(13, empty, () => 0.5)).toBeNull();
  });

  it("밴드 밖 깊이 → rng 미소비하고 null (레거시 롤과 ?? 합성 안전)", () => {
    let calls = 0;
    const rng = () => {
      calls++;
      return 0;
    };
    expect(rollBandUniqueDrop(10, empty, rng)).toBeNull();
    expect(calls).toBe(0); // 풀 null → rng 호출 없음
  });

  it("중복 드랍 허용 — 전종 다 보유해도 후보에서 안 빠지고 재드랍(god-roll 추격)", () => {
    const owned = new Set<V2EquipmentId>(canyon.ids);
    // 보유분 제외 안 함 → 전 종류 균등 pick. pick 0 → 첫 id 그대로 재드랍.
    expect(rollBandUniqueDrop(13, owned, seqRng([0, 0]))).toBe(canyon.ids[0]);
  });
});

describe("BAND_UNIQUE_POOLS / rollBandUniqueDrop (심층 밴드 — 얼음 호수)", () => {
  const empty = new Set<V2EquipmentId>();
  const lake = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 19)!;

  it("얼음 호수 유니크 = 깊이 19~24, 13종(바위문 수호구 3·백서리 비전 2·혈금강 2·사이드그레이드 2·추가 2피스 4), 총 0.1% 고정", () => {
    expect(lake).toBeDefined();
    expect(lake.maxDepth).toBe(24);
    expect(lake.ids).toHaveLength(13);
    expect(lake.chance).toBe(0.001);
  });

  it("깊이 매칭 — 18 이하는 호수 아님, 19~24 만 매칭(25+는 다음 밴드)", () => {
    expect(bandUniquePoolForDepth(18)).not.toBe(lake);
    expect(bandUniquePoolForDepth(19)).toBe(lake);
    expect(bandUniquePoolForDepth(24)).toBe(lake);
    // 25+ 는 더 이상 null 이 아니라 다음 밴드(심층 동굴). 호수 풀이 아님만 확인.
    expect(bandUniquePoolForDepth(25)).not.toBe(lake);
  });

  it("통과 굴림(rng<chance) → 얼음 호수 유니크 반환", () => {
    expect(rollBandUniqueDrop(19, empty, seqRng([0, 0]))).toBe(lake.ids[0]);
  });

  it("마른 협곡과 후보 풀이 겹치지 않음(밴드 분리)", () => {
    const canyon = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 13)!;
    const overlap = lake.ids.filter((id) => canyon.ids.includes(id));
    expect(overlap).toEqual([]);
  });
});

describe("BAND_UNIQUE_POOLS / rollBandUniqueDrop (심층 밴드 — 심층 동굴)", () => {
  const empty = new Set<V2EquipmentId>();
  const cave = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 25)!;

  it("심층 동굴 유니크 = 깊이 25~30, 17종(흑요석 3·심판의 성벽 3·흑맥 독왕 3·사이드그레이드 4·추가 2피스 4), 총 0.1% 고정", () => {
    expect(cave).toBeDefined();
    expect(cave.maxDepth).toBe(30);
    expect(cave.ids).toHaveLength(17);
    expect(cave.chance).toBe(0.001);
  });

  it("깊이 매칭 — 24 이하는 동굴 아님, 25~30 만 매칭(31+는 다음 밴드)", () => {
    expect(bandUniquePoolForDepth(24)).not.toBe(cave);
    expect(bandUniquePoolForDepth(25)).toBe(cave);
    expect(bandUniquePoolForDepth(30)).toBe(cave);
    expect(bandUniquePoolForDepth(31)).not.toBe(cave);
  });

  it("통과 굴림(rng<chance) → 심층 동굴 유니크 반환", () => {
    expect(rollBandUniqueDrop(25, empty, seqRng([0, 0]))).toBe(cave.ids[0]);
  });

  it("다른 밴드(협곡·호수)와 후보 풀이 겹치지 않음", () => {
    const others = BAND_UNIQUE_POOLS.filter((p) => p.minDepth !== 25).flatMap(
      (p) => p.ids,
    );
    const overlap = cave.ids.filter((id) => others.includes(id));
    expect(overlap).toEqual([]);
  });
});

describe("BAND_UNIQUE_POOLS / rollBandUniqueDrop (심층 밴드 — 잊힌 성소)", () => {
  const empty = new Set<V2EquipmentId>();
  const sanctum = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 31)!;

  it("잊힌 성소 유니크 = 깊이 31~36, 12종(성소 수호구 3·별점 비전 2·성벽의 계시 3·사이드그레이드 2·성광 보행 2), 총 0.1% 고정", () => {
    expect(sanctum).toBeDefined();
    expect(sanctum.maxDepth).toBe(36);
    expect(sanctum.ids).toHaveLength(12);
    expect(sanctum.chance).toBe(0.001);
    expect(sanctum.chance / sanctum.ids.length).toBeCloseTo(0.001 / 12);
  });

  it("깊이 매칭 — 30 이하는 성소 아님, 31~36 만 매칭(37+는 다음 밴드)", () => {
    expect(bandUniquePoolForDepth(30)).not.toBe(sanctum);
    expect(bandUniquePoolForDepth(31)).toBe(sanctum);
    expect(bandUniquePoolForDepth(36)).toBe(sanctum);
    expect(bandUniquePoolForDepth(37)).not.toBe(sanctum);
  });

  it("통과 굴림(rng<chance) → 잊힌 성소 유니크 반환", () => {
    expect(rollBandUniqueDrop(31, empty, seqRng([0, 0]))).toBe(
      sanctum.ids[0],
    );
  });
});

describe("BAND_UNIQUE_POOLS / rollBandUniqueDrop (심층 밴드 — 리자드 늪지)", () => {
  const empty = new Set<V2EquipmentId>();
  const swamp = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 37)!;

  it("리자드 늪지 유니크 = 깊이 37~42, 12종(수렁 수호구 3·맹독 군주 3·진흙 금강 2·사이드그레이드 2·이끼 보호 2), 총 0.1% 고정", () => {
    expect(swamp).toBeDefined();
    expect(swamp.maxDepth).toBe(42);
    expect(swamp.ids).toHaveLength(12);
    expect(swamp.chance).toBe(0.001);
    expect(swamp.chance / swamp.ids.length).toBeCloseTo(0.001 / 12);
  });

  it("깊이 매칭 — 36 이하는 늪지 아님, 37~42 만 매칭(43+는 다음 밴드)", () => {
    expect(bandUniquePoolForDepth(36)).not.toBe(swamp);
    expect(bandUniquePoolForDepth(37)).toBe(swamp);
    expect(bandUniquePoolForDepth(42)).toBe(swamp);
    expect(bandUniquePoolForDepth(43)).not.toBe(swamp);
  });

  it("통과 굴림(rng<chance) → 리자드 늪지 유니크 반환", () => {
    expect(rollBandUniqueDrop(37, empty, seqRng([0, 0]))).toBe(swamp.ids[0]);
  });
});

describe("BAND_UNIQUE_POOLS / rollBandUniqueDrop (심층 밴드 — 짐승의 소굴)", () => {
  const empty = new Set<V2EquipmentId>();
  const den = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 43)!;

  it("짐승의 소굴 유니크 = 깊이 43~48, 13종(공허 수호구 3·공허 사냥꾼 3·야수쇄도 2·사이드그레이드 3·맹수 보행 2), 총 0.1% 고정", () => {
    expect(den).toBeDefined();
    expect(den.maxDepth).toBe(48);
    expect(den.ids).toHaveLength(13);
    expect(den.chance).toBe(0.001);
    expect(den.chance / den.ids.length).toBeCloseTo(0.001 / 13);
  });

  it("깊이 매칭 — 42 이하는 소굴 아님, 43~48 만 매칭, 49 이상은 null", () => {
    expect(bandUniquePoolForDepth(42)).not.toBe(den);
    expect(bandUniquePoolForDepth(43)).toBe(den);
    expect(bandUniquePoolForDepth(48)).toBe(den);
    expect(bandUniquePoolForDepth(49)).toBeNull();
  });

  it("통과 굴림(rng<chance) → 짐승의 소굴 유니크 반환", () => {
    expect(rollBandUniqueDrop(43, empty, seqRng([0, 0]))).toBe(den.ids[0]);
  });
});

describe("rollUniqueDrop", () => {
  const empty = new Set<V2EquipmentId>();

  it("통과 굴림(rng<chance) → 그 층 유니크 반환", () => {
    // 1층: chance 0.003, ids [shadow_garb]. rng 0 → 통과 + pick 0.
    expect(rollUniqueDrop(1, empty, seqRng([0, 0]))).toBe("v2_uniq_shadow_garb");
  });

  it("굴림 실패(rng≥chance) → null", () => {
    expect(rollUniqueDrop(1, empty, () => 0.5)).toBeNull();
  });

  it("이미 보유한 유니크는 제외 → 후보 0 이면 null", () => {
    const owned = new Set<V2EquipmentId>(["v2_uniq_shadow_garb"]);
    expect(rollUniqueDrop(1, owned, seqRng([0, 0]))).toBeNull();
  });

  it("2종 층(5층)은 pick 굴림으로 갈림", () => {
    // 5층 ids [starcleaver, sage_seal]. pick 0→첫째, 0.9→둘째.
    expect(rollUniqueDrop(5, empty, seqRng([0, 0]))).toBe("v2_uniq_starcleaver");
    expect(rollUniqueDrop(5, empty, seqRng([0, 0.9]))).toBe("v2_uniq_sage_seal");
  });

  it("빈 풀(6~8층) → 항상 null", () => {
    for (const f of [6, 7, 8] as DungeonFloorId[]) {
      expect(rollUniqueDrop(f, empty, () => 0), `floor ${f}`).toBeNull();
    }
  });
});

describe("정규 장비 드랍은 유니크를 절대 안 뱉음 (누수 가드)", () => {
  it("정규 T1 전부 보유 + 여러 굴림 — 유니크(shadow_garb)는 절대 안 나옴(중복 드랍이어도)", () => {
    // 1층 유니크 shadow_garb 는 T1. 중복 드랍(no-dup off)이라 정규 T1 전량 보유여도 정규 T1
    // dup 은 나오지만, 유니크는 정규 후보에서 제외되므로 결코 안 나온다 → 누수 회귀 가드.
    const t1NonUnique = Object.values(V2_EQUIPMENT)
      .filter((i) => i.tier === 1 && !isUnique(i))
      .map((i) => i.id);
    const owned = new Set<V2EquipmentId>(t1NonUnique);
    for (let seed = 0; seed < 100; seed++) {
      // rng: pass(0<0.02) → tier pick(0 → tier1) → candidate pick(seed).
      const got = rollEquipDrop(1, owned, seqRng([0, 0, seed / 100]));
      if (got) {
        expect(isUnique(V2_EQUIPMENT[got])).toBe(false);
        expect(got).not.toBe("v2_uniq_shadow_garb");
      }
    }
  });
});

describe("uniqueIdsForDepthRange (코덱스 사냥터 도감)", () => {
  it("들판(1~6) — floor 풀 1~5 시그니처 유니크 합집합(6종)", () => {
    const ids = uniqueIdsForDepthRange(1, 6);
    // floor 1~5 풀 id 전부 포함, 중복 없음.
    const expected = new Set(
      [1, 2, 3, 4, 5].flatMap((f) => UNIQUE_FLOOR_POOLS[f as 1].ids),
    );
    expect(new Set(ids)).toEqual(expected);
    expect(ids.length).toBe(expected.size);
  });

  it("깊은 산(7~12) — 유니크 없음(floor 6~8 빈 풀·밴드 밖)", () => {
    expect(uniqueIdsForDepthRange(7, 12)).toEqual([]);
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

  it("모든 밴드보다 깊고 floor 풀(≤8) 밖 — 빈 배열 (미정의 구간)", () => {
    // 밴드가 추가돼도 깨지지 않게: 현재 최대 밴드 깊이 너머 = 아직 콘텐츠 없는 구간.
    const beyond =
      Math.max(8, ...BAND_UNIQUE_POOLS.map((p) => p.maxDepth)) + 1;
    expect(uniqueIdsForDepthRange(beyond, beyond + 5)).toEqual([]);
  });
});
