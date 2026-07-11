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
  it("rollSettlementMaterialDrops — 생활 채집 전환 후 두 재료 모두 잠그되 draw 수는 유지", () => {
    const draws: number[] = [];
    const rng = (() => {
      const seq = seqRng([0.0, 0.0]);
      return () => {
        const v = seq();
        draws.push(v);
        return v;
      };
    })();
    expect(rollSettlementMaterialDrops(rng)).toEqual({});
    expect(draws).toHaveLength(2); // 종류별 1 draw
  });

  it("둘 다 pct 이상이면 빈 결과", () => {
    expect(rollSettlementMaterialDrops(seqRng([0.9, 0.9]))).toEqual({});
  });

  it("드랍률 다이얼 — 통나무와 철광석 모두 생활 채집으로 이동", () => {
    expect(SETTLEMENT_MATERIAL_DROP_PCT[timber]).toBe(0);
    expect(SETTLEMENT_MATERIAL_DROP_PCT[ironOre]).toBe(0);
  });

  it("최저 굴림에도 사냥 보상으로 나오지 않는다", () => {
    const r = rollSettlementMaterialDrops(seqRng([0, 0]));
    expect(r[timber]).toBeUndefined();
    expect(r[ironOre]).toBeUndefined();
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

  it("이름 — 소나무 원목/철광석", () => {
    expect(SETTLEMENT_MATERIALS[timber].name).toBe("소나무 원목");
    expect(SETTLEMENT_MATERIALS[ironOre].name).toBe("철광석");
  });
});
