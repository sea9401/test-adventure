import { afterEach, describe, expect, it, vi } from "vitest";

import type { Monster } from "@/adventure/data/monsters";
import type { V2SkillsState } from "@/adventure/data/v2/v2Skills";
import {
  castV2SkillOnAttackerTurnPvP,
  initialBattleStatePvP,
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
    expect(hasReactionLog(next.log)).toBe(false);
  });

  it("PvP 기본 공격을 보호막이 전부 흡수하면 반사와 피격 반격이 발동하지 않는다", () => {
    const defender: PlayerCombat = {
      ...PLAYER,
      thornsFlatFromDef: 200,
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
    expect(hasReactionLog(next.log)).toBe(false);
    expect(
      next.log.some(
        (entry) => entry.text.includes("강타!") && entry.text.includes("0 피해"),
      ),
    ).toBe(true);
  });
});

describe("마력 장벽 직접 피해 순서", () => {
  it("일반 보호막이 먼저 소모된 뒤 남은 평타 일부를 별도 내구도로 흡수한다", () => {
    const defender: PlayerCombat = {
      ...PLAYER,
      bulwarkShield: 10,
      magicBarrierMax: 100,
      magicBarrierAbsorbPct: 50,
    };
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const initial = initialBattleState(defender, ENEMY, "마도사");
    const next = resolveEnemyPhase(initial, defender, "마도사", true);

    expect(next.stacks.playerShield).toBe(0);
    expect(next.playerMagicBarrier).toBeLessThan(100);
    expect(next.playerHp).toBeLessThan(defender.hp);
    expect(next.log.some((entry) => entry.text.includes("[철벽]"))).toBe(true);
    expect(next.log.some((entry) => entry.text.includes("[마력 장벽]"))).toBe(true);
  });

  it("PvP에서는 별도 PvP 흡수율로 평타 일부를 흡수한다", () => {
    const defender: PlayerCombat = {
      ...PLAYER,
      magicBarrierMax: 100,
      magicBarrierPvpAbsorbPct: 25,
    };
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const initial = initialBattleStatePvP(PLAYER, defender, "공격자", "마도사");
    const next = advanceTurnPvP(initial, { kind: "attack" });

    expect(next.p2.magicBarrier).toBeLessThan(100);
    expect(next.p2.hp).toBeLessThan(defender.hp);
    expect(next.log.some((entry) => entry.text.includes("[마력 장벽]"))).toBe(true);
  });
});
