import { afterEach, describe, expect, it, vi } from "vitest";
import type { Monster } from "@/adventure/data/monsters";
import type { V2SkillId, V2SkillsState } from "@/adventure/data/v2/v2Skills";
import {
  removeMissedV2SkillTargetEffects,
  resolveV2SkillCast,
} from "./combatShared";
import {
  applyPlayerV2SkillCast,
  initialBattleState,
  type PlayerCombat,
} from "./engine";
import {
  castV2SkillOnAttackerTurnPvP,
  initialBattleStatePvP,
  pvpSideDamageTakenReductionPct,
} from "./engine-pvp";
import { effectivePlayerSpd } from "./engine.atb";
import { reduceIncomingEnemySkillDamage } from "./engine.enemySkills";
import { resolveEnemyPhase } from "./engine.enemyPhase";
import { effectiveSideSpd } from "./engine.pvp-atb";

const PLAYER: PlayerCombat = {
  hp: 10_000,
  maxHp: 10_000,
  mp: 1_000,
  maxMp: 1_000,
  atk: 100,
  magicAtk: 100,
  def: 100,
  vitStat: 100,
  spd: 50,
  evasionPct: 0,
  accuracyPct: 100,
  attackCount: 1,
};

const ENEMY: Monster = {
  name: "훈련 표적",
  tags: [],
  hp: 100_000,
  atk: 1,
  def: 0,
  spd: 1,
  exp: 0,
};

const loadout = (...ids: V2SkillId[]): V2SkillsState => ({
  learned: ids,
  equipped: ids,
});

afterEach(() => vi.restoreAllMocks());

function pveState(weight: number, skills: V2SkillsState, enemy = ENEMY) {
  const initial = initialBattleState(PLAYER, enemy, "수집가", skills);
  return { ...initial, stacks: { ...initial.stacks, mutationWeight: weight } };
}

function pvpState(weight: number, p1Skills: V2SkillsState) {
  const initial = initialBattleStatePvP(
    PLAYER,
    PLAYER,
    "P1",
    "P2",
    p1Skills,
    { learned: [], equipped: [] },
  );
  return {
    ...initial,
    p1: { ...initial.p1, stacks: { ...initial.p1.stacks, mutationWeight: weight } },
  };
}

describe("강철 골격 SPD 완화", () => {
  it("PvE에서 장착 시에만 중량당 SPD 감소가 3%가 된다", () => {
    expect(effectivePlayerSpd(PLAYER, pveState(3, loadout()))).toBe(42.5);
    expect(
      effectivePlayerSpd(PLAYER, pveState(3, loadout("v2c_irongolem_ironframe"))),
    ).toBeCloseTo(45.5, 10);
    expect(
      effectivePlayerSpd(PLAYER, pveState(0, loadout("v2c_irongolem_ironframe"))),
    ).toBe(50);
  });

  it("PvP에서도 같은 완화를 적용한다", () => {
    expect(effectiveSideSpd(pvpState(3, loadout()), "p1")).toBe(42.5);
    expect(
      effectiveSideSpd(pvpState(3, loadout("v2c_irongolem_ironframe")), "p1"),
    ).toBeCloseTo(45.5, 10);
    expect(
      effectiveSideSpd(pvpState(0, loadout("v2c_irongolem_ironframe")), "p1"),
    ).toBe(50);
  });
});

