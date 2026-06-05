import { describe, it, expect } from "vitest";
import {
  floorPowerGate,
  floorStatMult,
  floorDefMult,
  floorExpMult,
  LADDER_ANCHOR_POWER,
  LADDER_POWER_STEP,
  LADDER_EXP_PLATEAU,
} from "./dungeonLadder";
import type { DungeonFloorId } from "./types";

const FLOORS: DungeonFloorId[] = [1, 2, 3, 4, 5, 6, 7, 8];

describe("dungeonLadder 제너레이터 (§5.1)", () => {
  it("권장 파워 게이트 — 1·2 authored, 3+ 선형(간격 STEP), 단조 증가", () => {
    expect(floorPowerGate(1)).toBe(50);
    expect(floorPowerGate(2)).toBe(LADDER_ANCHOR_POWER); // 110
    expect(floorPowerGate(3)).toBe(LADDER_ANCHOR_POWER + LADDER_POWER_STEP); // 150
    expect(floorPowerGate(8)).toBe(LADDER_ANCHOR_POWER + 6 * LADDER_POWER_STEP); // 350
    for (let i = 1; i < FLOORS.length; i++) {
      expect(floorPowerGate(FLOORS[i])).toBeGreaterThan(
        floorPowerGate(FLOORS[i - 1]),
      );
    }
  });

  it("스탯 배율 — floor 1·2 = 1.0(authored), 3+ = gate/앵커", () => {
    expect(floorStatMult(1)).toBe(1);
    expect(floorStatMult(2)).toBe(1);
    expect(floorStatMult(3)).toBeCloseTo(150 / 110, 5);
    expect(floorStatMult(8)).toBeCloseTo(350 / 110, 5);
  });

  it("def 배율은 hp/atk 보다 천천히 (관통 0 절벽 회피) — 3+ 에서 1 < def < stat", () => {
    expect(floorDefMult(2)).toBe(1);
    for (const f of [3, 4, 5, 6, 7, 8] as DungeonFloorId[]) {
      expect(floorDefMult(f)).toBeLessThan(floorStatMult(f));
      expect(floorDefMult(f)).toBeGreaterThan(1); // 그래도 증가
    }
  });

  it("exp 배율 — 1·2 = 1.0, 램프(볼록) 후 플래토 캡", () => {
    expect(floorExpMult(2)).toBe(1);
    // 램프: 저티어 < 고티어 (캡 전)
    expect(floorExpMult(3)).toBeLessThan(floorExpMult(7));
    // 볼록: 캡 전(floor 7)은 statMult^2
    expect(floorExpMult(7)).toBeCloseTo(Math.pow(floorStatMult(7), 2), 5);
    // 플래토 — 어떤 floor 도 캡 초과 안 함, 최상위는 캡에 닿음
    for (const f of FLOORS) {
      expect(floorExpMult(f)).toBeLessThanOrEqual(LADDER_EXP_PLATEAU);
    }
    expect(floorExpMult(15)).toBe(LADDER_EXP_PLATEAU); // 깊은 깊이(statMult²>캡)는 캡에 닿음
  });
});
