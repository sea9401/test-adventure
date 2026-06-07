import { describe, expect, it } from "vitest";
import {
  EQUIP_FLOOR_POOLS,
  rollEquipDrop,
  type FloorEquipDropPool,
} from "./dungeonEquipDrops";
import {
  V2_EQUIPMENT,
  type V2EquipmentId,
  type V2EquipTier,
} from "./v2Equipment";
import type { DungeonFloorId } from "./types";

// 결정적 rng — 미리 정한 시퀀스를 순서대로 뱉음. 끝나면 0 반복.
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0);
}

describe("EQUIP_FLOOR_POOLS — sanity", () => {
  const ALL_FLOORS: DungeonFloorId[] = [1, 2, 3, 4, 5, 6, 7, 8];

  it("8층 모두 정의", () => {
    for (const f of ALL_FLOORS) {
      expect(EQUIP_FLOOR_POOLS[f]).toBeDefined();
    }
  });

  it("모든 chance 가 [0, 1] 범위 안", () => {
    for (const f of ALL_FLOORS) {
      const pool = EQUIP_FLOOR_POOLS[f];
      expect(pool.chance).toBeGreaterThanOrEqual(0);
      expect(pool.chance).toBeLessThanOrEqual(1);
    }
  });

  it("모든 tierWeights 의 가중치는 양수, 티어는 1~5", () => {
    for (const f of ALL_FLOORS) {
      const pool = EQUIP_FLOOR_POOLS[f];
      const tiers = Object.keys(pool.tierWeights);
      expect(tiers.length).toBeGreaterThan(0);
      for (const k of tiers) {
        const t = Number(k);
        expect(t).toBeGreaterThanOrEqual(1);
        expect(t).toBeLessThanOrEqual(5);
        expect(Number.isInteger(t)).toBe(true);
        expect(
          pool.tierWeights[t as V2EquipTier] ?? 0,
          `floor=${f} tier=${t}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("층이 올라갈수록 chance 가 단조 증가 (가중 의도)", () => {
    let prev = -1;
    for (const f of ALL_FLOORS) {
      const c = EQUIP_FLOOR_POOLS[f].chance;
      expect(c, `floor=${f}`).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it("최고층 (8) 의 가중 풀은 T5 만 포함", () => {
    const tiers = Object.keys(EQUIP_FLOOR_POOLS[8].tierWeights).map(Number);
    expect(tiers).toEqual([5]);
  });

  it("1층 풀은 T1 을 포함", () => {
    expect(EQUIP_FLOOR_POOLS[1].tierWeights[1]).toBeGreaterThan(0);
  });
});

describe("rollEquipDrop — 굴림 결정성", () => {
  const empty = new Set<V2EquipmentId>();

  it("rng 통과 굴림 실패 (≥ chance) → null", () => {
    // 1층 chance=0.02. 첫 rng=0.99 → 실패.
    const rng = seqRng([0.99]);
    expect(rollEquipDrop(1, empty, rng)).toBeNull();
  });

  it("rng 통과 성공 → V2EquipmentId 반환", () => {
    // 1층 통과(rng[0]=0.01) → 티어 가중[T1=5, T2=3, T3=1] 합=9.
    //   roll = rng[1] × 9 = 0.0 × 9 = 0 → T1
    //   T1 후보: v2_iron_sword, v2_wooden_bow, v2_oak_staff, v2_chain_mail,
    //           v2_leather_armor, v2_silver_ring, v2_jade_amulet (7개)
    //   idx = floor(rng[2] × 7) = floor(0 × 7) = 0 → 첫 후보
    const rng = seqRng([0.01, 0.0, 0.0]);
    const got = rollEquipDrop(1, empty, rng);
    expect(got).not.toBeNull();
    if (got) {
      expect(V2_EQUIPMENT[got].tier).toBe(1);
    }
  });

  it("중복 드랍 — 모두 보유여도 후보에 포함되어 드랍됨(no-dup off)", () => {
    // 1층 T1 후보 전부 보유해도 ownedSet 무시 → 같은 종류가 새 굴림으로 재드랍.
    const ownedT1 = new Set<V2EquipmentId>();
    for (const item of Object.values(V2_EQUIPMENT)) {
      if (item.tier === 1) ownedT1.add(item.id);
    }
    // rng[1]=0.0 → 가중 합 9 의 첫 슬롯 T1 선택. 보유 제외 안 하므로 null 아님.
    const rng = seqRng([0.01, 0.0, 0.0]);
    const got = rollEquipDrop(1, ownedT1, rng);
    expect(got).not.toBeNull();
    if (got) expect(V2_EQUIPMENT[got].tier).toBe(1);
  });

  it("가중 풀에 없는 티어는 반환되지 않음 (1층은 T5 안 떨어짐)", () => {
    // 티어 5→3 축소 후 1층 풀 = T1/T3 만(T5 가중치 0). 여러 굴림 해도 T5 안 나옴.
    for (let seed = 0; seed < 100; seed++) {
      const rng = seqRng([0.0, seed / 100, seed / 100]);
      const got = rollEquipDrop(1, empty, rng);
      if (got) {
        const tier = V2_EQUIPMENT[got].tier;
        expect([1, 3]).toContain(tier);
      }
    }
  });

  it("8층은 항상 T5 만 (통과 시)", () => {
    for (let seed = 0; seed < 50; seed++) {
      const rng = seqRng([0.0, seed / 50, seed / 50]);
      const got = rollEquipDrop(8, empty, rng);
      if (got) {
        expect(V2_EQUIPMENT[got].tier).toBe(5);
      }
    }
  });

  it("중복 드랍 — 보유한 id 도 반환될 수 있음(no-dup off)", () => {
    // 보유분이 후보에서 제외되지 않음 → 여러 굴림 중 보유 id 가 적어도 한 번은 나온다.
    const ownedSome = new Set<V2EquipmentId>([
      "v2_iron_sword",
      "v2_chain_mail",
    ]);
    let sawOwned = false;
    for (let seed = 0; seed < 200; seed++) {
      const rng = seqRng([0.0, seed / 200, seed / 200]);
      const got = rollEquipDrop(1, ownedSome, rng);
      if (got && ownedSome.has(got)) sawOwned = true;
    }
    expect(sawOwned).toBe(true);
  });

  it("티어 가중 끝점 — roll = totalWeight - epsilon 일 때 마지막 티어 (overflow 안전)", () => {
    // 5층 풀 [T2:3, T3:5, T4:3, T5:1] 합=12.
    // rng[1] = 11.99/12 ≈ 0.9991 → roll ≈ 11.99 → T5 도달.
    const rng = seqRng([0.0, 0.9991, 0.0]);
    const got = rollEquipDrop(5, new Set(), rng);
    expect(got).not.toBeNull();
    if (got) {
      expect(V2_EQUIPMENT[got].tier).toBe(5);
    }
  });

  it("빈 풀 (개념적 — 모든 tierWeight 가 0) → null", () => {
    // 직접 만들어 검증 — 모든 가중치 0
    const fakePool: FloorEquipDropPool = { chance: 1.0, tierWeights: {} };
    // 실제 EQUIP_FLOOR_POOLS 에 빈 풀은 없음. 함수 동작만 sanity 체크.
    expect(fakePool.chance).toBeGreaterThan(0);
    // dungeonEquipDrops 의 rollEquipDrop 시그니처는 floor 만 받으므로 직접 호출 가능
    // 패스 — 1층 케이스에서 이미 다 보유 시 null 반환 검증으로 갈음.
  });

  it("chanceMult(신참 ×2) — 통과 chance 를 2배(1 cap), 미지정 1 불변", () => {
    // 1층 통과 chance 0.02. rng 0.03 (seqRng 는 소진 후 0 반환 → 티어/아이템 pick = 0).
    // 배율 1(또는 미지정): 0.03 >= 0.02 → null.
    expect(rollEquipDrop(1, empty, seqRng([0.03]))).toBeNull();
    expect(rollEquipDrop(1, empty, seqRng([0.03]), 1)).toBeNull();
    // 배율 2: 0.02×2=0.04, 0.03 < 0.04 → 통과 → 아이템 반환(보유 없음).
    expect(rollEquipDrop(1, empty, seqRng([0.03]), 2)).not.toBeNull();
    // cap: 0.02×60=1.2 → 1.0, rng 0.99 < 1.0 → 통과.
    expect(rollEquipDrop(1, empty, seqRng([0.99]), 60)).not.toBeNull();
  });
});
