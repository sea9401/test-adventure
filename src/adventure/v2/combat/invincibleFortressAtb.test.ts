import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return { ...actual, V2_CORE_LOOP_V2: true };
});

import type { Monster } from "@/adventure/data/monsters";
import type { SignatureEffect } from "@/adventure/data/v2/v2Equipment";
import {
  resolveBattle,
  type BattleResolution,
  type PlayerCombat,
} from "./engine";
import {
  initialInvincibleFortressState,
  type InvincibleFortressBattleState,
} from "./invincibleFortressMechanic";

const SHARED_MAX_HP = 10_800_000;

const player: PlayerCombat = {
  hp: 1_000_000,
  maxHp: 1_000_000,
  atk: 100_000,
  def: 1_000,
  spd: 50,
  evasionPct: 0,
  attackCount: 1,
  accuracyPct: 100,
};

const boss: Monster = {
  name: "불괴의 성채",
  tags: ["golem"],
  hp: SHARED_MAX_HP,
  atk: 100,
  def: 0,
  magicDef: 0,
  spd: 100,
  directActionSpd: true,
  accuracy: 100,
  evasionPct: 0,
  exp: 0,
};

afterEach(() => vi.restoreAllMocks());

function runFortress(options?: {
  initialState?: InvincibleFortressBattleState;
  initialEnemyHp?: number;
  maxTurns?: number;
  player?: PlayerCombat;
  boss?: Monster;
}): BattleResolution {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  return resolveBattle(options?.player ?? player, options?.boss ?? boss, "시험자", {
    pickAction: () => ({ kind: "attack" }),
    potions: {},
    isBoss: true,
    initialEnemyHp: options?.initialEnemyHp ?? SHARED_MAX_HP,
    maxTurns: options?.maxTurns ?? 1,
    bossMechanic: {
      kind: "invincible_fortress",
      sharedMaxHp: SHARED_MAX_HP,
      initialState:
        options?.initialState ?? initialInvincibleFortressState(SHARED_MAX_HP),
    },
  });
}

