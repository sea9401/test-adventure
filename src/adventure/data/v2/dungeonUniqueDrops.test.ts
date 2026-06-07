import { describe, expect, it } from "vitest";
import {
  UNIQUE_FLOOR_POOLS,
  V2_UNIQUE_IDS,
  rollUniqueDrop,
} from "./dungeonUniqueDrops";
import {
  V2_EQUIPMENT,
  isUnique,
  shopPriceOf,
  type V2EquipmentId,
} from "./v2Equipment";
import { V2_RECIPES } from "./v2Recipes";
import { rollEquipDrop } from "./dungeonEquipDrops";
import type { DungeonFloorId } from "./types";

const FLOORS: DungeonFloorId[] = [1, 2, 3, 4, 5, 6, 7, 8];

// 결정적 rng — 미리 정한 시퀀스를 순서대로. 소진 후 0.
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0);
}

describe("유니크 카탈로그 (Phase 2 — 6종)", () => {
  it("V2_UNIQUE_IDS 6종, 전부 rarity:unique + 카탈로그 존재", () => {
    expect(V2_UNIQUE_IDS).toHaveLength(6);
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

  it("풀의 모든 id 가 유효 유니크 + 6종 전부 어느 층엔가 등장(고아 없음)", () => {
    const inPools = new Set<string>();
    for (const f of FLOORS) {
      for (const id of UNIQUE_FLOOR_POOLS[f].ids) {
        expect(isUnique(V2_EQUIPMENT[id]), id).toBe(true);
        inPools.add(id);
      }
    }
    for (const id of V2_UNIQUE_IDS) {
      expect(inPools.has(id), `${id} 어느 층에도 안 떨어짐`).toBe(true);
    }
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
  it("정규 T1 전부 보유 + T1 강제 pick 이어도 유니크(shadow_garb) 안 나옴 → null", () => {
    // 1층 유니크 shadow_garb 는 T1. 정규 T1 전량 보유 시 후보는 비어야(유니크 제외) null.
    // 가드 빠지면 미보유 shadow_garb 가 유일 후보로 반환됨 → 회귀 가드.
    const t1NonUnique = Object.values(V2_EQUIPMENT)
      .filter((i) => i.tier === 1 && !isUnique(i))
      .map((i) => i.id);
    const owned = new Set<V2EquipmentId>(t1NonUnique);
    // rng: pass(0<0.02) → tier pick(0 → tier1) → candidate pick(미사용).
    expect(rollEquipDrop(1, owned, seqRng([0, 0, 0]))).toBeNull();
  });
});
