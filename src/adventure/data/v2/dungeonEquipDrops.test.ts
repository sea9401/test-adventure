import { describe, expect, it } from "vitest";
import {
  STARTER_DROP_POOL,
  STARTER_END_DEPTH,
  dropPoolForDepth,
  rollEquipDrop,
} from "./dungeonEquipDrops";
import { V2_EQUIPMENT, type V2EquipmentId } from "./v2Equipment";

// 결정적 rng — 미리 정한 시퀀스를 순서대로 뱉음. 끝나면 0 반복.
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0);
}

const empty = new Set<V2EquipmentId>();

describe("STARTER_DROP_POOL — 스타터 단일 풀 (들판)", () => {
  it("chance 0.012(2026-06-13 ÷5), tierWeights {1:3, 2:2, 3:1}", () => {
    expect(STARTER_DROP_POOL.chance).toBe(0.012);
    expect(STARTER_DROP_POOL.tierWeights).toEqual({ 1: 3, 2: 2, 3: 1 });
  });

  it("티어별 처치당 확률 = chance × weight/총합 — T1 3% / T2 2% / T3 1%", () => {
    const w = STARTER_DROP_POOL.tierWeights;
    const total = (w[1] ?? 0) + (w[2] ?? 0) + (w[3] ?? 0);
    expect(STARTER_DROP_POOL.chance * ((w[1] ?? 0) / total)).toBeCloseTo(0.006, 5);
    expect(STARTER_DROP_POOL.chance * ((w[2] ?? 0) / total)).toBeCloseTo(0.004, 5);
    expect(STARTER_DROP_POOL.chance * ((w[3] ?? 0) / total)).toBeCloseTo(0.002, 5);
  });
});

describe("dropPoolForDepth — 깊이 게이트", () => {
  it("깊이 1~6(스타터 구간=들판) → 스타터 풀 (깊은 산 삭제 후)", () => {
    expect(STARTER_END_DEPTH).toBe(6);
    for (const d of [1, 3, 6]) {
      expect(dropPoolForDepth(d), `depth ${d}`).toBe(STARTER_DROP_POOL);
    }
  });

  it("프론티어(7+)·범위 밖(≤0) → null (정규 드랍 없음 — 밴드 콘텐츠 구간)", () => {
    for (const d of [7, 12, 13, 50, 999, 0, -1]) {
      expect(dropPoolForDepth(d), `depth ${d}`).toBeNull();
    }
  });
});

describe("rollEquipDrop", () => {
  it("통과 굴림 실패 (rng ≥ chance 0.012) → null", () => {
    expect(rollEquipDrop(1, empty, seqRng([0.99]))).toBeNull();
  });

  it("통과 성공 → V2EquipmentId 반환 (스타터 티어)", () => {
    // rng[0]=0.01<0.012 통과 → 티어 pick(rng[1]=0 → 첫 티어) → 후보 pick(rng[2]=0).
    const got = rollEquipDrop(1, empty, seqRng([0.01, 0.0, 0.0]));
    expect(got).not.toBeNull();
    if (got) expect([1, 2, 3]).toContain(V2_EQUIPMENT[got].tier);
  });

  it("프론티어(깊이 13+) → 항상 null (풀 없음 — 통과 굴림 이전에 차단)", () => {
    for (const d of [13, 30, 999]) {
      expect(rollEquipDrop(d, empty, seqRng([0, 0, 0])), `depth ${d}`).toBeNull();
    }
  });

  it("스타터 풀은 T1/T2/T3 셋 다 나옴 (가중 3:2:1)", () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      const got = rollEquipDrop(6, empty, seqRng([0.0, seed / 200, seed / 200]));
      if (got) seen.add(V2_EQUIPMENT[got].tier);
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it("중복 드랍(no-dup off) — 모두 보유여도 드랍 + 보유 id 도 반환", () => {
    const ownedT1 = new Set<V2EquipmentId>();
    for (const item of Object.values(V2_EQUIPMENT)) {
      if (item.tier === 1) ownedT1.add(item.id);
    }
    // 통과 + T1 선택돼도 보유 제외 안 함 → null 아님.
    expect(rollEquipDrop(1, ownedT1, seqRng([0.01, 0.0, 0.0]))).not.toBeNull();
    // 여러 굴림 중 보유 id 도 나온다.
    let sawOwned = false;
    for (let seed = 0; seed < 200; seed++) {
      const g = rollEquipDrop(1, ownedT1, seqRng([0.0, seed / 200, seed / 200]));
      if (g && ownedT1.has(g)) sawOwned = true;
    }
    expect(sawOwned).toBe(true);
  });

  it("티어 가중 끝점 — roll = total - epsilon → 마지막 티어(T3) (overflow 안전)", () => {
    // 스타터 풀 {1:3, 2:2, 3:1} 합=6. rng[1]=0.9991 → roll≈5.99 → 마지막 티어 T3.
    const got = rollEquipDrop(6, empty, seqRng([0.0, 0.9991, 0.0]));
    expect(got).not.toBeNull();
    if (got) expect(V2_EQUIPMENT[got].tier).toBe(3);
  });

  it("chanceMult(신참 ×2 — 라이브 미사용이나 파라미터 동작) — 통과 chance 배수(1 cap)", () => {
    // 스타터 chance 0.012. rng 0.018 (소진 후 0 → 티어/아이템 pick=0).
    // 배율 1(또는 미지정): 0.018 >= 0.012 → null.
    expect(rollEquipDrop(1, empty, seqRng([0.018]))).toBeNull();
    expect(rollEquipDrop(1, empty, seqRng([0.018]), 1)).toBeNull();
    // 배율 2: 0.012×2=0.024, 0.018 < 0.024 → 통과.
    expect(rollEquipDrop(1, empty, seqRng([0.018]), 2)).not.toBeNull();
    // cap: 0.012×100=1.2 → 1.0, rng 0.99 < 1.0 → 통과.
    expect(rollEquipDrop(1, empty, seqRng([0.99]), 100)).not.toBeNull();
  });
});
