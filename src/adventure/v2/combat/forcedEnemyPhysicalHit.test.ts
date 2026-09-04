import { afterEach, describe, expect, it, vi } from "vitest";

import type { Monster } from "@/adventure/data/monsters";
import {
  resolveForcedEnemyPhysicalHit,
} from "./engine.enemyPhase";
import {
  initialBattleState,
  type PlayerCombat,
} from "./engine";

const PLAYER: PlayerCombat = {
  hp: 10_000,
  maxHp: 10_000,
  atk: 10,
  def: 0,
  spd: 30,
  evasionPct: 0,
  accuracyPct: 100,
  attackCount: 1,
};

const ENEMY: Monster = {
  name: "강제 공격 시험체",
  tags: [],
  hp: 10_000,
  atk: 200,
  def: 0,
  spd: 1,
  accuracy: 0,
  evasionPct: 0,
  exp: 0,
};

afterEach(() => vi.restoreAllMocks());

function runForcedHit(overrides: Partial<PlayerCombat> = {}) {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const defender = { ...PLAYER, ...overrides };
  const state = initialBattleState(defender, ENEMY, "수호자");
  return resolveForcedEnemyPhysicalHit(state, defender, "수호자", {
    attackName: "보호막 관통타",
    multiplier: 2,
    armorPierce: 0,
    physicalDefensePiercePct: 50,
    bypassPlayerShield: true,
    allowCritical: false,
    applyStatus: false,
    consumeEnemyAction: false,
  });
}

describe("강제 물리 공격 피해 정책", () => {
  it("새 옵션을 생략하면 일반 보호막이 기존처럼 강제 물리 공격을 흡수한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const defender = { ...PLAYER, def: 200, bulwarkShield: 2_000 };
    const state = initialBattleState(defender, ENEMY, "수호자");
    const result = resolveForcedEnemyPhysicalHit(state, defender, "수호자", {
      attackName: "기본 강제타",
      multiplier: 2,
      armorPierce: 0,
      allowCritical: false,
      applyStatus: false,
      consumeEnemyAction: false,
    });

    expect(result.damageToHp).toBe(0);
    expect(result.state.playerHp).toBe(10_000);
    expect(result.state.stacks.playerShield).toBe(1_697);
  });

  it("요청한 경우 방어 50%를 무시하고 일반 보호막을 우회한다", () => {
    const result = runForcedHit({ def: 200, bulwarkShield: 2_000 });

    expect(result.damageToHp).toBe(343);
    expect(result.state.playerHp).toBe(9_657);
    expect(result.state.stacks.playerShield).toBe(2_000);
  });

  it("일반 보호막 우회 중에도 마나 실드는 피해를 흡수한다", () => {
    const plain = runForcedHit({ bulwarkShield: 2_000 });
    vi.restoreAllMocks();
    const barrier = runForcedHit({
      bulwarkShield: 2_000,
      magicBarrierMax: 1_000,
      magicBarrierAbsorbPct: 50,
      magicBarrierEfficiencyPct: 0,
    });

    expect(plain.damageToHp).toBe(400);
    expect(barrier.damageToHp).toBe(200);
    expect(barrier.state.playerMagicBarrier).toBe(800);
    expect(barrier.state.stacks.playerShield).toBe(2_000);
  });
});
