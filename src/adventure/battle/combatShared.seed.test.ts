import { describe, it, expect, afterEach, vi } from "vitest";
import {
  makeSeededRng,
  setBattleRng,
  battleRandom,
  setV2BattleModel,
} from "./combatShared";
import { resolveBattle, type PlayerCombat } from "./engine";
import type { Monster } from "../data/monsters";

// SIM-핸드오프 — 시드 재현 RNG. 같은 시드 = 같은 난수열 = 같은 전투(전후 비교용).
// 주입 RNG·§B 모델 플래그는 모듈 전역이므로 매 테스트 후 복구(다른 스위트 누설 방지).
afterEach(() => {
  setBattleRng(null);
  setV2BattleModel(false);
  vi.restoreAllMocks();
});

describe("makeSeededRng — 결정론 PRNG", () => {
  it("같은 시드 → 동일 난수열", () => {
    const a = makeSeededRng("hello");
    const b = makeSeededRng("hello");
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("다른 시드 → 다른 난수열", () => {
    const a = makeSeededRng("seed-A");
    const b = makeSeededRng("seed-B");
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("출력은 [0,1) 범위", () => {
    const r = makeSeededRng("range");
    for (let i = 0; i < 200; i += 1) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("battleRandom — RNG 주입/복귀", () => {
  it("주입 없으면 Math.random 동적 호출 (테스트 모킹 호환)", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.123);
    expect(battleRandom()).toBe(0.123);
    expect(spy).toHaveBeenCalled();
  });

  it("주입하면 그 PRNG 사용, null 로 복귀", () => {
    setBattleRng(() => 0.42);
    expect(battleRandom()).toBe(0.42);
    setBattleRng(null);
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    expect(battleRandom()).toBe(0.99);
    expect(spy).toHaveBeenCalled();
  });
});

describe("resolveBattle — 시드 재현성", () => {
  const PLAYER: PlayerCombat = {
    hp: 120,
    maxHp: 120,
    atk: 14,
    def: 5,
    spd: 20,
    evasionPct: 20,
    attackCount: 1,
    critChancePct: 40,
    critMult: 2,
  };
  const enemy: Monster = {
    name: "테스트적",
    tags: ["beast"],
    hp: 80,
    atk: 14,
    def: 4,
    spd: 18,
    evasionPct: 15,
    exp: 5,
  };
  const ctx = {
    pickAction: () => ({ kind: "attack" as const }),
    potions: {},
    v2Skills: { learned: [], equipped: [] },
  };

  it("같은 시드 → 동일 전투 결과(승패·턴·최종 HP)", () => {
    setBattleRng(makeSeededRng("battle-X"));
    const r1 = resolveBattle({ ...PLAYER }, enemy, "Sim", ctx);
    setBattleRng(makeSeededRng("battle-X"));
    const r2 = resolveBattle({ ...PLAYER }, enemy, "Sim", ctx);
    expect(r1.outcome).toBe(r2.outcome);
    expect(r1.turns).toBe(r2.turns);
    expect(r1.finalState.enemyHp).toBe(r2.finalState.enemyHp);
    expect(r1.finalState.playerHp).toBe(r2.finalState.playerHp);
  });

  it("다른 시드 → 전투 전개 변동 (10시드 중 턴수 2종 이상)", () => {
    const turnCounts = new Set<number>();
    for (let i = 0; i < 10; i += 1) {
      setBattleRng(makeSeededRng(`battle-${i}`));
      turnCounts.add(resolveBattle({ ...PLAYER }, enemy, "Sim", ctx).turns);
    }
    expect(turnCounts.size).toBeGreaterThan(1);
  });

  it("§B 모델 ON — 시드 재현 유지 + 양측(적 포함) 평타 variance 반영", () => {
    setV2BattleModel(true);
    // 같은 시드 → §B 켜도 동일 결과(결정론).
    setBattleRng(makeSeededRng("v2b-X"));
    const a = resolveBattle({ ...PLAYER }, enemy, "Sim", ctx);
    setBattleRng(makeSeededRng("v2b-X"));
    const b = resolveBattle({ ...PLAYER }, enemy, "Sim", ctx);
    expect(a.turns).toBe(b.turns);
    expect(a.finalState.playerHp).toBe(b.finalState.playerHp);
    expect(a.finalState.enemyHp).toBe(b.finalState.enemyHp);
    // 적 평타도 §B roll → 플레이어가 받는 피해가 시드별로 달라진다(적측 variance 켜짐 증거).
    const playerHps = new Set<number>();
    for (let i = 0; i < 12; i += 1) {
      setBattleRng(makeSeededRng(`v2b-${i}`));
      playerHps.add(resolveBattle({ ...PLAYER }, enemy, "Sim", ctx).finalState.playerHp);
    }
    expect(playerHps.size).toBeGreaterThan(1);
  });
});
