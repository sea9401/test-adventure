import { afterEach, describe, expect, it, vi } from "vitest";

import type { Monster } from "@/adventure/data/monsters";
import type { V2SkillsState } from "@/adventure/data/v2/v2Skills";
import {
  castV2SkillOnAttackerTurnPvP,
  initialBattleStatePvP,
  applyOnHitReflect,
  tickPvPSideDotsOnAction,
} from "./engine-pvp";
import { resolveEnemyPhase } from "./engine.enemyPhase";
import { advanceTurnPvP } from "./engine.pvpPhase";
import {
  applyEnemyV2SkillCast,
  initialBattleState,
  type PlayerCombat,
} from "./engine";

const EMPTY_SKILLS: V2SkillsState = { learned: [], equipped: [] };
const STRIKE_SKILL: V2SkillsState = {
  learned: ["v2_skill_strike"],
  equipped: ["v2_skill_strike"],
};

const PLAYER: PlayerCombat = {
  hp: 1_000,
  maxHp: 1_000,
  mp: 1_000,
  maxMp: 1_000,
  atk: 40,
  def: 0,
  spd: 50,
  evasionPct: 0,
  accuracyPct: 100,
  attackCount: 1,
};

const ENEMY: Monster = {
  name: "보호막 시험체",
  tags: [],
  hp: 1_000,
  atk: 40,
  def: 0,
  spd: 60,
  exp: 0,
  evasionPct: 0,
};

