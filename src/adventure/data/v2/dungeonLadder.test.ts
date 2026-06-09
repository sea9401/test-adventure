import { describe, it, expect } from "vitest";
import {
  floorPowerGate,
  floorStatMult,
  floorDefMult,
  floorExpMult,
  LADDER_STAT_STEP,
  ONBOARDING_MAX_STAT_MULT,
  LADDER_EXP_SOFTCAP,
} from "./dungeonLadder";
import type { DungeonFloorId } from "./types";

const FLOORS: DungeonFloorId[] = [1, 2, 3, 4, 5, 6, 7, 8];

describe("dungeonLadder 제너레이터 (§5.1) — 전곡선 평탄(단일 램프)", () => {
  it("권장 파워 게이트 — 들판(1~6) 50→95, 7+ statMult 비례 단일 램프, 단조 증가", () => {
    expect(floorPowerGate(1)).toBe(50);
    expect(floorPowerGate(6)).toBe(95); // 들판 상한
    // 깊이 7+ = statMult × 110. 옛 앵커 점프(310)보다 훨씬 완만.
    expect(floorPowerGate(7)).toBeGreaterThan(95);
    expect(floorPowerGate(7)).toBeLessThan(280); // 옛 점프(310) 가드 — STEP 튜닝 여유
    for (let i = 1; i < FLOORS.length; i++) {
      expect(floorPowerGate(FLOORS[i])).toBeGreaterThan(
        floorPowerGate(FLOORS[i - 1]),
      );
    }
  });

  it("스탯 배율 — 들판 ×1.0→×1.3, 7+ = 1.3 에서 깊이당 +STEP 단일 램프 (절벽 없음)", () => {
    expect(floorStatMult(1)).toBe(1);
    expect(floorStatMult(6)).toBeCloseTo(1.3, 5); // 들판 상한
    // 깊이 7 = 들판 끝(1.3)에서 STEP 만큼만 — 옛 점프(2.82) 없음.
    expect(floorStatMult(7)).toBeCloseTo(
      ONBOARDING_MAX_STAT_MULT + LADDER_STAT_STEP,
      5,
    );
    // 절벽 가드 — 들판→깊은 산 경계 배율 점프가 옛 2.17× 보다 훨씬 작아야.
    expect(floorStatMult(7) / floorStatMult(6)).toBeLessThan(1.7);
    // 전 구간 단조 증가
    for (const d of [2, 3, 4, 5, 6, 7, 8, 12, 20]) {
      expect(floorStatMult(d)).toBeGreaterThan(floorStatMult(d - 1));
    }
  });

  it("def 배율은 hp/atk 보다 천천히 (관통 0 절벽 회피) — 2+ 에서 1 < def < stat", () => {
    expect(floorDefMult(1)).toBe(1);
    for (const f of [2, 3, 4, 5, 6, 7, 8] as DungeonFloorId[]) {
      expect(floorDefMult(f)).toBeLessThan(floorStatMult(f));
      expect(floorDefMult(f)).toBeGreaterThan(1); // 그래도 증가
    }
  });

  it("exp 배율 — 초반 볼록 램프 후 소프트캡에서 선형 우상향(평평하지 않음, 경계 절벽 없음)", () => {
    expect(floorExpMult(1)).toBe(1);
    // 들판→깊은 산 경계 — 옛 절벽(×4.7) 대비 절반 이하로 완만.
    expect(floorExpMult(7)).toBeGreaterThan(floorExpMult(6));
    expect(floorExpMult(7) / floorExpMult(6)).toBeLessThan(2.5);
    // 소프트캡 전은 볼록(statMult²)
    expect(floorExpMult(7)).toBeCloseTo(Math.pow(floorStatMult(7), 2), 5);
    // 소프트캡 이후 — 평평(plateau)이 아니라 깊이 따라 계속 상승(밴드 A~F 보상 차등).
    expect(floorExpMult(30)).toBeGreaterThan(LADDER_EXP_SOFTCAP);
    expect(floorExpMult(48)).toBeGreaterThan(floorExpMult(30));
    expect(floorExpMult(30)).toBeGreaterThan(floorExpMult(20));
    // 전 구간 단조 증가(절벽 없음) — 소프트캡 경계 포함.
    for (let d = 2; d <= 60; d++) {
      expect(floorExpMult(d)).toBeGreaterThan(floorExpMult(d - 1));
    }
    // 소프트캡 경계 연속성 — 기울기는 꺾이되 점프(절벽) 없음.
    expect(floorExpMult(10) / floorExpMult(9)).toBeLessThan(1.5);
  });
});