describe("대지의 정점 받는 직접 피해 감소", () => {
  const apex = loadout("v2c_primevalgolem_apex");

  it("PvE 적 기본 공격 피해를 중량 3에서만 8% 줄인다", () => {
    const enemy = { ...ENEMY, atk: 2_000, spd: 99 };
    const taken = (weight: number, skills: V2SkillsState) =>
      PLAYER.hp -
      resolveEnemyPhase(pveState(weight, skills, enemy), PLAYER, "P1", true)
        .playerHp;
    const plain3 = taken(3, loadout());
    expect(taken(3, apex) / plain3).toBeCloseTo(0.92, 1);
    expect(taken(3, apex)).toBeLessThan(plain3);
    expect(taken(2, apex)).toBe(taken(2, loadout()));
  });

  it("PvE 적 스킬 피해를 중량 3에서만 8% 줄인다", () => {
    const reduce = (weight: number, skills: V2SkillsState) =>
      reduceIncomingEnemySkillDamage(pveState(weight, skills), PLAYER, {
        enemyDamage: 1_000,
        magicEnemyDamage: 0,
      }).damage;
    expect(reduce(3, apex)).toBe(Math.floor(reduce(3, loadout()) * 0.92));
    expect(reduce(2, apex)).toBe(reduce(2, loadout()));
  });

  it("PvP는 방어하는 쪽의 장착과 중량만 본다", () => {
    const state = pvpState(3, apex);
    expect(pvpSideDamageTakenReductionPct(state.p1)).toBe(
      pvpSideDamageTakenReductionPct(pvpState(3, loadout()).p1) + 8,
    );
    expect(pvpSideDamageTakenReductionPct(pvpState(2, apex).p1)).toBe(
      pvpSideDamageTakenReductionPct(pvpState(2, loadout()).p1),
    );
    expect(pvpSideDamageTakenReductionPct(state.p2)).toBe(
      pvpSideDamageTakenReductionPct(pvpState(3, loadout()).p2),
    );
  });
});

describe("해방 빗나감", () => {
  it("빗나가도 중량 소모·보호막·가속은 남고 지연·회복은 사라진다", () => {
    const equipped: V2SkillId[] = [
      "v2c_mountaingolem_landslide",
      "v2c_rockgiant_rampart",
      "v2c_rockbrawler_unburden",
    ];
    const hit = resolveV2SkillCast({
      skills: { learned: equipped, equipped },
      cooldowns: {},
      procRoll: 0,
      attacker: {
        mp: 999, atk: 100, def: 100, vit: 100, maxHp: 1_000, currentHp: 1_000,
        maxMp: 999, mutationWeight: 3, selfBuffs: {}, selfDebuffs: {},
      },
      target: { def: 0, maxHp: 10_000, currentHp: 10_000, selfBuffs: {}, selfDebuffs: {} },
    });
    expect(hit.healFromActualDamagePct).toBe(14);
    const missed = removeMissedV2SkillTargetEffects(hit);
    expect(missed.mutationTransition.weightAfter).toBe(0);
    expect(missed.shieldToApply?.hp).toBe(90);
    expect(missed.selfHasteToApply?.pct).toBe(15);
    expect(missed.healFromActualDamagePct).toBe(0);
    expect(missed.enemyDelayToApply).toBeUndefined();
  });
});

describe("중량 순환 전투 로그", () => {
  const logs = (id: V2SkillId, weight: number, passives: V2SkillId[] = []) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    return applyPlayerV2SkillCast(pveState(weight, loadout(id, ...passives)), PLAYER, {
      selfBuffs: {},
      selfDebuffs: {},
      enemyDebuffs: {},
    }).state.log.map((entry) => entry.text);
  };

  it("PvE 해방 로그를 순서대로 남긴다", () => {
    const texts = logs("v2c_rockgiant_bedrockslam", 3, [
      "v2c_rockbrawler_unburden",
      "v2c_rockgiant_rampart",
      "v2c_mountaingolem_mountainbody",
    ]);
    const expected = [
      "[암반 내려찍기] 중량 3 소모",
      "[짐 벗기] 다음 행동 15% 가속",
      "[암벽 갑주] 보호막 +9%",
      "[산맥의 몸] 중량 +1 (1/3)",
    ];
    const indexes = expected.map((text) => texts.indexOf(text));
    expect(indexes.every((index) => index >= 0)).toBe(true);
    expect([...indexes].sort((a, b) => a - b)).toEqual(indexes);
  });

  it("PvE 과적 타격 로그를 남긴다", () => {
    expect(logs("v2c_irongolem_ironhammer", 3)).toContain("[강철 망치] 과적 타격");
    expect(logs("v2c_irongolem_ironhammer", 2)).not.toContain("[강철 망치] 과적 타격");
  });

  it("PvP도 같은 해방 로그를 남긴다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = pvpState(
      3,
      loadout("v2c_rockgiant_bedrockslam", "v2c_rockbrawler_unburden"),
    );
    const texts = castV2SkillOnAttackerTurnPvP(state, "p1").state.log.map(
      (entry) => entry.text,
    );
    expect(texts).toContain("[암반 내려찍기] 중량 3 소모");
    expect(texts).toContain("[짐 벗기] 다음 행동 15% 가속");
  });
});