describe("invincible fortress ATB mechanic", () => {
  it("keeps sub-durability damage in the barrier without reducing body HP", () => {
    const result = runFortress({ maxTurns: 4 });

    expect(result.finalState.enemyHp).toBe(SHARED_MAX_HP);
    expect(result.finalState.bossMechanic).toMatchObject({
      kind: "invincible_fortress",
      activeBarrierIndex: 0,
      barrierDamage: 400_000,
    });
    expect(result.finalState.log).toContainEqual(
      expect.objectContaining({
        text: "방벽 피해 +100,000 · 남은 1,400,000 / 1,500,000",
        turn: "player",
      }),
    );
    expect(result.finalState.log).toContainEqual(
      expect.objectContaining({
        text: "방벽 피해 +100,000 · 남은 1,100,000 / 1,500,000",
        turn: "player",
      }),
    );
  });

  it("destroys the barrier immediately and applies the breaking hit overflow to body HP", () => {
    const result = runFortress({
      player: { ...player, atk: 3_500_000 },
    });

    expect(result.finalState.enemyHp).toBe(8_800_000);
    expect(result.finalState.bossMechanic).toMatchObject({
      kind: "invincible_fortress",
      completedBarrierCount: 1,
      activeBarrierIndex: null,
      enrageTier: 0,
      barrierResults: [0],
    });
    const damageIndex = result.finalState.log.findIndex(
      (entry) =>
        entry.text === "방벽 피해 +1,500,000 · 남은 0 / 1,500,000",
    );
    const destroyedIndex = result.finalState.log.findIndex(
      (entry) => entry.text === "방벽 파괴 — 누적 1,500,000",
    );
    expect(damageIndex).toBeGreaterThanOrEqual(0);
    expect(destroyedIndex).toBeGreaterThan(damageIndex);
    expect(result.finalState.log).toContainEqual(
      expect.objectContaining({
        t: 0,
        text: "방벽 파괴 — 누적 1,500,000",
      }),
    );
    expect(result.finalState.log).toContainEqual(
      expect.objectContaining({ t: 0, text: "광폭 0단계 적용" }),
    );
  });

  it("applies the remaining hit in the same multi-hit action after barrier destruction", () => {
    const result = runFortress({
      player: { ...player, atk: 1_500_000, attackCount: 2 },
    });

    expect(result.finalState.enemyHp).toBe(9_300_000);
    expect(result.finalState.bossMechanic).toMatchObject({
      kind: "invincible_fortress",
      completedBarrierCount: 1,
      activeBarrierIndex: null,
      barrierDamage: 0,
    });
  });

  it("reschedules the boss from the early barrier destruction tick", () => {
    const result = runFortress({
      maxTurns: 2,
      player: { ...player, atk: 1_500_000 },
    });
    const firstEnemyAttack = result.finalState.log.find(
      (entry) => entry.kind === "enemy_attack",
    );

    expect(firstEnemyAttack?.t).toBe(80);
  });

  it("keeps the boss idle until the opening 400-tick trial completes", () => {
    const result = runFortress({
      maxTurns: 8,
    });
    const enemyAttacks = result.finalState.log.filter(
      (entry) => entry.kind === "enemy_attack",
    );

    expect(
      enemyAttacks.every((entry) => (entry.t ?? Number.POSITIVE_INFINITY) > 400),
    ).toBe(true);
    expect(result.finalState.log).toContainEqual(
      expect.objectContaining({
        t: 400,
        text: "방벽 시험 종료 — 누적 400,000",
      }),
    );
  });

  it("clamps body HP at 75% and sends later attacks in the same action to the barrier", () => {
    const initialState: InvincibleFortressBattleState = {
      ...initialInvincibleFortressState(SHARED_MAX_HP),
      completedBarrierCount: 1,
      activeBarrierIndex: null,
      barrierTicksRemaining: 0,
      enrageTier: 3,
      barrierResults: [3],
    };
    const result = runFortress({
      initialState,
      initialEnemyHp: 8_100_100,
      player: { ...player, atk: 1_000, attackCount: 2 },
    });

    expect(result.finalState.enemyHp).toBe(8_100_000);
    expect(result.finalState.bossMechanic).toMatchObject({
      activeBarrierIndex: 1,
      enrageTier: 0,
    });
    expect(
      (result.finalState.bossMechanic?.kind === "invincible_fortress"
        ? result.finalState.bossMechanic.barrierDamage
        : 0),
    ).toBeGreaterThan(0);
  });

  it("puts fortress progress into replay HP snapshots", () => {
    const result = runFortress();
    const snapshot = result.finalState.log.findLast(
      (entry) => entry.kind === "hp_bar",
    );

    expect(snapshot?.kind === "hp_bar" && snapshot.enemySignatureResources).toMatchObject({
      fortressTrial: expect.any(String),
      fortressDamage: "100,000 / 1,500,000",
      fortressEnrage: "예상 7단계",
    });
  });

  it("does not tick enemy-target DoTs while the barrier keeps the boss idle", () => {
    const poison: SignatureEffect = {
      trigger: "on_hit",
      label: "시험 독",
      poisonChancePct: 100,
      poisonStacks: 1,
    };
    const result = runFortress({
      maxTurns: 3,
      player: { ...player, atk: 1, equipSignatures: [poison] },
    });

    expect(result.finalState.enemyV2Dots).toEqual([
      expect.objectContaining({ tag: "poison", turns: 3 }),
    ]);
    expect(
      result.finalState.log.some(
        (entry) =>
          "effect" in entry &&
          entry.effect === "status_damage" &&
          entry.text.includes("중독"),
      ),
    ).toBe(false);
  });

  it("starts the next barrier when an enemy-action DoT crosses an HP boundary", () => {
    const poison: SignatureEffect = {
      trigger: "on_hit",
      label: "시험 독",
      poisonChancePct: 100,
      poisonStacks: 1,
    };
    const initialState: InvincibleFortressBattleState = {
      ...initialInvincibleFortressState(SHARED_MAX_HP),
      completedBarrierCount: 1,
      activeBarrierIndex: null,
      barrierTicksRemaining: 0,
      enrageTier: 3,
      barrierResults: [3],
    };
    const result = runFortress({
      initialState,
      initialEnemyHp: 8_120_000,
      maxTurns: 2,
      boss: { ...boss, def: 1_000_000 },
      player: { ...player, spd: 100, equipSignatures: [poison] },
    });

    expect(result.finalState.enemyHp).toBe(8_100_000);
    expect(result.finalState.bossMechanic).toMatchObject({
      kind: "invincible_fortress",
      activeBarrierIndex: 1,
      enrageTier: 0,
    });
    const barrierStart = result.finalState.log.find(
      (entry) => entry.text.includes("방벽 시험 시작 — 2/4"),
    );
    expect(barrierStart?.t).toBeGreaterThan(0);
    expect(
      result.finalState.log.some(
        (entry) => entry.kind === "enemy_attack" && entry.t === barrierStart?.t,
      ),
    ).toBe(false);
  });

  it("replaces only attack and speed with the current phase-local enrage tier", () => {
    const initialState: InvincibleFortressBattleState = {
      ...initialInvincibleFortressState(SHARED_MAX_HP),
      completedBarrierCount: 1,
      activeBarrierIndex: null,
      barrierTicksRemaining: 0,
      enrageTier: 7,
      barrierResults: [7],
    };
    const result = runFortress({
      initialState,
      initialEnemyHp: 10_000_000,
      maxTurns: 1,
      boss: { ...boss, def: 321, magicDef: 654 },
      player: { ...player, atk: 1 },
    });

    expect(result.finalState.enemy.atk).toBe(250);
    expect(result.finalState.enemy.spd).toBeCloseTo(300);
    expect(result.finalState.enemy.def).toBe(321);
    expect(result.finalState.enemy.magicDef).toBe(654);
  });
});
