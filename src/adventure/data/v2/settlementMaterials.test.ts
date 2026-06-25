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

describe("정착지 재료 — 통나무/철광석 독립 드랍", () => {
  it("rollSettlementMaterialDrops — 둘 다 pct 미만이면 각 1개(정확히 2 draw 소비)", () => {
    const draws: number[] = [];
    const rng = (() => {
      const seq = seqRng([0.0, 0.0]);
      return () => {
        const v = seq();
        draws.push(v);
        return v;
      };
    })();
    expect(rollSettlementMaterialDrops(rng)).toEqual({
      [timber]: 1,
      [ironOre]: 1,
    });
    expect(draws).toHaveLength(2); // 종류별 1 draw
  });

  it("둘 다 pct 이상이면 빈 결과", () => {
    expect(rollSettlementMaterialDrops(seqRng([0.9, 0.9]))).toEqual({});
  });

  it("부분 통과 — 통나무만 / 철광석만", () => {
    // 드랍률 다이얼에 무관하게 — pct 미만이면 통과, pct 이상이면 실패.
    const tp = SETTLEMENT_MATERIAL_DROP_PCT[timber];
    const op = SETTLEMENT_MATERIAL_DROP_PCT[ironOre];
    // timber 통과(< tp), ironOre 실패(= op)
    expect(rollSettlementMaterialDrops(seqRng([tp - 1e-9, op]))).toEqual({
      [timber]: 1,
    });
    // timber 실패(= tp), ironOre 통과(< op)
    expect(rollSettlementMaterialDrops(seqRng([tp, op - 1e-9]))).toEqual({
      [ironOre]: 1,
    });
  });

  it("경계 — rng === pct 면 실패(< 비교), pct-ε 면 통과", () => {
    const tp = SETTLEMENT_MATERIAL_DROP_PCT[timber];
    const op = SETTLEMENT_MATERIAL_DROP_PCT[ironOre];
    expect(rollSettlementMaterialDrops(seqRng([tp, op]))).toEqual({}); // 동일값=실패
    expect(
      rollSettlementMaterialDrops(seqRng([tp - 1e-9, op - 1e-9])),
    ).toEqual({ [timber]: 1, [ironOre]: 1 });
  });

  it("수량은 항상 1 (qty>1 없음)", () => {
    const r = rollSettlementMaterialDrops(seqRng([0, 0]));
    expect(r[timber]).toBe(1);
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
