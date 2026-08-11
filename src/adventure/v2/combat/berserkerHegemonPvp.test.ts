import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerCombat } from "./engine";
import {
  advanceTurnPvP,
  applyOnHitReflect,
  applyPerAttackDodge,
  castV2SkillOnAttackerTurnPvP,
  initialBattleStatePvP,
  maybeApplyRuneCounter,
  tickPvPSideDotsOnAction,
} from "./engine-pvp";
import { makePoisonDot } from "./combatShared";

afterEach(() => vi.restoreAllMocks());

const base: PlayerCombat = {
  hp: 1_000,
  maxHp: 1_000,
  maxMp: 99_999,
  mp: 99_999,
  atk: 100,
  strStat: 100,
  def: 0,
  spd: 100,
  evasionPct: 0,
  evaRating: 0,
  accuracyPct: 100,
  accRating: 100,
  attackCount: 1,
  critChancePct: 0,
};

const lineage = [
  "v2c_berserker_bloodslash",
  "v2c_warlord_bloodbath",
  "v2c_overlord_ruin",
  "v2c_hegemon_annihilation",
] as const;

describe("광전사–패황 PvP 통합", () => {
  it("혈전 준비를 다음 필살기에 소비하고 확정 치명타를 적용한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const hegemon: PlayerCombat = {
      ...base,
      hp: 700,
      berserkerMadnessRank: 2,
    };
    const target: PlayerCombat = { ...base, hp: 100_000, maxHp: 100_000 };
    let state = initialBattleStatePvP(
      hegemon,
      target,
      "패황",
      "표적",
      { learned: [...lineage], equipped: ["v2c_warlord_bloodbath"] },
    );

    state = castV2SkillOnAttackerTurnPvP(state, "p1").state;
    expect(state.p1.hp).toBe(595);
    expect(state.p1.berserker?.finisherReady).toBe(true);

    state = {
      ...state,
      p1: {
        ...state.p1,
        hp: 500,
        v2Skills: {
          learned: [...lineage],
          equipped: ["v2c_overlord_ruin"],
        },
      },
    };
    state = castV2SkillOnAttackerTurnPvP(state, "p1").state;

    expect(state.p1.berserker?.finisherReady).toBe(false);
    expect(
      state.log.some(
        (entry) => entry.text.includes("파멸일격") && entry.text.includes("[치명타]"),
      ),
    ).toBe(true);
  });

  it("직접 스킬 치명상은 사망 극복 후 일반 불굴로 넘기지 않는다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const attacker: PlayerCombat = { ...base, atk: 5_000, strStat: 5_000 };
    const throne: PlayerCombat = {
      ...base,
      hp: 100,
      berserkerMadnessRank: 3,
      enduranceActive: true,
    };
    const state = initialBattleStatePvP(
      attacker,
      throne,
      "공격자",
      "광기의 왕좌",
      { learned: ["v2c_berserker_bloodslash"], equipped: ["v2c_berserker_bloodslash"] },
    );

    const next = castV2SkillOnAttackerTurnPvP(state, "p1").state;

    expect(next.p2.hp).toBe(400);
    expect(next.p2.flags.enduranceTriggered).toBe(false);
    expect(next.p2.berserker).toMatchObject({
      deathOvercomeUsed: true,
      guardUntil: "none",
    });
    expect(next.phase).not.toBe("ended");
  });

  it("혈전 준비는 필살기가 회피되어도 그 시전에서 소비한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const hegemon: PlayerCombat = {
      ...base,
      hp: 500,
      berserkerMadnessRank: 2,
    };
    let state = initialBattleStatePvP(
      hegemon,
      base,
      "패황",
      "회피자",
      { learned: ["v2c_overlord_ruin"], equipped: ["v2c_overlord_ruin"] },
    );
    state = {
      ...state,
      p1: {
        ...state.p1,
        berserker: { ...state.p1.berserker!, finisherReady: true },
      },
      p2: {
        ...state.p2,
        stacks: { ...state.p2.stacks, evadesRemaining: 1 },
      },
    };
    const targetHp = state.p2.hp;

    const cast = castV2SkillOnAttackerTurnPvP(state, "p1");

    expect(cast.castFired).toBe(true);
    expect(cast.state.p1.berserker?.finisherReady).toBe(false);
    expect(cast.state.p2.hp).toBe(targetHp);
  });

  it("혈전 자체가 확정 회피되면 HP 비용과 필살 준비를 모두 취소한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const hegemon: PlayerCombat = {
      ...base,
      hp: 700,
      berserkerMadnessRank: 2,
    };
    let state = initialBattleStatePvP(
      hegemon,
      base,
      "패황",
      "회피자",
      { learned: ["v2c_warlord_bloodbath"], equipped: ["v2c_warlord_bloodbath"] },
    );
    state = {
      ...state,
      p2: {
        ...state.p2,
        stacks: { ...state.p2.stacks, evadesRemaining: 1 },
      },
    };

    const cast = castV2SkillOnAttackerTurnPvP(state, "p1");

    expect(cast.castFired).toBe(true);
    expect(cast.state.p1.hp).toBe(700);
    expect(cast.state.p1.berserker?.finisherReady).toBe(false);
    expect(cast.state.log.some((entry) => entry.text.includes("[혈전]"))).toBe(false);
  });

  it("사망 극복 뒤 멸왕일도는 발동을 보장하고 강화 준비와 재충전 1회를 소비한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const hegemon: PlayerCombat = {
      ...base,
      hp: 400,
      berserkerMadnessRank: 4,
    };
    let state = initialBattleStatePvP(
      hegemon,
      { ...base, hp: 100_000, maxHp: 100_000, thornsPct: 1_000 },
      "패황",
      "표적",
      {
        learned: ["v2c_hegemon_annihilation"],
        equipped: ["v2c_hegemon_annihilation"],
      },
    );
    state = {
      ...state,
      p1: {
        ...state.p1,
        berserker: {
          ...state.p1.berserker!,
          deathOvercomeUsed: true,
          deathDamageReady: true,
          hpFloor: 400,
          guardUntil: "player_attack_end",
          annihilationUsesRemaining: 2,
        },
      },
    };

    const cast = castV2SkillOnAttackerTurnPvP(state, "p1");

    expect(cast.castFired).toBe(true);
    expect(cast.state.p1.berserker).toMatchObject({
      deathDamageReady: false,
      guardUntil: "none",
      annihilationUsesRemaining: 1,
    });
    expect(cast.state.p1.hp).toBe(400);
    expect(cast.state.phase).not.toBe("ended");
    expect(cast.state.log.some((entry) => entry.text.includes("[패황의 지배]"))).toBe(true);
  });

  it("반사 치명상도 사망 극복하고 패황의 다음 공격 준비를 남긴다", () => {
    const hegemon: PlayerCombat = {
      ...base,
      hp: 50,
      berserkerMadnessRank: 4,
    };
    const reflector: PlayerCombat = { ...base, thornsPct: 200 };
    const state = initialBattleStatePvP(hegemon, reflector, "패황", "반사자");

    const reflected = applyOnHitReflect(state, "p1", "p2", 100);

    expect(reflected.attackerKilled).toBe(false);
    expect(reflected.state.p1.hp).toBe(400);
    expect(reflected.state.p1.berserker).toMatchObject({
      deathOvercomeUsed: true,
      deathDamageReady: true,
      guardUntil: "player_attack_end",
      annihilationUsesRemaining: 2,
    });
    expect(reflected.state.phase).not.toBe("ended");
  });

  it("회피 반사와 반격 치명상도 같은 사망 극복 관문을 사용한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const throne: PlayerCombat = {
      ...base,
      hp: 50,
      berserkerMadnessRank: 3,
    };
    const dodgeReflector: PlayerCombat = {
      ...base,
      infiniteThornsAtkPct: 200,
    };
    let state = initialBattleStatePvP(throne, dodgeReflector, "광기의 왕좌", "회피자");

    state = applyPerAttackDodge(
      state,
      "p1",
      "p2",
      "회피",
      false,
    );
    expect(state.p1.hp).toBe(400);
    expect(state.p1.berserker?.deathOvercomeUsed).toBe(true);
    expect(state.phase).not.toBe("ended");

    const secondThrone: PlayerCombat = {
      ...throne,
      hp: 50,
    };
    const counter: PlayerCombat = {
      ...base,
      atk: 1_000,
      runeCounterChancePct: 100,
    };
    state = initialBattleStatePvP(secondThrone, counter, "광기의 왕좌", "반격자");

    const countered = maybeApplyRuneCounter(state, "p1", "p2");
    expect(countered.attackerKilled).toBe(false);
    expect(countered.state.p1.hp).toBe(400);
    expect(countered.state.p1.berserker?.deathOvercomeUsed).toBe(true);
  });

  it("평타 치명상 뒤 다음 자기 공격까지 보호하고 공격이 끝나면 해제한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const attacker: PlayerCombat = { ...base, atk: 5_000 };
    const hegemon: PlayerCombat = {
      ...base,
      hp: 100,
      spd: 1,
      berserkerMadnessRank: 4,
      enduranceActive: true,
    };
    let state = initialBattleStatePvP(attacker, hegemon, "공격자", "패황");

    state = advanceTurnPvP(state, { kind: "attack" });
    expect(state.p2.hp).toBe(400);
    expect(state.p2.flags.enduranceTriggered).toBe(false);
    expect(state.p2.berserker).toMatchObject({
      deathDamageReady: true,
      guardUntil: "player_attack_end",
    });

    state = advanceTurnPvP(state, { kind: "attack" });
    expect(state.p2.berserker).toMatchObject({
      deathDamageReady: false,
      guardUntil: "none",
    });
  });

  it("패황의 다음 기본 공격이 확정 회피되어도 강화와 보호를 종료한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const hegemon: PlayerCombat = {
      ...base,
      hp: 400,
      berserkerMadnessRank: 4,
    };
    const evader: PlayerCombat = { ...base, spd: 1, guaranteedEvades: 1 };
    let state = initialBattleStatePvP(hegemon, evader, "패황", "회피자");
    state = {
      ...state,
      p1: {
        ...state.p1,
        berserker: {
          ...state.p1.berserker!,
          deathOvercomeUsed: true,
          deathDamageReady: true,
          hpFloor: 400,
          guardUntil: "player_attack_end",
          annihilationUsesRemaining: 2,
        },
      },
    };

    state = advanceTurnPvP(state, { kind: "attack" });

    expect(state.p1.berserker).toMatchObject({
      deathDamageReady: false,
      guardUntil: "none",
    });
  });

  it("같은 공격의 반사 뒤 이어지는 룬 반격까지 3단계 HP 하한을 유지한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const throne: PlayerCombat = {
      ...base,
      hp: 50,
      berserkerMadnessRank: 3,
    };
    const reactor: PlayerCombat = {
      ...base,
      hp: 10_000,
      maxHp: 10_000,
      spd: 1,
      atk: 1_000,
      thornsPct: 200,
      runeCounterChancePct: 100,
    };
    let state = initialBattleStatePvP(throne, reactor, "광기의 왕좌", "반격자");

    state = advanceTurnPvP(state, { kind: "attack" });

    expect(state.p1.hp).toBe(400);
    expect(state.p1.berserker).toMatchObject({
      deathOvercomeUsed: true,
      guardUntil: "none",
    });
    expect(state.phase).not.toBe("ended");
  });

  it("지속 피해 치명상도 사망 극복 대상으로 처리한다", () => {
    const throne: PlayerCombat = {
      ...base,
      hp: 100,
      berserkerMadnessRank: 3,
      enduranceActive: true,
    };
    let state = initialBattleStatePvP(base, throne, "공격자", "광기의 왕좌");
    state = {
      ...state,
      p2: {
        ...state.p2,
        v2Dots: [
          makePoisonDot({
            stacks: 1,
            pctMaxHpPerStack: 100,
            sourceAtk: 1_000,
          }),
        ],
      },
    };

    state = tickPvPSideDotsOnAction(state, "p2");

    expect(state.p2.hp).toBe(400);
    expect(state.p2.flags.enduranceTriggered).toBe(false);
    expect(state.p2.berserker).toMatchObject({
      deathOvercomeUsed: true,
      guardUntil: "none",
    });
    expect(state.phase).not.toBe("ended");
  });
});
