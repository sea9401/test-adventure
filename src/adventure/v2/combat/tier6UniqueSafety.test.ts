import { describe, expect, it } from "vitest";
import type {
  SignatureEffect,
  Tier6UniqueMechanic,
} from "@/adventure/data/v2/v2Equipment";
import {
  initialTier6UniqueRuntime,
  resolveTier6UniqueEvent,
  type Tier6UniqueRuntimeState,
} from "./tier6UniqueEffects";

function signature(mechanic: Tier6UniqueMechanic): SignatureEffect {
  return { trigger: "tier6_unique", mechanic, label: mechanic };
}

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function finiteState(state: Tier6UniqueRuntimeState): boolean {
  return [
    state.gravityReprisal,
    state.pursuitMarks,
    state.shadowEchoes,
    state.arcaneOverload,
    state.sanctuaryReserve,
    state.nextDirectDamagePct,
    state.nextHealPct,
    state.nextShieldPct,
    state.nextDirectFixedDamage,
    ...Object.values(state.heartCounts),
  ].every((value) => Number.isFinite(value));
}

function simulate(mechanics: Tier6UniqueMechanic[], seed: number) {
  const rng = seeded(seed);
  const signatures = mechanics.map(signature);
  let state = initialTier6UniqueRuntime();
  let enemyHp = 100_000;
  let playerHp = 1_000;
  let shield = 300;
  let mp = 500;
  let actions = 0;
  let logLength = 0;
  let maxDamage = 0;

  const apply = (
    event: Parameters<typeof resolveTier6UniqueEvent>[2],
  ) => {
    const result = resolveTier6UniqueEvent(signatures, state, event);
    state = result.state;
    for (const command of result.commands) {
      logLength += 1;
      if (
        command.kind === "damage_fixed" ||
        command.kind === "damage_magic"
      ) {
        enemyHp = Math.max(0, enemyHp - command.amount);
        maxDamage = Math.max(maxDamage, command.amount);
      } else if (command.kind === "shield") {
        shield = Math.max(0, shield + command.amount);
      } else if (command.kind === "heal") {
        playerHp = Math.min(1_000, playerHp + command.amount);
      } else if (command.kind === "mp") {
        mp = Math.min(500, mp + command.amount);
      } else if (command.kind === "extra_action") {
        actions += command.amount;
      }
    }
  };

  for (let turn = 0; turn < 30 && enemyHp > 0; turn += 1) {
    const origin = { actionId: turn + 1, eventId: turn * 10 };
    actions += 1;
    apply({ kind: "action_start", shield, maxHp: 1_000, origin });
    if (turn % 4 === 0) {
      apply({ kind: "dodge", origin: { ...origin, eventId: origin.eventId + 1 } });
    }
    const paidMp = 20 + Math.floor(rng() * 100);
    mp = Math.max(0, mp - paidMp);
    apply({
      kind: "mp_spent",
      amount: paidMp,
      magicAtk: 600,
      targetHasStatus: turn % 2 === 0,
      origin: { ...origin, eventId: origin.eventId + 2 },
    });
    apply({
      kind: "direct_hit",
      damage: 250 + Math.floor(rng() * 500),
      crit: turn % 3 === 0,
      attackKind: turn % 2 === 0 ? "skill" : "basic",
      paidMp,
      statusKinds: turn % 3,
      bleedStacks: turn % 6,
      bleedRemainingDamage: 900,
      poisonStacks: turn % 7,
      poisonRemainingDamage: 1_100,
      magicAtk: 600,
      maxHp: 1_000,
      origin: { ...origin, eventId: origin.eventId + 3 },
    });
    if (turn % 5 === 0) {
      apply({
        kind: "shield_broken",
        shieldBefore: shield,
        overflowDamage: 120,
        maxHp: 1_000,
        origin: { ...origin, eventId: origin.eventId + 4 },
      });
      shield = 0;
      playerHp = Math.max(0, playerHp - 120);
    }
    if (turn % 3 === 0) {
      apply({
        kind: "heal_calculated",
        amount: 180,
        maxHp: 1_000,
        origin: { ...origin, eventId: origin.eventId + 5 },
      });
      apply({
        kind: "shield_gained",
        amount: 100,
        maxHp: 1_000,
        origin: { ...origin, eventId: origin.eventId + 6 },
      });
      shield += 100;
    }
    apply({
      kind: "hp_threshold",
      currentHp: playerHp,
      maxHp: 1_000,
      origin: { ...origin, eventId: origin.eventId + 7 },
    });
  }

  return { state, enemyHp, playerHp, mp, shield, actions, logLength, maxDamage };
}

describe("6T 유니크 조합 구조 안전성", () => {
  const combinations: Tier6UniqueMechanic[][] = [
    ["gravity_reprisal"],
    ["bleed_burst"],
    ["pursuit_mark"],
    ["shadow_echo"],
    ["venom_burst"],
    ["arcane_overload"],
    ["sanctuary_reserve"],
    ["gravity_reprisal", "gravity_feedback"],
    ["bleed_burst", "bleed_aftermath"],
    ["venom_burst", "venom_balance"],
    ["arcane_overload", "arcane_feedback"],
    ["pursuit_mark", "shadow_echo", "gale_circuit"],
    ["gravity_reprisal", "bleed_burst", "venom_burst", "triphase_link"],
    ["pursuit_mark", "shadow_echo", "arcane_overload", "storm_confluence"],
    [
      "gravity_reprisal",
      "bleed_burst",
      "pursuit_mark",
      "shadow_echo",
      "venom_burst",
      "arcane_overload",
      "sanctuary_reserve",
      "mechanic_unity",
      "triphase_link",
      "storm_confluence",
      "dominant_heart",
    ],
  ];

  it("단독·지원쌍·고연쇄 조합이 500개 시드에서 유한하게 종료된다", () => {
    let observedMaxDamage = 0;
    for (const mechanics of combinations) {
      for (let seed = 1; seed <= 500; seed += 1) {
        const result = simulate(mechanics, seed);
        observedMaxDamage = Math.max(observedMaxDamage, result.maxDamage);
        expect(result.actions).toBeLessThan(1_000);
        expect(finiteState(result.state)).toBe(true);
        expect(Number.isFinite(result.playerHp)).toBe(true);
        expect(Number.isFinite(result.enemyHp)).toBe(true);
        expect(Number.isFinite(result.mp)).toBe(true);
        expect(Number.isFinite(result.shield)).toBe(true);
        expect(result.logLength).toBeLessThan(10_000);
      }
    }
    // 계수 상한을 강제하지 않고 관측만 보존한다. 실제 밸런스 조정은 운영 지표로 판단한다.
    expect(observedMaxDamage).toBeGreaterThan(0);
  }, 15_000);
});
