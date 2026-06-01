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
  type V2Equipment,
  type V2EquipmentId,
} from "./v2Equipment";
import type { DungeonFloorId } from "./types";

const FLOORS: DungeonFloorId[] = [1, 2, 3, 4, 5, 6, 7, 8];

describe("유니크 드랍 훅 (Phase 1 — populate 전 스캐폴드)", () => {
  it("V2_UNIQUE_IDS 는 비어 있음 (아직 유니크 0종)", () => {
    expect(V2_UNIQUE_IDS).toEqual([]);
  });

  it("UNIQUE_FLOOR_POOLS 전 층 빈 풀(chance 0, ids [])", () => {
    for (const f of FLOORS) {
      expect(UNIQUE_FLOOR_POOLS[f].chance, `floor ${f}`).toBe(0);
      expect(UNIQUE_FLOOR_POOLS[f].ids, `floor ${f}`).toEqual([]);
    }
  });

  it("rollUniqueDrop 은 전 층에서 null (빈 풀 — rng·배율 무관)", () => {
    const owned = new Set<V2EquipmentId>();
    for (const f of FLOORS) {
      expect(rollUniqueDrop(f, owned, () => 0), `floor ${f}`).toBeNull();
      expect(
        rollUniqueDrop(f, owned, () => 0, 100),
        `floor ${f} ×100`,
      ).toBeNull();
    }
  });
});

describe("유니크 가드 (isUnique / shopPriceOf)", () => {
  const common = V2_EQUIPMENT["v2_iron_sword"]; // 정규 카탈로그

  it("정규 장비는 isUnique=false, 상점가 있음", () => {
    expect(isUnique(common)).toBe(false);
    expect(shopPriceOf(common)).toBeGreaterThan(0);
  });

  it("유니크(rarity)는 isUnique=true, 상점 비매(undefined)", () => {
    const uniq: V2Equipment = { ...common, rarity: "unique" };
    expect(isUnique(uniq)).toBe(true);
    expect(shopPriceOf(uniq)).toBeUndefined();
  });
});
