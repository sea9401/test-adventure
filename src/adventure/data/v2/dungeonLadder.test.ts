import { describe, it, expect } from "vitest";
import {
  floorPowerGate,
  floorStatMult,
  floorDefMult,
  floorExpMult,
  endgameSoften,
  endExtensionCombatSoften,
  fixedFrontierAccuracyMult,
  fixedFrontierAttackMult,
  fixedFrontierDefenseMult,
  fixedFrontierDurabilityMult,
  fixedFrontierEvasionBonus,
  LADDER_STAT_STEP,
  ONBOARDING_MAX_STAT_MULT,
  LADDER_EXP_SOFTCAP,
  ENDGAME_SOFTEN_START_DEPTH,
  ENDGAME_SOFTEN_MIN,
  END_EXTENSION_START_DEPTH,
  END_EXTENSION_START_STAT_MULT,
  END_EXTENSION_STAT_STEP,
  END_EXTENSION_COMBAT_SOFTEN,
  RED_PLAINS_COMBAT_SOFTEN,
  BONE_PLATEAU_COMBAT_SOFTEN,
  DEEP_FRONTIER_COMBAT_SOFTEN_MIN,
  REWARD_SLOWDOWN_START_DEPTH,
  REWARD_SLOWDOWN_EXP_STEP,
  REWARD_EXP_MULT_CAP,
  SKY_RIFT_POWER_GATES,
  FIXED_FRONTIER_ATTACK_DEPTH_72,
  FIXED_FRONTIER_ATTACK_DEPTH_78,
  FIXED_FRONTIER_ATTACK_START,
  FIXED_FRONTIER_DURABILITY_DEPTH_72,
  FIXED_FRONTIER_DURABILITY_DEPTH_78,
  FIXED_FRONTIER_DURABILITY_START,
  FIXED_FRONTIER_DEFENSE_DEPTH_72,
  FIXED_FRONTIER_DEFENSE_DEPTH_78,
  FIXED_FRONTIER_ACCURACY_DEPTH_72,
  FIXED_FRONTIER_ACCURACY_DEPTH_78,
  FIXED_FRONTIER_EVASION_DEPTH_72,
  FIXED_FRONTIER_EVASION_DEPTH_78,
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
  it("권장 파워 게이트 — 들판(1~6) 50→95, 7~42 statMult 비례, 단조 증가", () => {
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

  it("43+ 엔드 확장 — 실제 몬스터 램프와 표시 권장 전투력을 분리", () => {
    expect(floorStatMult(END_EXTENSION_START_DEPTH)).toBe(END_EXTENSION_START_STAT_MULT);
    expect(floorPowerGate(END_EXTENSION_START_DEPTH)).toBe(1200);
    expect(floorPowerGate(42)).toBeLessThan(1200);
    expect(floorPowerGate(43)).toBeGreaterThan(floorPowerGate(42));
    expect(floorStatMult(44) - floorStatMult(43)).toBe(END_EXTENSION_STAT_STEP);
    expect(END_EXTENSION_STAT_STEP).toBeGreaterThan(LADDER_STAT_STEP);
  });

  it("권장 전투력 조정은 49+ 실제 몬스터 스탯 배율을 바꾸지 않는다", () => {
    expect(floorStatMult(49)).toBeCloseTo(Math.pow(2000 / 110, 1 / 0.77), 8);
    expect(floorStatMult(72)).toBeCloseTo(Math.pow(4500 / 110, 1 / 0.77), 8);
  });

  it("천공 균열 73~78 권장 전투력은 진입 4650에서 최심부 5500까지 가파르게 오른다", () => {
    expect([73, 74, 75, 76, 77, 78].map(floorPowerGate)).toEqual([
      ...SKY_RIFT_POWER_GATES,
    ]);
    expect(floorPowerGate(73)).toBe(4650);
    expect(floorStatMult(73)).toBeCloseTo(Math.pow(4650 / 110, 1 / 0.77), 8);
    expect(floorPowerGate(78)).toBe(5500);
  });

  it("별의 무덤 79~84 권장 전투력은 8000에서 10000까지 일정하게 오른다", () => {
    expect([79, 80, 81, 82, 83, 84].map(floorPowerGate)).toEqual([
      8000,
      8400,
      8800,
      9200,
      9600,
      10000,
    ]);
  });

  it("별의 무덤 실제 전투 배율은 천공 균열 이후에도 계속 높아진다", () => {
    for (let depth = 79; depth <= 84; depth++) {
      expect(fixedFrontierDurabilityMult(depth)).toBeGreaterThan(
        fixedFrontierDurabilityMult(depth - 1),
      );
      expect(fixedFrontierAttackMult(depth)).toBeGreaterThan(
        fixedFrontierAttackMult(depth - 1),
      );
      expect(fixedFrontierDefenseMult(depth)).toBeGreaterThanOrEqual(
        fixedFrontierDefenseMult(depth - 1),
      );
    }
  });

  it("별의 무덤 경험치와 골드 기반 배율은 천공 균열 최심부에서 멈춘다", () => {
    const skyRiftCap = floorExpMult(78);
    expect([79, 80, 81, 82, 83, 84].map(floorExpMult)).toEqual(
      Array(6).fill(skyRiftCap),
    );
  });

  it("43+ 엔드 확장 전투 완화는 지역 경계부터 적용하고 심층 하한에서 멈춘다", () => {
    expect(endExtensionCombatSoften(42)).toBe(1);
    expect(endExtensionCombatSoften(43)).toBe(END_EXTENSION_COMBAT_SOFTEN);
    expect(endExtensionCombatSoften(49)).toBe(RED_PLAINS_COMBAT_SOFTEN);
    expect(endExtensionCombatSoften(55)).toBe(BONE_PLATEAU_COMBAT_SOFTEN);
    expect(endExtensionCombatSoften(72)).toBe(DEEP_FRONTIER_COMBAT_SOFTEN_MIN);
    expect(END_EXTENSION_COMBAT_SOFTEN).toBeLessThan(1);
    expect(RED_PLAINS_COMBAT_SOFTEN).toBeLessThan(END_EXTENSION_COMBAT_SOFTEN);
    expect(BONE_PLATEAU_COMBAT_SOFTEN).toBeLessThan(RED_PLAINS_COMBAT_SOFTEN);
  });

  it("55+ 실제 HP·ATK 배율은 깊어질수록 단조 증가한다", () => {
    const combatMult = (depth: number) =>
      floorStatMult(depth) *
      endgameSoften(depth) *
      endExtensionCombatSoften(depth) *
      fixedFrontierDurabilityMult(depth);

    for (let depth = 56; depth <= 78; depth++) {
      expect(combatMult(depth)).toBeGreaterThan(combatMult(depth - 1));
    }
  });

  it("49+ 솔로 사냥터는 플레이어와 무관한 고정 전투 보정을 깊이별로 적용한다", () => {
    expect(fixedFrontierDurabilityMult(48)).toBe(1);
    expect(fixedFrontierDurabilityMult(49)).toBe(
      FIXED_FRONTIER_DURABILITY_START,
    );
    expect(fixedFrontierDurabilityMult(72)).toBe(
      FIXED_FRONTIER_DURABILITY_DEPTH_72,
    );
    expect(fixedFrontierDurabilityMult(78)).toBe(
      FIXED_FRONTIER_DURABILITY_DEPTH_78,
    );
    expect(fixedFrontierAttackMult(48)).toBe(1);
    expect(fixedFrontierAttackMult(49)).toBe(FIXED_FRONTIER_ATTACK_START);
    expect(fixedFrontierAttackMult(72)).toBe(FIXED_FRONTIER_ATTACK_DEPTH_72);
    expect(fixedFrontierAttackMult(78)).toBe(FIXED_FRONTIER_ATTACK_DEPTH_78);
    expect(fixedFrontierDefenseMult(48)).toBe(1);
    expect(fixedFrontierDefenseMult(72)).toBe(FIXED_FRONTIER_DEFENSE_DEPTH_72);
    expect(fixedFrontierDefenseMult(78)).toBe(FIXED_FRONTIER_DEFENSE_DEPTH_78);
    expect(fixedFrontierAccuracyMult(48)).toBe(1);
    expect(fixedFrontierAccuracyMult(72)).toBe(FIXED_FRONTIER_ACCURACY_DEPTH_72);
    expect(fixedFrontierAccuracyMult(78)).toBe(FIXED_FRONTIER_ACCURACY_DEPTH_78);
    expect(fixedFrontierEvasionBonus(48)).toBe(0);
    expect(fixedFrontierEvasionBonus(72)).toBe(FIXED_FRONTIER_EVASION_DEPTH_72);
    expect(fixedFrontierEvasionBonus(78)).toBe(FIXED_FRONTIER_EVASION_DEPTH_78);
    for (let depth = 50; depth <= 78; depth++) {
      expect(fixedFrontierDurabilityMult(depth)).toBeGreaterThanOrEqual(
        fixedFrontierDurabilityMult(depth - 1),
      );
      expect(fixedFrontierAttackMult(depth)).toBeGreaterThanOrEqual(
        fixedFrontierAttackMult(depth - 1),
      );
      expect(fixedFrontierDefenseMult(depth)).toBeGreaterThanOrEqual(
        fixedFrontierDefenseMult(depth - 1),
      );
      expect(fixedFrontierAccuracyMult(depth)).toBeGreaterThanOrEqual(
        fixedFrontierAccuracyMult(depth - 1),
      );
      expect(fixedFrontierEvasionBonus(depth)).toBeGreaterThanOrEqual(
        fixedFrontierEvasionBonus(depth - 1),
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
    for (let d = 2; d <= 78; d++) {
      expect(floorExpMult(d)).toBeGreaterThanOrEqual(floorExpMult(d - 1));
    }
    // 소프트캡 경계 연속성 — 기울기는 꺾이되 점프(절벽) 없음.
    expect(floorExpMult(10) / floorExpMult(9)).toBeLessThan(1.5);
  });
});
