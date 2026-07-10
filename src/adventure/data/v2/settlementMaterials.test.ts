import { describe, it, expect } from "vitest";
import {
  SETTLEMENT_MATERIAL_ID,
  SETTLEMENT_MATERIALS,
  SETTLEMENT_MATERIAL_TO_KIND,
  SETTLEMENT_MATERIAL_DROP_PCT,
  rollSettlementMaterialDrops,
} from "./settlementMaterials";
import { V2_MATERIALS, V2_MATERIAL_SELL_PRICE } from "./dungeonDrops";
import { isTradableMaterial } from "@/lib/server/marketplaceV2";

// 시퀀스 rng — 호출마다 다음 값 반환(소진 후 마지막값 유지). 굴림 draw 수 검증용.
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const { timber, ironOre } = SETTLEMENT_MATERIAL_ID;

describe("정착지 재료 — 통나무/철광석 수급", () => {
  it("rollSettlementMaterialDrops — 통나무 드랍은 잠금, 철광석 draw 는 유지", () => {
    const draws: number[] = [];
    const rng = (() => {
      const seq = seqRng([0.0, 0.0]);
      return () => {
        const v = seq();
        draws.push(v);
        return v;
      };
    })();
    expect(rollSettlementMaterialDrops(rng)).toEqual({ [ironOre]: 1 });
    expect(draws).toHaveLength(2); // 종류별 1 draw
  });

  it("둘 다 pct 이상이면 빈 결과", () => {
    expect(rollSettlementMaterialDrops(seqRng([0.9, 0.9]))).toEqual({});
  });

  it("드랍률 다이얼 — 통나무는 0, 철광석은 기존 드랍 유지", () => {
    expect(SETTLEMENT_MATERIAL_DROP_PCT[timber]).toBe(0);
    expect(SETTLEMENT_MATERIAL_DROP_PCT[ironOre]).toBe(0.003);
  });

  it("철광석만 부분 통과한다", () => {
    const op = SETTLEMENT_MATERIAL_DROP_PCT[ironOre];
    expect(rollSettlementMaterialDrops(seqRng([0, op - 1e-9]))).toEqual({
      [ironOre]: 1,
    });
  });

  it("철광석 경계 — rng === pct 면 실패(< 비교), pct-ε 면 통과", () => {
    const op = SETTLEMENT_MATERIAL_DROP_PCT[ironOre];
    expect(rollSettlementMaterialDrops(seqRng([0, op]))).toEqual({});
    expect(rollSettlementMaterialDrops(seqRng([0, op - 1e-9]))).toEqual({
      [ironOre]: 1,
    });
  });

  it("철광석 수량은 항상 1 (qty>1 없음)", () => {
    const r = rollSettlementMaterialDrops(seqRng([0, 0]));
    expect(r[timber]).toBeUndefined();
    expect(r[ironOre]).toBe(1);
  });

  it("카탈로그 등재 → 거래소 거래 가능, NPC 판매가 비등재", () => {
    expect(V2_MATERIALS[timber]).toBeDefined();
    expect(V2_MATERIALS[ironOre]).toBeDefined();
    expect(isTradableMaterial(timber)).toBe(true);
    expect(isTradableMaterial(ironOre)).toBe(true);
    expect(V2_MATERIAL_SELL_PRICE[timber]).toBeUndefined();
    expect(V2_MATERIAL_SELL_PRICE[ironOre]).toBeUndefined();
  });

  it("기부 적립 매핑 — 통나무→crop / 철광석→ore", () => {
    expect(SETTLEMENT_MATERIAL_TO_KIND[timber]).toBe("crop");
    expect(SETTLEMENT_MATERIAL_TO_KIND[ironOre]).toBe("ore");
  });

  it("이름 — 통나무/철광석", () => {
    expect(SETTLEMENT_MATERIALS[timber].name).toBe("통나무");
    expect(SETTLEMENT_MATERIALS[ironOre].name).toBe("철광석");
  });
});
