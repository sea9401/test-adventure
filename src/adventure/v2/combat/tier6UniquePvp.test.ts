import { afterEach, describe, expect, it, vi } from "vitest";
import type { SignatureEffect } from "@/adventure/data/v2/v2Equipment";
import {
  advanceTurnPvP,
  initialBattleStatePvP,
} from "./engine-pvp";
import { makeBleedDot } from "./combatShared";
import type { PlayerCombat } from "./engineState";
import { applyTier6UniquePvpEvent } from "./tier6UniquePvpAdapter";

function player(over: Partial<PlayerCombat> = {}): PlayerCombat {
  return {
    hp: 2_000,
    maxHp: 2_000,
    atk: 100,
    def: 0,
    spd: 10,
    evasionPct: 0,
    accuracyPct: 100,
    attackCount: 1,
    critChancePct: 0,
    ...over,
  };
}

const pursuit: SignatureEffect = {
  trigger: "tier6_unique",
  mechanic: "pursuit_mark",
  label: "지평선 추적",
};

function signature(mechanic: NonNullable<SignatureEffect["mechanic"]>): SignatureEffect {
  return { trigger: "tier6_unique", mechanic, label: mechanic };
}

afterEach(() => vi.restoreAllMocks());

describe("6T 유니크 PvP 대칭 연동", () => {
  it("미장착 사이드는 런타임 키를 만들지 않고 장착 사이드만 초기화한다", () => {
    const state = initialBattleStatePvP(
      player({ equipSignatures: [pursuit] }),
      player(),
      "P1",
      "P2",
    );
    expect(state.p1.stacks.tier6Uniques).toBeDefined();
    expect(state.p2.stacks.tier6Uniques).toBeUndefined();
  });

  it("P1과 P2를 바꿔도 5번째 추적 사격의 피해·자원 결과가 같다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const fast = player({ spd: 100, equipSignatures: [pursuit] });
    const slow = player({ spd: 1 });

    const p1Initial = initialBattleStatePvP(fast, slow, "추적자", "상대");
    const p1Primed = {
      ...p1Initial,
      p1: {
        ...p1Initial.p1,
        stacks: {
          ...p1Initial.p1.stacks,
          tier6Uniques: {
            ...p1Initial.p1.stacks.tier6Uniques!,
            pursuitMarks: 4,
          },
        },
      },
    };
    const p1After = advanceTurnPvP(p1Primed);

    const p2Initial = initialBattleStatePvP(slow, fast, "상대", "추적자");
    const p2Primed = {
      ...p2Initial,
      p2: {
        ...p2Initial.p2,
        stacks: {
          ...p2Initial.p2.stacks,
          tier6Uniques: {
            ...p2Initial.p2.stacks.tier6Uniques!,
            pursuitMarks: 4,
          },
        },
      },
    };
    const p2After = advanceTurnPvP(p2Primed);

    expect(p1Initial.p2.hp - p1After.p2.hp).toBe(
      p2Initial.p1.hp - p2After.p1.hp,
    );
    expect(p1After.p1.stacks.tier6Uniques?.pursuitMarks).toBe(0);
    expect(p2After.p2.stacks.tier6Uniques?.pursuitMarks).toBe(0);
    expect(p1After.log.some((entry) => entry.text.includes("추적 사격")))
      .toBe(true);
    expect(p2After.log.some((entry) => entry.text.includes("추적 사격")))
      .toBe(true);
  });

  it("방어자 보호막 소진은 해당 사이드의 중력 반발에 저장된다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const gravity: SignatureEffect = {
      trigger: "tier6_unique",
      mechanic: "gravity_reprisal",
      label: "중력 반발",
    };
    const initial = initialBattleStatePvP(
      player({ spd: 100, atk: 500 }),
      player({ spd: 1, equipSignatures: [gravity] }),
      "공격자",
      "중력기사",
    );
    const shielded = {
      ...initial,
      p2: {
        ...initial.p2,
        stacks: { ...initial.p2.stacks, playerShield: 100 },
      },
    };
    const after = advanceTurnPvP(shielded);

    expect(after.p2.stacks.playerShield).toBe(0);
    expect(after.p2.stacks.tier6Uniques?.gravityReprisal).toBeGreaterThan(0);
  });

  it("방어자의 HP가 35% 이하가 되면 해당 사이드의 성역을 소비한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const initial = initialBattleStatePvP(
      player({ spd: 100, atk: 100 }),
      player({ spd: 1, equipSignatures: [signature("sanctuary_reserve")] }),
      "공격자",
      "성역기사",
    );
    const primed = {
      ...initial,
      p2: {
        ...initial.p2,
        hp: 700,
        stacks: {
          ...initial.p2.stacks,
          tier6Uniques: {
            ...initial.p2.stacks.tier6Uniques!,
            sanctuaryReserve: 300,
          },
        },
      },
    };
    const after = advanceTurnPvP(primed);

    expect(after.p2.hp).toBeGreaterThan(700);
    expect(after.p2.stacks.tier6Uniques?.sanctuaryReserve).toBe(0);
    expect(after.log.some((entry) => entry.text.includes("성역 소비")))
      .toBe(true);
  });

  it("방어자가 쓰러지면 저장한 성역으로 부활하지 않는다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const initial = initialBattleStatePvP(
      player({ spd: 100, atk: 10_000 }),
      player({ spd: 1, equipSignatures: [signature("sanctuary_reserve")] }),
      "공격자",
      "성역기사",
    );
    const primed = {
      ...initial,
      p2: {
        ...initial.p2,
        hp: 100,
        stacks: {
          ...initial.p2.stacks,
          tier6Uniques: {
            ...initial.p2.stacks.tier6Uniques!,
            sanctuaryReserve: 300,
          },
        },
      },
    };

    const after = advanceTurnPvP(primed);

    expect(after.outcome).toBe("p1_win");
    expect(after.p2.hp).toBe(0);
    expect(after.p2.stacks.tier6Uniques?.sanctuaryReserve).toBe(300);
    expect(after.log.some((entry) => entry.text.includes("성역 소비")))
      .toBe(false);
  });

  it("혈맥 폭발의 치명적인 추가 피해에도 방어자의 사망 극복이 발동한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const initial = initialBattleStatePvP(
      player({
        spd: 100,
        atk: 100,
        equipSignatures: [signature("bleed_burst")],
      }),
      player({ hp: 500, berserkerMadnessRank: 3 }),
      "혈맥 검사자",
      "패황 검사자",
    );
    const bleeding = {
      ...initial,
      p2: {
        ...initial.p2,
        v2Dots: [
          makeBleedDot({
            stacks: 4,
            turns: 3,
            flatPerStack: 100,
            sourceAtk: 100,
          }),
        ],
      },
    };

    const after = advanceTurnPvP(bleeding);

    expect(after.outcome).toBeNull();
    // 폭발에 사망 극복이 발동한 뒤, 보존된 출혈의 다음 틱 피해도 이어진다.
    expect(after.p2.hp).toBe(220);
    expect(after.p2.berserker?.deathOvercomeUsed).toBe(true);
    expect(after.log.some((entry) => entry.text.includes("[사망 극복]")))
      .toBe(true);
  });

  it("PvP 혈맥 폭발도 대상의 기존 출혈을 보존한다", () => {
    const initial = initialBattleStatePvP(
      player({ equipSignatures: [signature("bleed_burst")] }),
      player(),
      "혈맥 검사자",
      "상대",
    );
    const bleed = makeBleedDot({
      stacks: 10,
      turns: 3,
      flatPerStack: 10,
      sourceAtk: 100,
    });
    const bleeding = {
      ...initial,
      p2: { ...initial.p2, v2Dots: [bleed] },
    };

    const after = applyTier6UniquePvpEvent(bleeding, "p1", "p2", {
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
      magicAtk: 100,
      maxHp: 2_000,
      origin: { actionId: 1, eventId: 1 },
    });

    expect(after.p2.hp).toBe(initial.p2.hp - 500);
    expect(after.p2.v2Dots).toEqual([bleed]);
  });

  it("과부하 낙뢰는 마법방어·받피감·아레나 배율을 순서대로 거친다", () => {
    const attacker = player({
      magicAtk: 500,
      equipSignatures: [signature("arcane_overload")],
    });
    const defender = player({
      magicDef: 300,
      passiveDamageTakenReductionPct: 25,
    });
    const initial = {
      ...initialBattleStatePvP(attacker, defender, "뇌정술사", "방어자"),
      damageMultiplier: 0.65,
    };
    const after = applyTier6UniquePvpEvent(initial, "p1", "p2", {
      kind: "mp_spent",
      amount: 100,
      magicAtk: 500,
      targetHasStatus: false,
      origin: { actionId: 1, eventId: 1 },
    });

    expect(initial.p2.hp - after.p2.hp).toBe(195);
    expect(after.log.at(-1)?.text).toContain("195 마법 피해");
  });

  it("과부하 낙뢰는 마나 실드가 전부 흡수하면 HP 피해를 주지 않는다", () => {
    const attacker = player({
      magicAtk: 500,
      equipSignatures: [signature("arcane_overload")],
    });
    const defender = player({
      magicBarrierMax: 700,
      magicBarrierPvpAbsorbPct: 100,
      magicBarrierPvpEfficiencyPct: 0,
    });
    const initial = initialBattleStatePvP(
      attacker,
      defender,
      "뇌정술사",
      "마도사",
    );
    const after = applyTier6UniquePvpEvent(initial, "p1", "p2", {
      kind: "mp_spent",
      amount: 100,
      magicAtk: 500,
      targetHasStatus: false,
      origin: { actionId: 1, eventId: 1 },
    });

    expect(after.p2.hp).toBe(initial.p2.hp);
    expect(after.p2.magicBarrier).toBe(0);
  });

  it("과부하 낙뢰는 봉마결계 뒤 일반 보호막까지 순서대로 거친다", () => {
    const attacker = player({
      magicAtk: 500,
      equipSignatures: [signature("arcane_overload")],
    });
    const initial = initialBattleStatePvP(
      attacker,
      player(),
      "뇌정술사",
      "결계사",
    );
    const defended = {
      ...initial,
      p2: {
        ...initial.p2,
        stacks: {
          ...initial.p2.stacks,
          playerShield: 100,
          tripleWard: {
            rank: 1 as const,
            physical: 1,
            magic: 1,
            purification: 1,
            stabilityStacks: 0,
          },
        },
      },
    };
    const after = applyTier6UniquePvpEvent(defended, "p1", "p2", {
      kind: "mp_spent",
      amount: 100,
      magicAtk: 500,
      targetHasStatus: false,
      origin: { actionId: 1, eventId: 1 },
    });

    expect(defended.p2.hp - after.p2.hp).toBe(389);
    expect(after.p2.stacks.playerShield).toBe(0);
    expect(after.p2.stacks.tripleWard.magic).toBe(0);
  });

  it("과부하 낙뢰는 영역 안정의 직접 피해 감소를 거친다", () => {
    const attacker = player({
      magicAtk: 500,
      equipSignatures: [signature("arcane_overload")],
    });
    const initial = initialBattleStatePvP(
      attacker,
      player(),
      "뇌정술사",
      "대결계사",
    );
    const stable = {
      ...initial,
      p2: {
        ...initial.p2,
        stacks: {
          ...initial.p2.stacks,
          tripleWard: {
            rank: 2 as const,
            physical: 0,
            magic: 0,
            purification: 0,
            stabilityStacks: 2,
          },
        },
      },
    };
    const after = applyTier6UniquePvpEvent(stable, "p1", "p2", {
      kind: "mp_spent",
      amount: 100,
      magicAtk: 500,
      targetHasStatus: false,
      origin: { actionId: 1, eventId: 1 },
    });

    expect(stable.p2.hp - after.p2.hp).toBe(644);
  });
});
