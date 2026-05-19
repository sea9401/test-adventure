import { describe, expect, it } from "vitest";
import {
  EnhanceError,
  computeEnhanceOutcome,
} from "./enhance";
import type { EquipmentInstance } from "@/adventure/inventory/equipmentInstances";

const inst = (
  instanceId: string,
  enhancementLevel: number,
  itemId: EquipmentInstance["itemId"] = "starlit_greatsword_str",
): EquipmentInstance => ({ instanceId, itemId, enhancementLevel });

describe("computeEnhanceOutcome", () => {
  it("정상 +1 강화 — 별빛 조각 차감 + 인스턴스 단계 +1", () => {
    const out = computeEnhanceOutcome(
      {
        materials: { starfall_shard: 100 },
        equipmentInstances: [inst("a", 0)],
      },
      "a",
    );
    expect(out.materials).toEqual({ starfall_shard: 70 }); // 100 - 30
    expect(out.equipmentInstances).toEqual([
      { instanceId: "a", itemId: "starlit_greatsword_str", enhancementLevel: 1 },
    ]);
    expect(out.toLevel).toBe(1);
    expect(out.shardsSpent).toBe(30);
  });

  it("4→5 풀강 — 250 조각 차감", () => {
    const out = computeEnhanceOutcome(
      {
        materials: { starfall_shard: 300 },
        equipmentInstances: [inst("b", 4)],
      },
      "b",
    );
    expect(out.materials.starfall_shard).toBe(50);
    expect(out.equipmentInstances[0].enhancementLevel).toBe(5);
    expect(out.toLevel).toBe(5);
  });

  it("조각 부족 → insufficient_shards", () => {
    expect(() =>
      computeEnhanceOutcome(
        {
          materials: { starfall_shard: 29 },
          equipmentInstances: [inst("c", 0)],
        },
        "c",
      ),
    ).toThrow(EnhanceError);
  });

  it("최대 단계 (+7) → max_level", () => {
    expect(() =>
      computeEnhanceOutcome(
        {
          materials: { starfall_shard: 1000 },
          equipmentInstances: [inst("d", 7)],
        },
        "d",
      ),
    ).toThrow(EnhanceError);
  });

  it("인스턴스 못 찾음 → instance_not_found", () => {
    expect(() =>
      computeEnhanceOutcome(
        {
          materials: { starfall_shard: 1000 },
          equipmentInstances: [inst("a", 0)],
        },
        "nonexistent",
      ),
    ).toThrow(EnhanceError);
  });

  it("다른 인스턴스는 건드리지 않는다", () => {
    const out = computeEnhanceOutcome(
      {
        materials: { starfall_shard: 100 },
        equipmentInstances: [inst("a", 0), inst("b", 2)],
      },
      "a",
    );
    expect(out.equipmentInstances).toHaveLength(2);
    expect(out.equipmentInstances[0].enhancementLevel).toBe(1);
    expect(out.equipmentInstances[1].enhancementLevel).toBe(2); // 안 건드림
  });

  it("starfall_shard 가 정확히 0 이 되면 entry 가 사라진다", () => {
    const out = computeEnhanceOutcome(
      {
        materials: { starfall_shard: 30, other_mat: 5 },
        equipmentInstances: [inst("a", 0)],
      },
      "a",
    );
    expect(out.materials).toEqual({ other_mat: 5 });
  });
});
