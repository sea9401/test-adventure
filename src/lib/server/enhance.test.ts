import { describe, expect, it } from "vitest";
import {
  EnhanceError,
  computeEnhanceOutcome,
  type EnhanceComputeInput,
} from "./enhance";
import type { EquipmentInstance } from "@/adventure/inventory/equipmentInstances";

const inst = (
  instanceId: string,
  enhancementLevel: number,
  itemId: EquipmentInstance["itemId"] = "starlit_greatsword_str",
): EquipmentInstance => ({
  instanceId,
  itemId,
  enhancementLevel,
  remainingAttempts: 7,
});

// 결정적 RNG — 성공/실패 시뮬레이션 헬퍼.
const alwaysSuccess = () => 0;
const alwaysFail = () => 0.999;

describe("computeEnhanceOutcome — safe (100%) 모드", () => {
  it("정상 +1 강화 — 별빛 조각 차감 + 인스턴스 단계 +1 + history push", () => {
    const out = computeEnhanceOutcome(
      {
        materials: { starfall_shard: 100 },
        equipmentInstances: [inst("a", 0)],
      },
      "a",
      "safe",
      alwaysSuccess,
    );
    expect(out.materials).toEqual({ starfall_shard: 70 }); // 100 - 30
    expect(out.equipmentInstances[0].enhancementLevel).toBe(1);
    expect(out.equipmentInstances[0].enhanceHistory).toEqual(["safe"]);
    expect(out.equipmentInstances[0].remainingAttempts).toBe(6); // 7 - 1 (성공도 시도 카운터 차감)
    expect(out.success).toBe(true);
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
      "safe",
      alwaysSuccess,
    );
    expect(out.materials.starfall_shard).toBe(50);
    expect(out.equipmentInstances[0].enhancementLevel).toBe(5);
    expect(out.toLevel).toBe(5);
  });

  it("6→7 단계 — 700 조각 차감", () => {
    const out = computeEnhanceOutcome(
      {
        materials: { starfall_shard: 800 },
        equipmentInstances: [inst("c", 6)],
      },
      "c",
      "safe",
      alwaysSuccess,
    );
    expect(out.shardsSpent).toBe(700);
    expect(out.equipmentInstances[0].enhancementLevel).toBe(7);
  });

  it("조각 부족 → insufficient_shards", () => {
    expect(() =>
      computeEnhanceOutcome(
        {
          materials: { starfall_shard: 29 },
          equipmentInstances: [inst("c", 0)],
        },
        "c",
        "safe",
        alwaysSuccess,
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
        "safe",
        alwaysSuccess,
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
        "safe",
        alwaysSuccess,
      ),
    ).toThrow(EnhanceError);
  });
});

describe("computeEnhanceOutcome — 확률 모드 실패", () => {
  it("실패 시 단계 그대로, remainingAttempts -1, 비용은 차감", () => {
    const out = computeEnhanceOutcome(
      {
        materials: { starfall_shard: 100 },
        equipmentInstances: [inst("a", 0)],
      },
      "a",
      "boost", // 70%
      alwaysFail,
    );
    expect(out.success).toBe(false);
    expect(out.materials.starfall_shard).toBe(70); // 비용은 차감
    expect(out.equipmentInstances[0].enhancementLevel).toBe(0); // 단계 그대로
    expect(out.equipmentInstances[0].enhanceHistory).toBeUndefined();
    expect(out.equipmentInstances[0].remainingAttempts).toBe(6); // 7 - 1
    expect(out.toLevel).toBe(0);
    expect(out.remainingAttempts).toBe(6);
  });

  it("성공 시 모드가 history 에 들어가고 시도 카운터도 -1", () => {
    const out = computeEnhanceOutcome(
      {
        materials: { starfall_shard: 100 },
        equipmentInstances: [inst("a", 0)],
      },
      "a",
      "extreme", // 10%
      alwaysSuccess,
    );
    expect(out.success).toBe(true);
    expect(out.equipmentInstances[0].enhanceHistory).toEqual(["extreme"]);
    expect(out.equipmentInstances[0].remainingAttempts).toBe(6); // 성공/실패 무관 -1
  });

  it("safe 7회 연속 성공 → +7 도달과 동시에 remainingAttempts 0 (총 시도 한도 소진)", () => {
    let state: EnhanceComputeInput = {
      materials: { starfall_shard: 10_000 },
      equipmentInstances: [inst("a", 0)],
    };
    for (let i = 0; i < 7; i += 1) {
      const out = computeEnhanceOutcome(state, "a", "safe", alwaysSuccess);
      state = { materials: out.materials, equipmentInstances: out.equipmentInstances };
    }
    expect(state.equipmentInstances[0].enhancementLevel).toBe(7);
    expect(state.equipmentInstances[0].remainingAttempts).toBe(0);
  });

  it("실패가 섞이면 +7 도달 전에 시도 한도가 먼저 소진 — 천장 깎임", () => {
    let state: EnhanceComputeInput = {
      materials: { starfall_shard: 10_000 },
      equipmentInstances: [inst("a", 0)],
    };
    // 첫 시도만 실패, 나머지는 성공 — 총 7회 시도 후 enhancementLevel=6, remainingAttempts=0.
    const rngs = [alwaysFail, alwaysSuccess, alwaysSuccess, alwaysSuccess, alwaysSuccess, alwaysSuccess, alwaysSuccess];
    for (const rng of rngs) {
      const out = computeEnhanceOutcome(state, "a", "boost", rng);
      state = { materials: out.materials, equipmentInstances: out.equipmentInstances };
    }
    expect(state.equipmentInstances[0].enhancementLevel).toBe(6);
    expect(state.equipmentInstances[0].remainingAttempts).toBe(0);
  });

  it("remainingAttempts 0 → no_attempts", () => {
    const broken: EquipmentInstance = {
      instanceId: "ceiling",
      itemId: "starlit_greatsword_str",
      enhancementLevel: 1,
      remainingAttempts: 0,
    };
    expect(() =>
      computeEnhanceOutcome(
        {
          materials: { starfall_shard: 1000 },
          equipmentInstances: [broken],
        },
        "ceiling",
        "safe",
        alwaysSuccess,
      ),
    ).toThrow(EnhanceError);
  });
});

describe("computeEnhanceOutcome — 부수 검증", () => {
  it("다른 인스턴스는 건드리지 않는다", () => {
    const out = computeEnhanceOutcome(
      {
        materials: { starfall_shard: 100 },
        equipmentInstances: [inst("a", 0), inst("b", 2)],
      },
      "a",
      "safe",
      alwaysSuccess,
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
      "safe",
      alwaysSuccess,
    );
    expect(out.materials).toEqual({ other_mat: 5 });
  });
});
