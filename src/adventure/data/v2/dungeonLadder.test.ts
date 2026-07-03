import { describe, it, expect } from "vitest";
import {
  floorPowerGate,
  floorStatMult,
  floorDefMult,
  floorExpMult,
  endgameSoften,
  LADDER_STAT_STEP,
  ONBOARDING_MAX_STAT_MULT,
  LADDER_EXP_SOFTCAP,
  ENDGAME_SOFTEN_START_DEPTH,
  ENDGAME_SOFTEN_MIN,
  END_EXTENSION_START_DEPTH,
  END_EXTENSION_START_STAT_MULT,
  END_EXTENSION_STAT_STEP,
  REWARD_SLOWDOWN_START_DEPTH,
  REWARD_SLOWDOWN_EXP_STEP,
  REWARD_EXP_MULT_CAP,
} from "./dungeonLadder";
import type { DungeonFloorId } from "./types";

describe("endgameSoften — 엔드게임 난이도 완화(floor 빌드 부양·밸런스 2026-06-18)", () => {
  it("시작 깊이 이하는 완화 0(1.0) — 중반 균형 무변", () => {
    expect(endgameSoften(1)).toBe(1);
    expect(endgameSoften(ENDGAME_SOFTEN_START_DEPTH)).toBe(1);
  });
  it("시작 이후 점감 + 하한 plateau", () => {
    expect(endgameSoften(ENDGAME_SOFTEN_START_DEPTH + 10)).toBeLessThan(1);
    expect(endgameSoften(50)).toBeGreaterThanOrEqual(ENDGAME_SOFTEN_MIN);
    // 깊은 frontier 는 하한에서 평평.
    expect(endgameSoften(999)).toBe(ENDGAME_SOFTEN_MIN);
    // 단조 비증가.
    expect(endgameSoften(40)).toBeLessThanOrEqual(endgameSoften(30));
  });
  it("권장파워(floorPowerGate)는 완화와 분리 — 진척/exp 곡선 무영향", () => {
    // floorPowerGate 는 floorStatMult 만 쓰고 endgameSoften 을 안 탄다(난이도만 완화, 레벨 매칭 불변).
    const gate = floorPowerGate(50);
    expect(gate).toBeGreaterThan(0);
    // soften 은 floorStatMult 와 독립 — floorStatMult(50) 은 완화 미반영(원곡선).
    expect(floorStatMult(50)).toBeGreaterThan(floorStatMult(50) * endgameSoften(50));
  });
});

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
    // 절벽 가드 — 들판→마른 협곡 경계(6→7) 배율 점프가 옛 2.17× 보다 훨씬 작아야.
    expect(floorStatMult(7) / floorStatMult(6)).toBeLessThan(1.7);
    // 전 구간 단조 증가
    for (const d of [2, 3, 4, 5, 6, 7, 8, 12, 20, 43, 44]) {
      expect(floorStatMult(d)).toBeGreaterThan(floorStatMult(d - 1));
    }
  });

  it("43+ 엔드 확장 램프 — 새 사냥터는 권장 전투력 1500대에서 시작하고 증가폭이 더 큼", () => {
    expect(floorStatMult(END_EXTENSION_START_DEPTH)).toBe(END_EXTENSION_START_STAT_MULT);
    expect(floorPowerGate(END_EXTENSION_START_DEPTH)).toBe(1509);
    expect(floorPowerGate(42)).toBeLessThan(1200);
    expect(floorPowerGate(43)).toBeGreaterThanOrEqual(1500);
    expect(floorStatMult(44) - floorStatMult(43)).toBe(END_EXTENSION_STAT_STEP);
    expect(END_EXTENSION_STAT_STEP).toBeGreaterThan(LADDER_STAT_STEP);
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
    // 들판→마른 협곡 경계(6→7) — 옛 절벽(×4.7) 대비 절반 이하로 완만.
    expect(floorExpMult(7)).toBeGreaterThan(floorExpMult(6));
    expect(floorExpMult(7) / floorExpMult(6)).toBeLessThan(2.5);
    // 소프트캡 전은 볼록(statMult²)
    expect(floorExpMult(7)).toBeCloseTo(Math.pow(floorStatMult(7), 2), 5);
    // 소프트캡 이후 — 평평(plateau)이 아니라 깊이 따라 계속 상승(밴드 A~F 보상 차등).
    expect(floorExpMult(30)).toBeGreaterThan(LADDER_EXP_SOFTCAP);
    expect(floorExpMult(48)).toBeGreaterThan(floorExpMult(30));
    expect(floorExpMult(30)).toBeGreaterThan(floorExpMult(20));
    // 리자드 늪지(31+)부터는 보상 증가폭을 낮춘 별도 램프를 탄다. 난이도 43+ 단차가 EXP/골드에
    // 그대로 전이되지 않아야 한다.
    expect(floorExpMult(REWARD_SLOWDOWN_START_DEPTH) - floorExpMult(30)).toBeCloseTo(
      REWARD_SLOWDOWN_EXP_STEP,
      5,
    );
    expect(floorExpMult(43) - floorExpMult(42)).toBeCloseTo(REWARD_SLOWDOWN_EXP_STEP, 5);
    expect(floorExpMult(43)).toBeLessThan(26);
    expect(floorExpMult(999)).toBe(REWARD_EXP_MULT_CAP);
    expect(REWARD_EXP_MULT_CAP).toBe(30);
    // 전 구간 단조 증가(절벽 없음) — 소프트캡 경계 포함.
    for (let d = 2; d <= 72; d++) {
      expect(floorExpMult(d)).toBeGreaterThanOrEqual(floorExpMult(d - 1));
    }
    // 소프트캡 경계 연속성 — 기울기는 꺾이되 점프(절벽) 없음.
    expect(floorExpMult(10) / floorExpMult(9)).toBeLessThan(1.5);
  });
});
