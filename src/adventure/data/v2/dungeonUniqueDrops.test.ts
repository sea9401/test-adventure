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
  it("밴드당 흔한 ≥9종(기본 9 + 강등된 옛 필드 유니크) — 전부 noDrop·비유니크", () => {
    // 2026-06-26 유니크 재정의: 옛 필드 유니크가 일반(noDrop)으로 강등돼 흔한 풀에 합류 →
    //   밴드별 9 + 강등분(canyon/lake+2·cave+4·sanctum/swamp+2·den+3).
    expect(BAND_COMMON_POOLS).toHaveLength(6);
    for (const p of BAND_COMMON_POOLS) {
      expect(p.ids.length, `밴드 ${p.minDepth}`).toBeGreaterThanOrEqual(9);
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
    const canyon = bandCommonPoolForDepth(7)!;
    expect(rollBandCommonDrop(7, seqRng([0.0005, 0]))).toBe(canyon.ids[0]); // 로컬1 0.001 통과
    expect(rollBandCommonDrop(7, () => 0.03)).toBeNull(); // 0.03≥0.001 실패
    expect(rollBandCommonDrop(11, seqRng([0.0015, 0]))).toBe(canyon.ids[0]); // 로컬5 0.0018 통과
  });

  it("밴드 밖 깊이 → rng 미소비하고 null (rollEquipDrop 결과와 ?? 합성 안전)", () => {
    let calls = 0;
    const rng = () => {
      calls++;
      return 0;
    };
    // 밴드 = 7~42(들판 1~6 전·마지막 소굴 밴드 42에서 끝=프론티어 캡).
    expect(rollBandCommonDrop(6, rng)).toBeNull(); // 들판(밴드 전)
    expect(rollBandCommonDrop(43, rng)).toBeNull(); // 마지막 밴드(42) 너머 = 프론티어 끝
    expect(calls).toBe(0);
  });

  it("마지막 밴드(소굴)는 깊이 37~42 — 42 가 프론티어 끝(43+ 없음)", () => {
    const den = bandCommonPoolForDepth(37)!;
    expect(bandCommonPoolForDepth(42)).toBe(den);
    expect(bandCommonPoolForDepth(43)).toBeNull(); // 캡 너머 = 콘텐츠 없음
    expect(rollBandCommonDrop(40, seqRng([0.0005, 0]))).toBe(den.ids[0]); // 밴드 내 드랍
  });
});

describe("유니크 카탈로그 (18종 — 들판 유니크 6 삭제 후: 밴드 사이드그레이드/추가 15 + 보스 3)", () => {
  it("V2_UNIQUE_IDS 18종, 전부 rarity:unique + 카탈로그 존재", () => {
    expect(V2_UNIQUE_IDS).toHaveLength(18);
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
  it("들판 유니크 삭제 후 1~8층 전부 빈 풀(드랍 없음)", () => {
    for (const f of FLOORS) {
      expect(UNIQUE_FLOOR_POOLS[f].ids, `floor ${f}`).toEqual([]);
    }
  });

  it("18종 전부 어느 풀엔가 등장(밴드 또는 보스, 고아 없음) — floor 풀은 비었으므로 밴드+보스만", () => {
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
    for (const id of V2_UNIQUE_IDS) {
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

describe("BAND_UNIQUE_POOLS — 고유 아이템(Signature, 잊힌 성소 25~42)", () => {
  const empty = new Set<V2EquipmentId>();
  const sanctum = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 25)!;
  const swamp = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 31)!;
  const den = BAND_UNIQUE_POOLS.find((p) => p.minDepth === 37)!;

  it("성소(25~30)·늪지(31~36)·소굴(37~42) = 각 고유 5종, chance 0.0002, 전부 유니크", () => {
    for (const [pool, min, max] of [
      [sanctum, 25, 30],
      [swamp, 31, 36],
      [den, 37, 42],
    ] as const) {
      expect(pool.minDepth).toBe(min);
      expect(pool.maxDepth).toBe(max);
      expect(pool.ids).toHaveLength(5);
      expect(pool.chance).toBe(0.0002);
      for (const id of pool.ids) {
        expect(isUnique(V2_EQUIPMENT[id]), `${id} 유니크`).toBe(true);
      }
    }
  });

  it("깊이 매칭 — 24 이하 빈 풀, 25부터 성소→늪지→소굴, 43+ null(프론티어 끝)", () => {
    expect(bandUniquePoolForDepth(24)!.ids).toEqual([]); // 심층 동굴(빈 풀)
    expect(bandUniquePoolForDepth(25)).toBe(sanctum);
    expect(bandUniquePoolForDepth(30)).toBe(sanctum);
    expect(bandUniquePoolForDepth(31)).toBe(swamp);
    expect(bandUniquePoolForDepth(36)).toBe(swamp);
    expect(bandUniquePoolForDepth(37)).toBe(den);
    expect(bandUniquePoolForDepth(42)).toBe(den);
    expect(bandUniquePoolForDepth(43)).toBeNull();
  });

  it("통과 굴림(rng<chance) → 그 밴드 고유 반환(pick 0 → 첫 id)", () => {
    expect(rollBandUniqueDrop(25, empty, seqRng([0, 0]))).toBe(sanctum.ids[0]);
    expect(rollBandUniqueDrop(31, empty, seqRng([0, 0]))).toBe(swamp.ids[0]);
    expect(rollBandUniqueDrop(42, empty, seqRng([0, 0]))).toBe(den.ids[0]);
  });

  it("굴림 실패(rng≥chance) → null", () => {
    expect(rollBandUniqueDrop(25, empty, () => 0.01)).toBeNull();
  });

  it("중복 드랍 허용 — 전종 보유해도 재드랍(god-roll 추격)", () => {
    const owned = new Set<V2EquipmentId>(den.ids);
    expect(rollBandUniqueDrop(37, owned, seqRng([0, 0]))).toBe(den.ids[0]);
  });

  it("밴드 간 후보 풀이 겹치지 않음", () => {
    const all = [sanctum, swamp, den];
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

  it("마지막 밴드(42) 너머 — 빈 배열 (프론티어 끝, 새 테마 추가 전까지 콘텐츠 없음)", () => {
    // 마지막 밴드는 maxDepth 42 에서 끝(MAX_FRONTIER_DEPTH). 그 너머는 도달 불가·콘텐츠 없음.
    const beyond =
      Math.max(8, ...BAND_UNIQUE_POOLS.map((p) => p.maxDepth)) + 1;
    expect(uniqueIdsForDepthRange(beyond, beyond + 5)).toEqual([]);
  });
});