function hasReactionLog(log: readonly { text: string }[]): boolean {
  return log.some(
    (entry) =>
      entry.text.includes("수호 반사") ||
      entry.text.includes("반사 갑주") ||
      entry.text.includes("반격의 룬") ||
      entry.text.includes("[반격]"),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("보호막 완전 흡수 시 반사·반격 차단", () => {
  it("PvE 기본 공격을 보호막이 전부 흡수하면 반사와 피격 반격이 발동하지 않는다", () => {
    const defender: PlayerCombat = {
      ...PLAYER,
      bulwarkShield: 200,
      thornsFlatFromDef: 200,
      runeCounterChancePct: 100,
      passiveCounterChancePct: 100,
    };
    const state = initialBattleState(defender, ENEMY, "수호자");
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const next = resolveEnemyPhase(state, defender, "수호자", true);

    expect(next.playerHp).toBe(defender.hp);
    expect(next.enemyHp).toBe(ENEMY.hp);
    expect(next.stacks.playerShield).toBeLessThan(200);
    expect(hasReactionLog(next.log)).toBe(false);
  });

  it("PvE에서 보호막을 뚫고 HP 피해가 남으면 반사와 피격 반격이 발동한다", () => {
    const defender: PlayerCombat = {
      ...PLAYER,
      bulwarkShield: 1,
      thornsFlatFromDef: 200,
      runeCounterChancePct: 100,
      passiveCounterChancePct: 100,
    };
    const state = initialBattleState(defender, ENEMY, "수호자");
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const next = resolveEnemyPhase(state, defender, "수호자", true);

    expect(next.playerHp).toBeLessThan(defender.hp);
    expect(next.enemyHp).toBeLessThan(ENEMY.hp);
    expect(hasReactionLog(next.log)).toBe(true);
  });

  it("PvE 몬스터 직접 피해 스킬을 보호막이 전부 흡수하면 피격 반격이 발동하지 않는다", () => {
    const defender: PlayerCombat = {
      ...PLAYER,
      bulwarkShield: 1_000,
      magicBarrierMax: 100,
      magicBarrierAbsorbPct: 50,
      magicBarrierEfficiencyPct: 20,
      passiveCounterChancePct: 100,
    };
    const skillEnemy: Monster = {
      ...ENEMY,
      v2Skills: {
        learned: ["mob_crushing_blow"],
        equipped: ["mob_crushing_blow"],
      },
      v2MaxMp: 30,
    };
    const state = initialBattleState(defender, skillEnemy, "수호자");
    vi.spyOn(Math, "random").mockReturnValue(0.1);

    const next = applyEnemyV2SkillCast(state, defender).state;

    expect(next.playerHp).toBe(defender.hp);
    expect(next.stacks.playerShield).toBeLessThan(1_000);
    expect(next.playerMagicBarrier).toBeLessThan(100);
    expect(hasReactionLog(next.log)).toBe(false);
  });

  it("철벽 반사와 충격은 PvE 일반 보호막이 직접 공격을 전부 흡수해도 발동한다", () => {
    const defender: PlayerCombat = {
      ...PLAYER,
      def: 100,
      bulwarkShield: 1_000,
      fortressImpactOnHit: true,
    };
    const initial = initialBattleState(defender, ENEMY, "성채기사");
    const state = {
      ...initial,
      stacks: { ...initial.stacks, ironWallReflectCharges: 1 },
    };

    const next = resolveEnemyPhase(state, defender, "성채기사", true);

    expect(next.playerHp).toBe(defender.hp);
    expect(next.enemyHp).toBeLessThan(ENEMY.hp);
    expect(next.stacks.ironWallReflectCharges).toBe(0);
    expect(next.stacks.fortressImpact).toBe(1);
    expect(next.log.some((entry) => entry.text.includes("[철벽 반사]"))).toBe(true);
  });

  it("철벽 반사와 충격은 PvE 몬스터 스킬을 보호막이 전부 흡수해도 발동한다", () => {
    const defender: PlayerCombat = {
      ...PLAYER,
      def: 100,
      bulwarkShield: 1_000,
      fortressImpactOnHit: true,
    };
    const skillEnemy: Monster = {
      ...ENEMY,
      v2Skills: {
        learned: ["mob_crushing_blow"],
        equipped: ["mob_crushing_blow"],
      },
      v2MaxMp: 30,
    };
    const initial = initialBattleState(defender, skillEnemy, "성채기사");
    const state = {
      ...initial,
      stacks: { ...initial.stacks, ironWallReflectCharges: 1 },
    };
    vi.spyOn(Math, "random").mockReturnValue(0.1);

    const next = applyEnemyV2SkillCast(state, defender).state;

    expect(next.playerHp).toBe(defender.hp);
    expect(next.enemyHp).toBeLessThan(skillEnemy.hp);
    expect(next.stacks.ironWallReflectCharges).toBe(0);
    expect(next.stacks.fortressImpact).toBe(1);
    expect(next.log.some((entry) => entry.text.includes("[철벽 반사]"))).toBe(true);
  });

  it("PvP 기본 공격을 보호막이 전부 흡수하면 반사와 피격 반격이 발동하지 않는다", () => {
    const defender: PlayerCombat = {
      ...PLAYER,
      thornsFlatFromDef: 200,
      magicBarrierMax: 100,
      magicBarrierPvpAbsorbPct: 25,
      magicBarrierPvpEfficiencyPct: 20,
      runeCounterChancePct: 100,
      passiveCounterChancePct: 100,
    };
    const initial = initialBattleStatePvP(
      PLAYER,
      defender,
      "공격자",
      "수호자",
    );
    const shielded = {
      ...initial,
      p2: {
        ...initial.p2,
        stacks: { ...initial.p2.stacks, playerShield: 200 },
      },
    };
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const next = advanceTurnPvP(shielded, { kind: "attack" });

    expect(next.p2.hp).toBe(defender.hp);
    expect(next.p1.hp).toBe(PLAYER.hp);
    expect(next.p2.stacks.playerShield).toBeLessThan(200);
    expect(hasReactionLog(next.log)).toBe(false);
  });

  it("철벽 반사와 충격은 PvP 보호막이 직접 공격을 전부 흡수해도 발동한다", () => {
    const defender: PlayerCombat = {
      ...PLAYER,
      def: 100,
      fortressImpactOnHit: true,
    };
    const initial = initialBattleStatePvP(
      PLAYER,
      defender,
      "공격자",
      "성채기사",
    );
    const shielded = {
      ...initial,
      p2: {
        ...initial.p2,
        stacks: {
          ...initial.p2.stacks,
          playerShield: 1_000,
          ironWallReflectCharges: 1,
        },
      },
    };
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const next = advanceTurnPvP(shielded, { kind: "attack" });

    expect(next.p2.hp).toBe(defender.hp);
    expect(next.p1.hp).toBeLessThan(PLAYER.hp);
    expect(next.p2.stacks.ironWallReflectCharges).toBe(0);
    expect(next.p2.stacks.fortressImpact).toBe(1);
    expect(next.log.some((entry) => entry.text.includes("[철벽 반사]"))).toBe(
      true,
    );
  });

  it("PvP 직접 피해 스킬도 보호막에 전부 막히면 반사를 발동하지 않는다", () => {
    const defender: PlayerCombat = {
      ...PLAYER,
      thornsFlatFromDef: 200,
    };
    const initial = initialBattleStatePvP(
      PLAYER,
      defender,
      "공격자",
      "수호자",
      STRIKE_SKILL,
      EMPTY_SKILLS,
    );
    const shielded = {
      ...initial,
      p2: {
        ...initial.p2,
        stacks: { ...initial.p2.stacks, playerShield: 1_000 },
      },
    };
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const next = castV2SkillOnAttackerTurnPvP(shielded, "p1").state;

    expect(next.p2.hp).toBe(defender.hp);
    expect(next.p1.hp).toBe(PLAYER.hp);
    expect(next.p2.stacks.playerShield).toBeLessThan(1_000);
    expect(next.p2.magicBarrier).toBeLessThan(100);
    expect(hasReactionLog(next.log)).toBe(false);
    expect(
      next.log.some(
        (entry) => entry.text.includes("강타!") && entry.text.includes("0 피해"),
      ),
    ).toBe(true);
  });
});

describe("마나 실드 직접 피해 순서", () => {
  it("PvE 평타를 방어 전에 나눠 몸통만 방어하고 HP행 피해에 일반 보호막을 적용한다", () => {
    const defender: PlayerCombat = {
      ...PLAYER,
      hp: 5_000,
      maxHp: 5_000,
      def: 500,
      bulwarkShield: 100,
      magicBarrierMax: 1_500,
      magicBarrierAbsorbPct: 25,
      magicBarrierEfficiencyPct: 20,
    };
    const attacker: Monster = { ...ENEMY, atk: 1_000 };
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const initial = initialBattleState(defender, attacker, "마도사");
    const next = resolveEnemyPhase(initial, defender, "마도사", true);

    expect(next.stacks.playerShield).toBe(0);
    expect(next.playerMagicBarrier).toBe(1_300);
    expect(next.playerHp).toBe(4_669);
    expect(next.log.some((entry) => entry.text.includes("[철벽]"))).toBe(true);
    expect(
      next.log.some(
        (entry) =>
          entry.text ===
          "[마나 실드] 피해 250 차단 · 내구도 200 소모 (남은 1,300)",
      ),
    ).toBe(true);
  });

  it("PvP에서는 별도 PvP 흡수율로 평타 일부를 흡수한다", () => {
    const defender: PlayerCombat = {
      ...PLAYER,
      hp: 5_000,
      maxHp: 5_000,
      magicBarrierMax: 1_500,
      magicBarrierPvpAbsorbPct: 25,
      magicBarrierPvpEfficiencyPct: 20,
    };
    const attacker = { ...PLAYER, atk: 1_000 };
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const initial = initialBattleStatePvP(attacker, defender, "공격자", "마도사");
    const next = advanceTurnPvP(initial, { kind: "attack" });

    expect(next.p2.magicBarrier).toBe(1_300);
    expect(next.p2.hp).toBe(4_250);
    expect(
      next.log.some((entry) => entry.text.includes("피해 250 차단")),
    ).toBe(true);
  });

  it("PvP 고정 추가 피해는 마나 실드를 건너뛴다", () => {
    const attacker: PlayerCombat = {
      ...PLAYER,
      atk: 1,
      heavenDecreeChancePct: 100,
    };
    const defender: PlayerCombat = {
      ...PLAYER,
      hp: 5_000,
      maxHp: 5_000,
      magicBarrierMax: 1_000,
      magicBarrierPvpAbsorbPct: 100,
      magicBarrierPvpEfficiencyPct: 0,
    };
    vi.spyOn(Math, "random").mockReturnValue(0);

    const next = advanceTurnPvP(
      initialBattleStatePvP(attacker, defender, "공격자", "마도사"),
      { kind: "attack" },
    );

    expect(next.p2.magicBarrier).toBe(999);
    expect(next.p2.hp).toBe(4_750);
  });
});

describe("마나 실드 상태 피해", () => {
  it("한기 피해의 몸통 채널만 부분 방어하고 일반 보호막은 건드리지 않는다", () => {
    const defender: PlayerCombat = {
      ...PLAYER,
      hp: 5_000,
      maxHp: 5_000,
      def: 500,
      bulwarkShield: 100,
      magicBarrierMax: 1_500,
      magicBarrierAbsorbPct: 25,
      magicBarrierEfficiencyPct: 20,
    };
    const chillEnemy: Monster = {
      ...ENEMY,
      atk: 0,
      skill: {
        kind: "chill",
        name: "시험 한기",
        perHit: 0,
        dmgPerStack: 250,
        threshold: 4,
        defMitigationFraction: 0.3,
      },
    };
    const initial = initialBattleState(defender, chillEnemy, "마도사");
    const chilled = {
      ...initial,
      stacks: { ...initial.stacks, chillStacks: 4 },
    };

    const next = resolveEnemyPhase(chilled, defender, "마도사", true);

    // 원량 1,000 -> 마나 250(내구도 200), 몸통 750 - DEF 150 = HP 600.
    expect(next.playerHp).toBe(4_400);
    expect(next.playerMagicBarrier).toBe(1_300);
    expect(next.stacks.playerShield).toBe(100);
  });
});

describe("PvP 마나 실드 간접 피해", () => {
  it("DoT는 마나 실드를 소모하지만 일반 보호막은 무시한다", () => {
    const target = {
      ...PLAYER,
      hp: 5_000,
      maxHp: 5_000,
      magicBarrierMax: 1_500,
      magicBarrierPvpAbsorbPct: 25,
      magicBarrierPvpEfficiencyPct: 20,
    };
    const initial = initialBattleStatePvP(PLAYER, target, "공격자", "마도사");
    const dotted = {
      ...initial,
      p2: {
        ...initial.p2,
        v2Dots: [{
          tag: "bleed" as const,
          label: "출혈",
          stacks: 1,
          maxStacks: 10,
          turns: 1,
          flatPerStack: 1_000,
          atkCoefPerStack: 0,
          pctMaxHpPerStack: 0,
          sourceAtk: 0,
        }],
        stacks: { ...initial.p2.stacks, playerShield: 100 },
      },
    };

    const next = tickPvPSideDotsOnAction(dotted, "p2");

    expect(next.p2.hp).toBe(4_250);
    expect(next.p2.magicBarrier).toBe(1_300);
    expect(next.p2.stacks.playerShield).toBe(100);
  });

  it("반사 피해는 공격자의 마나 실드를 소모하지만 일반 보호막은 무시한다", () => {
    const attacker = {
      ...PLAYER,
      hp: 5_000,
      maxHp: 5_000,
      magicBarrierMax: 1_500,
      magicBarrierPvpAbsorbPct: 25,
      magicBarrierPvpEfficiencyPct: 20,
    };
    const reflector = { ...PLAYER, thornsFlatFromDef: 1_000 };
    const initial = initialBattleStatePvP(attacker, reflector, "공격자", "반사자");
    const shielded = {
      ...initial,
      p1: {
        ...initial.p1,
        stacks: { ...initial.p1.stacks, playerShield: 100 },
      },
    };

    const next = applyOnHitReflect(shielded, "p1", "p2", 1_000).state;

    expect(next.p1.magicBarrier).toBeLessThan(1_500);
    expect(next.p1.stacks.playerShield).toBeLessThan(100);
    expect(next.p1.hp).toBeLessThan(5_000);
  });
});
