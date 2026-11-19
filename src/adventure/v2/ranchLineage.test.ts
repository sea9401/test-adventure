import { describe, expect, it } from "vitest";
import { FarmError, emptyFarmState, type FarmState } from "./farm";
import { unlockRanchSlot } from "./ranch";
import {
  breedFarmRanchSlot,
  ranchBreedBlockReason,
  ranchBreedCost,
  type RanchBreedContext,
} from "./ranchLineage";
import { ranchLineageBreedChancePct } from "./ranchLineageRules";

const NOW = 1_800_000_000_000;
const NO_MASTER: RanchBreedContext = { masterUnlocked: false, masterCropHeld: 0 };

function farm(inventory: FarmState["inventory"], lineage?: FarmState["ranch"]["lineage"]): FarmState {
  const base = emptyFarmState(NOW);
  // slot-1 닭, slot-2 소, slot-3 돼지.
  let ranch = unlockRanchSlot(base.ranch, "slot-2", "cow", 100, NOW).ranch;
  ranch = unlockRanchSlot(ranch, "slot-3", "pig", 100, NOW).ranch;
  return { ...base, inventory, ranch: lineage ? { ...ranch, lineage } : ranch };
}

describe("교배 비용과 확률", () => {
  it("동물마다 산물이 다르고 배합 사료는 20개다", () => {
    expect(ranchBreedCost("chicken", 0)).toEqual({ productItemId: "egg", products: 60, feed: 20, masterCrop: 0 });
    expect(ranchBreedCost("cow", 1)).toEqual({ productItemId: "milk", products: 30, feed: 20, masterCrop: 0 });
    expect(ranchBreedCost("pig", 2)).toEqual({ productItemId: "pork", products: 20, feed: 20, masterCrop: 0 });
    // 명품에서 명장 혈통으로 가는 교배에는 명장 작물이 든다.
    expect(ranchBreedCost("pig", 3)).toEqual({ productItemId: "pork", products: 20, feed: 20, masterCrop: 2 });
    expect(ranchBreedCost("pig", 4)).toBeNull();
  });

  it("실패할 때마다 성공률이 오른다", () => {
    expect([0, 1, 2, 3].map((grade) => ranchLineageBreedChancePct({ grade, fails: 0 }))).toEqual([50, 20, 6, 3]);
    expect(ranchLineageBreedChancePct({ grade: 0, fails: 3 })).toBe(80);
    expect(ranchLineageBreedChancePct({ grade: 0, fails: 9 })).toBe(100);
    expect(ranchLineageBreedChancePct({ grade: 2, fails: 10 })).toBe(16);
    expect(ranchLineageBreedChancePct({ grade: 3, fails: 4 })).toBe(5);
    expect(ranchLineageBreedChancePct({ grade: 4, fails: 0 })).toBe(0);
  });
});

describe("교배", () => {
  it("성공하면 등급이 오르고 실패 기록이 지워진다", () => {
    const state = farm({ egg: 61, compound_feed: 25 }, { "slot-1": { grade: 0, fails: 2 } });
    // 성공률 70% → 0.69는 성공.
    const done = breedFarmRanchSlot(state, "slot-1", NO_MASTER, () => 0.69, NOW);
    expect(done.result).toMatchObject({
      slotId: "slot-1",
      animalId: "chicken",
      success: true,
      grade: 1,
      fails: 0,
      chancePct: 70,
    });
    expect(done.state.ranch.lineage).toEqual({ "slot-1": { grade: 1, fails: 0 } });
    expect(done.state.inventory).toEqual({ egg: 1, compound_feed: 5 });
  });

  it("교배해도 그 칸에 남겨 둔 산물 몫은 사라지지 않는다", () => {
    const state = farm(
      { egg: 120, compound_feed: 40 },
      { "slot-1": { grade: 1, fails: 0, yieldCarryPct: 50 } },
    );
    const failed = breedFarmRanchSlot(state, "slot-1", NO_MASTER, () => 0.99, NOW);
    expect(failed.state.ranch.lineage).toEqual({ "slot-1": { grade: 1, fails: 1, yieldCarryPct: 50 } });
    const succeeded = breedFarmRanchSlot(failed.state, "slot-1", NO_MASTER, () => 0, NOW);
    expect(succeeded.state.ranch.lineage).toEqual({ "slot-1": { grade: 2, fails: 0, yieldCarryPct: 50 } });
  });

  it("실패하면 재료만 쓰고 그 칸의 실패 기록이 는다", () => {
    const state = farm({ milk: 30, compound_feed: 20 });
    // 성공률 50% → 0.5는 실패.
    const done = breedFarmRanchSlot(state, "slot-2", NO_MASTER, () => 0.5, NOW);
    expect(done.result).toMatchObject({ success: false, grade: 0, fails: 1, chancePct: 50 });
    expect(done.state.ranch.lineage).toEqual({ "slot-2": { grade: 0, fails: 1 } });
    // 정확히 다 쓴 재료는 남기지 않는다.
    expect(done.state.inventory).toEqual({});
  });

  it("명장 혈통 교배는 농사 주전공 명장 조건과 명장 작물이 필요하다", () => {
    const state = farm({ pork: 40, compound_feed: 40 }, { "slot-3": { grade: 3, fails: 0 } });
    expect(ranchBreedBlockReason(state, "slot-3", NO_MASTER)).toBe("lineage_master_locked");
    expect(ranchBreedBlockReason(state, "slot-3", { masterUnlocked: true, masterCropHeld: 1 })).toBe(
      "not_enough_master_crop",
    );
    const done = breedFarmRanchSlot(state, "slot-3", { masterUnlocked: true, masterCropHeld: 2 }, () => 0, NOW);
    expect(done.result).toMatchObject({ success: true, grade: 4 });
    expect(done.result.cost.masterCrop).toBe(2);
    expect(ranchBreedBlockReason(done.state, "slot-3", { masterUnlocked: true, masterCropHeld: 9 })).toBe(
      "lineage_max",
    );
  });

  it("재료가 모자라거나 칸이 비어 있으면 사유를 던지고 굴리지 않는다", () => {
    const fail = () => {
      throw new Error("rng must not run");
    };
    const cases: Array<[FarmState, Parameters<typeof breedFarmRanchSlot>[1], string]> = [
      [farm({ egg: 59, compound_feed: 20 }), "slot-1", "not_enough_ranch_products"],
      [farm({ egg: 60, compound_feed: 19 }), "slot-1", "not_enough_feed"],
      [farm({ egg: 600, compound_feed: 200 }), "slot-4", "slot_locked"],
    ];
    for (const [state, slotId, code] of cases) {
      try {
        breedFarmRanchSlot(state, slotId, NO_MASTER, fail, NOW);
        throw new Error("교배되면 안 된다");
      } catch (error) {
        expect(error).toBeInstanceOf(FarmError);
        expect((error as FarmError).code).toBe(code);
      }
    }
  });
});
