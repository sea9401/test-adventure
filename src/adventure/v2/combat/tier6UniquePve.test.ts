import { afterEach, describe, expect, it, vi } from "vitest";
import type { Monster } from "@/adventure/data/monsters";
import type { SignatureEffect } from "@/adventure/data/v2/v2Equipment";
import type { V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { applyPlayerV2SkillCast, initialBattleState } from "./engine";
import { resolveEnemyPhase } from "./engine.enemyPhase";
import { resolvePlayerPhase } from "./engine.playerPhase";
import type { PlayerCombat } from "./engineState";
import { makeBleedDot } from "./combatShared";
import {
  applyTier6UniquePveEvent,
  tier6StatusKindCount,
} from "./tier6UniquePveAdapter";

const enemy: Monster = {
  name: "6T 시험체",
  tags: [],
  hp: 10_000,
  atk: 500,
  def: 0,
  spd: 1,
  exp: 0,
  drops: [],
};

const basePlayer: PlayerCombat = {
  hp: 1_000,
  maxHp: 1_000,
  atk: 100,
  magicAtk: 100,
  def: 0,
  spd: 100,
  evasionPct: 0,
  attackCount: 1,
  critChancePct: 0,
};

const bloodlinePatternSkills: V2SkillsState = {
  learned: ["v2c_warrior_flurry"],
  equipped: ["v2c_warrior_flurry"],
  pattern: {
    blocks: [
      {
        condition: {
          kind: "all",
          conditions: [
            { kind: "enemy_status", tag: "bleed", op: "atLeast", stacks: 5 },
            {
              kind: "self_resource",
              resource: "bloodlineBurstReady",
              op: "atLeast",
              value: 1,
            },
          ],
        },
        action: { kind: "basic_attack" },
      },
      {
        condition: { kind: "always" },
        action: { kind: "skill", skillId: "v2c_warrior_flurry" },
      },
    ],
  },
};

function signature(mechanic: NonNullable<SignatureEffect["mechanic"]>): SignatureEffect {
  return { trigger: "tier6_unique", mechanic, label: mechanic };
}

afterEach(() => vi.restoreAllMocks());

describe("6T 유니크 PvE 연동", () => {
  it("미장착 전투 상태에는 신규 런타임 키를 만들지 않는다", () => {
    expect(initialBattleState(basePlayer, enemy, "일반").stacks.tier6Uniques)
      .toBeUndefined();
  });

  it("장착 시에만 런타임을 만들고 5번째 추적 적중의 60% 추가 피해를 적용한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const player = {
      ...basePlayer,
      equipSignatures: [signature("pursuit_mark")],
    };
    const initial = initialBattleState(player, enemy, "추적자");
    const primed = {
      ...initial,
      stacks: {
        ...initial.stacks,
        tier6Uniques: {
          ...initial.stacks.tier6Uniques!,
          pursuitMarks: 4,
        },
      },
    };
    const plain = resolvePlayerPhase(
      initialBattleState(basePlayer, enemy, "일반"),
      basePlayer,
      "일반",
      { kind: "attack" },
    );
    const tracked = resolvePlayerPhase(
      primed,
      player,
      "추적자",
      { kind: "attack" },
    );

    expect(initial.stacks.tier6Uniques).toBeDefined();
    expect(tracked.enemyHp).toBeLessThan(plain.enemyHp);
    expect(tracked.log.some((entry) => entry.text.includes("추적 사격")))
      .toBe(true);
    expect(tracked.stacks.tier6Uniques?.pursuitMarks).toBe(0);
  });

  it("적 공격이 보호막을 완전히 소진하면 중력 반발을 저장한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const player = {
      ...basePlayer,
      equipSignatures: [signature("gravity_reprisal")],
    };
    const initial = initialBattleState(player, enemy, "중력기사");
    const shielded = {
      ...initial,
      phase: "enemy" as const,
      stacks: { ...initial.stacks, playerShield: 100 },
    };
    const after = resolveEnemyPhase(shielded, player, "중력기사", true);

    expect(after.stacks.playerShield).toBe(0);
    expect(after.stacks.tier6Uniques?.gravityReprisal).toBeGreaterThan(0);
  });

  it("보장 회피는 그림자 잔상과 질풍 회피 사건을 함께 기록한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const player = {
      ...basePlayer,
      equipSignatures: [signature("shadow_echo"), signature("gale_circuit")],
    };
    const initial = initialBattleState(player, enemy, "바람그림자");
    const evading = {
      ...initial,
      phase: "enemy" as const,
      stacks: { ...initial.stacks, evadesRemaining: 1 },
    };
    const after = resolveEnemyPhase(evading, player, "바람그림자", true);

    expect(after.stacks.tier6Uniques?.shadowEchoes).toBe(1);
    expect(after.stacks.tier6Uniques?.galeEvents).toContain("dodge");
  });

  it("적 공격으로 HP가 35% 이하가 되면 저장한 성역을 즉시 소비한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const player = {
      ...basePlayer,
      def: 400,
      equipSignatures: [signature("sanctuary_reserve")],
    };
    const initial = initialBattleState(player, enemy, "성역기사");
    const primed = {
      ...initial,
      phase: "enemy" as const,
      playerHp: 400,
      stacks: {
        ...initial.stacks,
        tier6Uniques: {
          ...initial.stacks.tier6Uniques!,
          sanctuaryReserve: 200,
        },
      },
    };
    const withoutReserve = {
      ...primed,
      stacks: {
        ...primed.stacks,
        tier6Uniques: {
          ...primed.stacks.tier6Uniques!,
          sanctuaryReserve: 0,
        },
      },
    };
    const plain = resolveEnemyPhase(withoutReserve, player, "성역기사", true);
    const after = resolveEnemyPhase(primed, player, "성역기사", true);

    expect(after.playerHp - plain.playerHp).toBe(200);
    expect(after.stacks.tier6Uniques?.sanctuaryReserve).toBe(0);
    expect(after.log.some((entry) => entry.text.includes("성역 소비")))
      .toBe(true);
  });

  it("적의 치명적인 공격에 쓰러지면 저장한 성역으로 부활하지 않는다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const player = {
      ...basePlayer,
      equipSignatures: [signature("sanctuary_reserve")],
    };
    const initial = initialBattleState(player, enemy, "성역기사");
    const primed = {
      ...initial,
      phase: "enemy" as const,
      playerHp: 100,
      stacks: {
        ...initial.stacks,
        tier6Uniques: {
          ...initial.stacks.tier6Uniques!,
          sanctuaryReserve: 200,
        },
      },
    };

    const after = resolveEnemyPhase(primed, player, "성역기사", true);

    expect(after.outcome).toBe("lose");
    expect(after.playerHp).toBe(0);
    expect(after.stacks.tier6Uniques?.sanctuaryReserve).toBe(200);
    expect(after.log.some((entry) => entry.text.includes("성역 소비")))
      .toBe(false);
  });

  it("부식은 물리 방어가 아닌 마법방어 전용 감소 슬롯에 기록한다", () => {
    const player = {
      ...basePlayer,
      equipSignatures: [
        signature("venom_burst"),
        signature("venom_balance"),
      ],
    };
    const initial = initialBattleState(player, enemy, "독왕");
    const after = applyTier6UniquePveEvent(initial, player, {
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
      magicAtk: 100,
      maxHp: 1_000,
      origin: { actionId: 1, eventId: 1 },
    });

    expect(after.buffs.enemyDefDebuffPct).toBe(0);
    expect(after.buffs.enemyMagicDefDebuffPct).toBe(10);
    expect(after.buffs.enemyMagicDefDebuffTurnsLeft).toBe(2);
    expect(tier6StatusKindCount(after)).toBe(2);
  });

  it("상흔의 계수기는 기존 출혈의 출처·스택을 보존하고 지속을 최소 5회로 갱신한다", () => {
    const player = {
      ...basePlayer,
      equipSignatures: [signature("bleed_burst"), signature("bleed_aftermath")],
    };
    const initial = initialBattleState(player, enemy, "혈맥 검사자");
    const bleed = makeBleedDot({
      stacks: 10,
      turns: 2,
      flatPerStack: 10,
      sourceAtk: 100,
    });
    const burstEvent = {
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
      maxHp: 1_000,
      origin: { actionId: 1, eventId: 1 },
    } as const;
    const after = applyTier6UniquePveEvent(
      { ...initial, enemyV2Dots: [bleed] },
      player,
      burstEvent,
    );
    const longBleed = { ...bleed, turns: 6 };
    const afterLongBleed = applyTier6UniquePveEvent(
      { ...initial, enemyV2Dots: [longBleed] },
      player,
      burstEvent,
    );

    expect(after.enemyHp).toBe(initial.enemyHp - 500);
    expect(after.enemyV2Dots).toEqual([{ ...bleed, turns: 5 }]);
    expect(afterLongBleed.enemyV2Dots).toEqual([longBleed]);
    expect(
      after.log.some((entry) =>
        entry.text.includes(
          "[상흔 고정] 출혈 중첩 유지 · 지속 횟수 최소 5회로 갱신",
        ),
      ),
    ).toBe(true);
  });

  it("PvE 패턴은 혈맥 폭발 준비 때만 출혈 대상 일반 공격을 선택한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = {
      ...basePlayer,
      maxMp: 1_000,
      equipSignatures: [signature("bleed_burst")],
    };
    const initial = initialBattleState(
      player,
      enemy,
      "혈맥 검사자",
      bloodlinePatternSkills,
    );
    const bleed = makeBleedDot({
      stacks: 5,
      turns: 3,
      flatPerStack: 10,
      sourceAtk: 100,
    });
    const ready = { ...initial, enemyV2Dots: [bleed] };
    const waiting = {
      ...ready,
      turn: { ...ready.turn, completedPlayerTurns: 1 },
      stacks: {
        ...ready.stacks,
        tier6Uniques: {
          ...ready.stacks.tier6Uniques!,
          bleedBurstLastActionId: 1,
        },
      },
    };
    const ticked = { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} };

    expect(applyPlayerV2SkillCast(ready, player, ticked).castFired).toBe(false);
    expect(applyPlayerV2SkillCast(waiting, player, ticked).castFired).toBe(true);
  });

  it("과부하 낙뢰는 적 마법방어를 거친 마법 피해를 준다", () => {
    const player = {
      ...basePlayer,
      magicAtk: 500,
      equipSignatures: [signature("arcane_overload")],
    };
    const initial = initialBattleState(
      player,
      { ...enemy, magicDef: 300 },
      "뇌정술사",
    );
    const after = applyTier6UniquePveEvent(initial, player, {
      kind: "mp_spent",
      amount: 100,
      magicAtk: 500,
      targetHasStatus: false,
      origin: { actionId: 1, eventId: 1 },
    });

    expect(initial.enemyHp - after.enemyHp).toBe(400);
    expect(after.log.at(-1)?.text).toContain("400 마법 피해");
  });

  it("과부하 낙뢰는 상시 마법방어 감소도 적용한다", () => {
    const player = {
      ...basePlayer,
      magicAtk: 500,
      enemyMagicDefReductionPct: 50,
      equipSignatures: [signature("arcane_overload")],
    };
    const initial = initialBattleState(
      player,
      { ...enemy, magicDef: 300 },
      "뇌정술사",
    );
    const after = applyTier6UniquePveEvent(initial, player, {
      kind: "mp_spent",
      amount: 100,
      magicAtk: 500,
      targetHasStatus: false,
      origin: { actionId: 1, eventId: 1 },
    });

    expect(initial.enemyHp - after.enemyHp).toBe(550);
  });

  it("삼상 연계는 과부하 낙뢰의 방어 적용 후 피해를 저장한다", () => {
    const player = {
      ...basePlayer,
      magicAtk: 500,
      equipSignatures: [
        signature("arcane_overload"),
        signature("triphase_link"),
      ],
    };
    const initial = initialBattleState(
      player,
      { ...enemy, magicDef: 300 },
      "뇌정술사",
    );
    const after = applyTier6UniquePveEvent(initial, player, {
      kind: "mp_spent",
      amount: 100,
      magicAtk: 500,
      targetHasStatus: false,
      origin: { actionId: 1, eventId: 1 },
    });

    expect(after.stacks.tier6Uniques?.sanctuaryReserve).toBe(40);
  });

  it("합일 발동은 공격과 별도로 회복·마법공격 효율 18%를 3행동 저장한다", () => {
    const player = {
      ...basePlayer,
      equipSignatures: [signature("pursuit_mark"), signature("mechanic_unity")],
    };
    const initial = initialBattleState(player, enemy, "합일자");
    const primed = {
      ...initial,
      stacks: {
        ...initial.stacks,
        tier6Uniques: {
          ...initial.stacks.tier6Uniques!,
          pursuitMarks: 4,
          unityMechanics: ["gravity", "bleed"] as ("gravity" | "bleed")[],
        },
      },
    };
    const after = applyTier6UniquePveEvent(primed, player, {
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
      magicAtk: 100,
      maxHp: 1_000,
      origin: { actionId: 1, eventId: 1 },
    });

    expect(after.buffs.playerAtkBuffPct).toBe(18);
    expect(after.buffs.tier6UnityHealPct).toBe(18);
    expect(after.buffs.tier6UnityTurnsLeft).toBe(3);
  });

  it("합일 강화는 물리 직접 피해 스킬에도 공격력 18%를 적용한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const player = {
      ...basePlayer,
      mp: 1_000,
      maxMp: 1_000,
      strStat: 100,
    };
    const initial = initialBattleState(player, enemy, "합일자", {
      learned: ["v2_skill_strike"],
      equipped: ["v2_skill_strike"],
    });
    const ticked = { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} };
    const plain = applyPlayerV2SkillCast(initial, player, ticked).state;
    const united = applyPlayerV2SkillCast(
      {
        ...initial,
        buffs: {
          ...initial.buffs,
          tier6UnityHealPct: 18,
          tier6UnityTurnsLeft: 3,
        },
      },
      player,
      ticked,
    ).state;

    expect(united.enemyHp).toBeLessThan(plain.enemyHp);
  });
});
