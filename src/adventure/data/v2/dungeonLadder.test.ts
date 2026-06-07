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
  it("권장 파워 게이트 — 들판(1~6) 50→95 완만, 7+ 선형(간격 STEP), 단조 증가", () => {
    expect(floorPowerGate(1)).toBe(50);
    expect(floorPowerGate(6)).toBe(95); // 들판 상한
    // 깊은 산(7+) = 앵커 + (depth−2)×step — 들판 평탄화와 무관(불변).
    expect(floorPowerGate(7)).toBe(LADDER_ANCHOR_POWER + 5 * LADDER_POWER_STEP); // 310
    expect(floorPowerGate(8)).toBe(LADDER_ANCHOR_POWER + 6 * LADDER_POWER_STEP); // 350
    for (let i = 1; i < FLOORS.length; i++) {
      expect(floorPowerGate(FLOORS[i])).toBeGreaterThan(
        floorPowerGate(FLOORS[i - 1]),
      );
    }
  });

  it("스탯 배율 — 들판(1~6) ×1.0→×1.3 완만, 7+ = gate/앵커(불변)", () => {
    expect(floorStatMult(1)).toBe(1);
    expect(floorStatMult(6)).toBeCloseTo(1.3, 5); // 들판 상한
    // 깊이 7+ 는 평탄화 전과 동일 — gate/앵커.
    expect(floorStatMult(7)).toBeCloseTo(310 / 110, 5);
    expect(floorStatMult(8)).toBeCloseTo(350 / 110, 5);
    // 들판 내부 단조 증가
    for (const f of [2, 3, 4, 5, 6] as DungeonFloorId[]) {
      expect(floorStatMult(f)).toBeGreaterThan(
        floorStatMult((f - 1) as DungeonFloorId),
      );
    }
  });

  it("def 배율은 hp/atk 보다 천천히 (관통 0 절벽 회피) — 2+ 에서 1 < def < stat", () => {
    expect(floorDefMult(1)).toBe(1);
    for (const f of [2, 3, 4, 5, 6, 7, 8] as DungeonFloorId[]) {
      expect(floorDefMult(f)).toBeLessThan(floorStatMult(f));
      expect(floorDefMult(f)).toBeGreaterThan(1); // 그래도 증가
    }
  });

  it("exp 배율 — 들판 완만, 램프(볼록) 후 플래토 캡, 깊이 7+ 불변", () => {
    expect(floorExpMult(1)).toBe(1);
    // 램프: 들판(완만) < 깊은 산(캡 전)
    expect(floorExpMult(6)).toBeLessThan(floorExpMult(7));
    // 볼록: 캡 전(floor 7)은 statMult^2 — 깊이 7+ 불변
    expect(floorExpMult(7)).toBeCloseTo(Math.pow(floorStatMult(7), 2), 5);
    // 플래토 — 어떤 floor 도 캡 초과 안 함, 최상위는 캡에 닿음
    for (const f of FLOORS) {
      expect(floorExpMult(f)).toBeLessThanOrEqual(LADDER_EXP_PLATEAU);
    }
    expect(floorExpMult(15)).toBe(LADDER_EXP_PLATEAU); // 깊은 깊이(statMult²>캡)는 캡에 닿음
  });
});
