import { describe, expect, it } from "vitest";
import type {
  SignatureEffect,
  Tier6UniqueMechanic,
} from "@/adventure/data/v2/v2Equipment";
import {
  initialTier6UniqueRuntime,
  resolveTier6UniqueEvent,
  tier6ResourceSnapshot,
} from "./tier6UniqueEffects";

function signatures(...mechanics: Tier6UniqueMechanic[]): SignatureEffect[] {
  return mechanics.map((mechanic) => ({
    trigger: "tier6_unique",
    mechanic,
    label: mechanic,
  }));
}

const origin = { actionId: 1, eventId: 1 };

describe("6T 유니크 순수 런타임", () => {
  it("빈 상태는 모든 자원을 안전한 유한값으로 초기화한다", () => {
    const state = initialTier6UniqueRuntime();
    expect(state).toMatchObject({
      gravityReprisal: 0,
      pursuitMarks: 0,
      shadowEchoes: 0,
      arcaneOverload: 0,
      sanctuaryReserve: 0,
      dominantMechanic: null,
    });
    expect(Object.values(tier6ResourceSnapshot(state))).not.toContain(
      expect.stringMatching(/NaN|Infinity/),
    );
  });

  it("중력 반발은 보호막 소진값과 초과 피해의 35%를 저장하고 다음 적중에 방출한다", () => {
    const sigs = signatures("gravity_reprisal");
    const stored = resolveTier6UniqueEvent(sigs, initialTier6UniqueRuntime(), {
      kind: "shield_broken",
      shieldBefore: 200,
      overflowDamage: 100,
      maxHp: 1_000,
      origin,
    });
    expect(stored.state.gravityReprisal).toBe(105);
    const fired = resolveTier6UniqueEvent(sigs, stored.state, {
      kind: "direct_hit",
      damage: 400,
      crit: false,
      attackKind: "basic",
      paidMp: 0,
      statusKinds: 0,
      bleedStacks: 0,
      bleedRemainingDamage: 0,
      poisonStacks: 0,
      poisonRemainingDamage: 0,
      magicAtk: 0,
      maxHp: 1_000,
      origin,
    });
    expect(fired.commands).toContainEqual(
      expect.objectContaining({ kind: "damage_fixed", amount: 105 }),
    );
    expect(fired.state.gravityReprisal).toBe(0);
  });

  it("반중력 인장은 보호막의 20%를 저장하고 반발 후 최대 HP 5% 보호막을 만든다", () => {
    const sigs = signatures("gravity_reprisal", "gravity_feedback");
    const gained = resolveTier6UniqueEvent(sigs, initialTier6UniqueRuntime(), {
      kind: "shield_gained",
      amount: 250,
      maxHp: 1_000,
      origin,
    });
    expect(gained.state.gravityReprisal).toBe(50);
    const fired = resolveTier6UniqueEvent(sigs, gained.state, {
      kind: "direct_hit",
      damage: 100,
      crit: false,
      attackKind: "basic",
      paidMp: 0,
      statusKinds: 0,
      bleedStacks: 0,
      bleedRemainingDamage: 0,
      poisonStacks: 0,
      poisonRemainingDamage: 0,
      magicAtk: 0,
      maxHp: 1_000,
      origin,
    });
    expect(fired.commands).toContainEqual(
      expect.objectContaining({ kind: "shield", amount: 50 }),
    );
  });

  it("출혈 기본 공격은 출혈을 소비하지 않고 남은 피해 50%와 상흔 효과를 적용한다", () => {
    const result = resolveTier6UniqueEvent(
      signatures("bleed_burst", "bleed_aftermath"),
      initialTier6UniqueRuntime(),
      {
        kind: "direct_hit",
        damage: 100,
        crit: false,
        attackKind: "basic",
        paidMp: 0,
        statusKinds: 1,
        bleedStacks: 4,
        bleedRemainingDamage: 1_000,
        poisonStacks: 0,
        poisonRemainingDamage: 0,
        magicAtk: 0,
        maxHp: 1_000,
        origin,
      },
    );
    expect(result.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "damage_fixed", amount: 500 }),
        expect.objectContaining({ kind: "def_debuff", pct: 12, actions: 2 }),
        expect.objectContaining({ kind: "apply_dot", dot: "bleed", stacks: 1 }),
      ]),
    );
    expect(result.commands).not.toContainEqual(
      expect.objectContaining({ kind: "consume_dot", dot: "bleed" }),
    );
  });

  it("혈맥 폭발은 같은 행동과 다음 3행동을 건너뛰고 4행동 간격으로 재발동한다", () => {
    const sigs = signatures("bleed_burst");
    const hit = (actionId: number, state = initialTier6UniqueRuntime()) =>
      resolveTier6UniqueEvent(sigs, state, {
        kind: "direct_hit",
        damage: 100,
        crit: false,
        attackKind: "basic",
        paidMp: 0,
        statusKinds: 1,
        bleedStacks: 10,
        bleedRemainingDamage: 1_000,
        poisonStacks: 0,
        poisonRemainingDamage: 0,
        magicAtk: 0,
        maxHp: 1_000,
        origin: { actionId, eventId: 1 },
      });

    const first = hit(1);
    expect(first.commands).toContainEqual(
      expect.objectContaining({ kind: "damage_fixed", amount: 500 }),
    );
    expect(first.state.bleedBurstLastActionId).toBe(1);

    let state = first.state;
    for (const actionId of [1, 2, 3, 4]) {
      const blocked = hit(actionId, state);
      expect(blocked.commands).not.toContainEqual(
        expect.objectContaining({ mechanic: "bleed_burst", kind: "damage_fixed" }),
      );
      state = blocked.state;
    }

    const ready = hit(5, state);
    expect(ready.commands).toContainEqual(
      expect.objectContaining({ kind: "damage_fixed", amount: 500 }),
    );
    expect(ready.state.bleedBurstLastActionId).toBe(5);
  });

  it("추적은 5번째 직접 적중에 직전 피해 60%를 발사하고 빗나가면 초기화한다", () => {
    const sigs = signatures("pursuit_mark");
    let state = { ...initialTier6UniqueRuntime(), pursuitMarks: 4 };
    const fired = resolveTier6UniqueEvent(sigs, state, {
      kind: "direct_hit",
      damage: 500,
      crit: false,
      attackKind: "basic",
      paidMp: 0,
      statusKinds: 0,
      bleedStacks: 0,
      bleedRemainingDamage: 0,
      poisonStacks: 0,
      poisonRemainingDamage: 0,
      magicAtk: 0,
      maxHp: 1_000,
      origin,
    });
    expect(fired.state.pursuitMarks).toBe(0);
    expect(fired.commands).toContainEqual(
      expect.objectContaining({ kind: "damage_fixed", amount: 300 }),
    );
    state = { ...fired.state, pursuitMarks: 3 };
    expect(
      resolveTier6UniqueEvent(sigs, state, {
        kind: "direct_miss",
        origin: { actionId: 2, eventId: 1 },
      }).state.pursuitMarks,
    ).toBe(0);
  });

  it("잔상은 회피로 최대 3개를 저장하고 다음 치명 피해의 45%를 복제한다", () => {
    const sigs = signatures("shadow_echo");
    let state = initialTier6UniqueRuntime();
    for (let i = 0; i < 4; i++) {
      state = resolveTier6UniqueEvent(sigs, state, {
        kind: "dodge",
        origin: { actionId: i, eventId: 1 },
      }).state;
    }
    expect(state.shadowEchoes).toBe(3);
    const fired = resolveTier6UniqueEvent(sigs, state, {
      kind: "direct_hit",
      damage: 400,
      crit: true,
      attackKind: "basic",
      paidMp: 0,
      statusKinds: 0,
      bleedStacks: 0,
      bleedRemainingDamage: 0,
      poisonStacks: 0,
      poisonRemainingDamage: 0,
      magicAtk: 0,
      maxHp: 1_000,
      origin,
    });
    expect(fired.state.shadowEchoes).toBe(2);
    expect(fired.commands).toContainEqual(
      expect.objectContaining({ kind: "damage_fixed", amount: 180 }),
    );
  });

  it("중독은 스킬로 쌓고 5스택 기본 공격에서 75% 폭발·절반 올림 재부여한다", () => {
    const result = resolveTier6UniqueEvent(
      signatures("venom_burst", "venom_balance"),
      initialTier6UniqueRuntime(),
      {
        kind: "direct_hit",
        damage: 100,
        crit: false,
        attackKind: "basic",
        paidMp: 0,
        statusKinds: 1,
        bleedStacks: 0,
        bleedRemainingDamage: 0,
        poisonStacks: 5,
        poisonRemainingDamage: 1_000,
        magicAtk: 0,
        maxHp: 1_000,
        origin,
      },
    );
    expect(result.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "damage_fixed", amount: 750 }),
        expect.objectContaining({ kind: "apply_dot", dot: "poison", stacks: 3 }),
        expect.objectContaining({ kind: "mdef_debuff", pct: 10, actions: 2 }),
      ]),
    );
  });

  it("MP 100마다 마공 140% 낙뢰를 만들고 역류는 비용 20% 환급·상태 적중 시 과부하 25를 돌려준다", () => {
    const result = resolveTier6UniqueEvent(
      signatures("arcane_overload", "arcane_feedback"),
      initialTier6UniqueRuntime(),
      {
        kind: "mp_spent",
        amount: 220,
        magicAtk: 500,
        targetHasStatus: true,
        origin,
      },
    );
    expect(result.commands.filter((command) => command.kind === "damage_magic"))
      .toHaveLength(2);
    expect(result.commands).toContainEqual(
      expect.objectContaining({ kind: "damage_magic", amount: 700 }),
    );
    expect(result.commands).not.toContainEqual(
      expect.objectContaining({
        kind: "damage_fixed",
        mechanic: "arcane_overload",
      }),
    );
    expect(result.commands).toContainEqual(
      expect.objectContaining({ kind: "mp", amount: 44 }),
    );
    expect(result.state.arcaneOverload).toBe(70);
  });

  it("성역은 산출 회복량 30%를 최대 HP 60%까지 저장하고 HP 35% 이하에서 소비한다", () => {
    const sigs = signatures("sanctuary_reserve");
    const stored = resolveTier6UniqueEvent(sigs, initialTier6UniqueRuntime(), {
      kind: "heal_calculated",
      amount: 3_000,
      maxHp: 1_000,
      origin,
    });
    expect(stored.state.sanctuaryReserve).toBe(600);
    const fired = resolveTier6UniqueEvent(sigs, stored.state, {
      kind: "hp_threshold",
      currentHp: 350,
      maxHp: 1_000,
      origin,
    });
    expect(fired.commands).toContainEqual(
      expect.objectContaining({ kind: "heal", amount: 600 }),
    );
    expect(fired.state.sanctuaryReserve).toBe(0);
  });

  it("성역은 HP가 0이 된 뒤에는 소비해 부활시키지 않는다", () => {
    const state = {
      ...initialTier6UniqueRuntime(),
      sanctuaryReserve: 600,
    };

    const result = resolveTier6UniqueEvent(
      signatures("sanctuary_reserve"),
      state,
      {
        kind: "hp_threshold",
        currentHp: 0,
        maxHp: 1_000,
        origin,
      },
    );

    expect(result.commands).not.toContainEqual(
      expect.objectContaining({ kind: "heal" }),
    );
    expect(result.state.sanctuaryReserve).toBe(600);
  });

  it("생성 효과는 같은 기믹으로 재진입하지 않는다", () => {
    const result = resolveTier6UniqueEvent(
      signatures("shadow_echo"),
      { ...initialTier6UniqueRuntime(), shadowEchoes: 1 },
      {
        kind: "signature_damage",
        mechanic: "shadow_echo",
        damage: 450,
        origin: {
          actionId: 3,
          eventId: 7,
          generatedBy: "shadow_echo",
        },
      },
    );
    expect(result.commands).toEqual([]);
  });

  it("항로·교차 유니크는 보호막 변환, 질풍 3종, 마나 귀환, 삼상, 합류를 처리한다", () => {
    const sigs = signatures(
      "shield_conversion",
      "gale_circuit",
      "status_mana_return",
      "triphase_link",
      "storm_confluence",
    );
    const action = resolveTier6UniqueEvent(sigs, initialTier6UniqueRuntime(), {
      kind: "action_start",
      shield: 300,
      maxHp: 1_000,
      origin,
    });
    expect(action.commands).toContainEqual(
      expect.objectContaining({ kind: "shield", amount: -30 }),
    );
    expect(action.state.nextDirectFixedDamage).toBe(60);

    const linked = resolveTier6UniqueEvent(sigs, action.state, {
      kind: "signature_damage",
      mechanic: "bleed_burst",
      damage: 200,
      origin,
    });
    expect(linked.state.pursuitMarks).toBe(1);
    expect(linked.state.nextHealPct).toBe(12);
    expect(linked.state.nextShieldPct).toBe(12);

    let gale = resolveTier6UniqueEvent(sigs, linked.state, {
      kind: "dodge",
      origin,
    });
    gale = resolveTier6UniqueEvent(sigs, gale.state, {
      kind: "direct_hit",
      damage: 100,
      crit: true,
      attackKind: "skill",
      paidMp: 100,
      statusKinds: 2,
      bleedStacks: 0,
      bleedRemainingDamage: 0,
      poisonStacks: 0,
      poisonRemainingDamage: 0,
      magicAtk: 0,
      maxHp: 1_000,
      origin,
    });
    expect(gale.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "extra_action" }),
        expect.objectContaining({ kind: "mp", amount: 16 }),
        expect.objectContaining({ kind: "damage_fixed", amount: 60 }),
      ]),
    );
  });

  it("폭풍심장은 첫 3회 기믹을 고정하고 이후 해당 계수를 35% 높인다", () => {
    const sigs = signatures("pursuit_mark", "dominant_heart");
    let state = initialTier6UniqueRuntime();
    for (let activation = 0; activation < 3; activation++) {
      state = { ...state, pursuitMarks: 4 };
      state = resolveTier6UniqueEvent(sigs, state, {
        kind: "direct_hit",
        damage: 100,
        crit: false,
        attackKind: "basic",
        paidMp: 0,
        statusKinds: 0,
        bleedStacks: 0,
        bleedRemainingDamage: 0,
        poisonStacks: 0,
        poisonRemainingDamage: 0,
        magicAtk: 0,
        maxHp: 1_000,
        origin: { actionId: activation, eventId: 1 },
      }).state;
    }
    expect(state.dominantMechanic).toBe("pursuit");
    const boosted = resolveTier6UniqueEvent(sigs, { ...state, pursuitMarks: 4 }, {
      kind: "direct_hit",
      damage: 100,
      crit: false,
      attackKind: "basic",
      paidMp: 0,
      statusKinds: 0,
      bleedStacks: 0,
      bleedRemainingDamage: 0,
      poisonStacks: 0,
      poisonRemainingDamage: 0,
      magicAtk: 0,
      maxHp: 1_000,
      origin,
    });
    expect(boosted.commands).toContainEqual(
      expect.objectContaining({ kind: "damage_fixed", amount: 81 }),
    );
  });
});
