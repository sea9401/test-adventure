import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ARENA_DAMAGE_MULTIPLIER,
  ARENA_SUSTAIN_MULTIPLIER,
} from "@/lib/server/arena";
import type { V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { makeBleedDot } from "./combatShared";
import {
  applyOnHitReflect,
  applyPerAttackDodge,
  castV2SkillOnAttackerTurnPvP,
  endAttackerPhase,
  initialBattleStatePvP,
  maybeApplyMartialCounter,
  maybeApplyRuneCounter,
} from "./engine-pvp";
import { advanceTurnPvP } from "./engine.pvpPhase";
import type { PlayerCombat } from "./engine";

const BASE: PlayerCombat = {
  hp: 1_000,
  maxHp: 1_000,
  mp: 1_000,
  maxMp: 1_000,
  atk: 120,
  def: 20,
  spd: 50,
  evasionPct: 0,
  accuracyPct: 100,
  attackCount: 1,
  classTier: 3,
};

const EMPTY_SKILLS: V2SkillsState = { learned: [], equipped: [] };

function stateWith(
  multiplier?: number,
  p1: PlayerCombat = BASE,
  p2: PlayerCombat = BASE,
  sustainMultiplier?: number,
) {
  return initialBattleStatePvP(
    p1,
    p2,
    "P1",
    "P2",
    EMPTY_SKILLS,
    EMPTY_SKILLS,
    multiplier,
    sustainMultiplier,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("PvP 호출 표면별 최종 피해 배율", () => {
  it("아레나 배율은 0.65이고 기본 PvP 상태에는 배율이 주입되지 않는다", () => {
    expect(ARENA_DAMAGE_MULTIPLIER).toBe(0.65);
    expect(ARENA_SUSTAIN_MULTIPLIER).toBe(0.65);
    expect(stateWith().damageMultiplier).toBeUndefined();
    expect(stateWith().sustainMultiplier).toBeUndefined();
    expect(stateWith(ARENA_DAMAGE_MULTIPLIER).damageMultiplier).toBe(0.65);
    expect(
      stateWith(
        ARENA_DAMAGE_MULTIPLIER,
        BASE,
        BASE,
        ARENA_SUSTAIN_MULTIPLIER,
      ).sustainMultiplier,
    ).toBe(0.65);
  });

  it("평타 최종 피해를 35% 줄인다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const normal = advanceTurnPvP(stateWith(), { kind: "attack" });
    const arena = advanceTurnPvP(stateWith(ARENA_DAMAGE_MULTIPLIER), {
      kind: "attack",
    });
    const normalDamage = BASE.hp - normal.p2.hp;
    const arenaDamage = BASE.hp - arena.p2.hp;

    expect(normalDamage).toBeGreaterThan(0);
    expect(arenaDamage).toBe(Math.floor(normalDamage * 0.65));
  });

  it("다단 스킬의 각 타격과 실제 HP 피해를 각각 35% 줄인다", () => {
    const skills: V2SkillsState = {
      learned: ["v2c_warrior_flurry"],
      equipped: ["v2c_warrior_flurry"],
    };
    const makeSkillState = (multiplier?: number) =>
      initialBattleStatePvP(
        BASE,
        { ...BASE, hp: 10_000, maxHp: 10_000 },
        "P1",
        "P2",
        skills,
        EMPTY_SKILLS,
        multiplier,
      );
    vi.spyOn(Math, "random").mockReturnValue(0);
    const normal = castV2SkillOnAttackerTurnPvP(makeSkillState(), "p1").state;
    const arena = castV2SkillOnAttackerTurnPvP(
      makeSkillState(ARENA_DAMAGE_MULTIPLIER),
      "p1",
    ).state;
    const hitDamages = (log: typeof normal.log) =>
      log
        .filter((entry) => entry.kind === "player_attack" && entry.text.includes("난격!"))
        .map((entry) => Number(entry.text.match(/(\d+) 피해/)?.[1] ?? 0));
    const normalHits = hitDamages(normal.log);
    const arenaHits = hitDamages(arena.log);

    expect(normalHits.length).toBeGreaterThan(1);
    expect(arenaHits).toEqual(
      normalHits.map((damage) => Math.max(1, Math.floor(damage * 0.65))),
    );
    expect(10_000 - arena.p2.hp).toBe(
      arenaHits.reduce((sum, damage) => sum + damage, 0),
    );
  });

  it("지속 피해에도 배율을 적용한다", () => {
    const tick = (multiplier?: number) => {
      const initial = stateWith(multiplier);
      const withDot = {
        ...initial,
        p2: {
          ...initial.p2,
          v2Dots: [
            makeBleedDot({ stacks: 1, flatPerStack: 100, sourceAtk: 0 }),
          ],
        },
      };
      return endAttackerPhase(withDot, "p1", "p2");
    };
    const normal = tick();
    const arena = tick(ARENA_DAMAGE_MULTIPLIER);
    const normalDamage = BASE.hp - normal.p2.hp;
    const arenaDamage = BASE.hp - arena.p2.hp;

    expect(normalDamage).toBeGreaterThan(0);
    expect(arenaDamage).toBe(Math.floor(normalDamage * 0.65));
  });

  it("반사와 반격 피해에도 배율을 적용한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const normalReflect = applyOnHitReflect(
      stateWith(undefined, BASE, { ...BASE, thornsPct: 100 }),
      "p1",
      "p2",
      100,
    ).state;
    const arenaReflect = applyOnHitReflect(
      stateWith(ARENA_DAMAGE_MULTIPLIER, BASE, { ...BASE, thornsPct: 100 }),
      "p1",
      "p2",
      100,
    ).state;
    const normalCounter = maybeApplyMartialCounter(
      stateWith(undefined, BASE, { ...BASE, passiveCounterChancePct: 100 }),
      "p1",
      "p2",
    ).state;
    const arenaCounter = maybeApplyMartialCounter(
      stateWith(ARENA_DAMAGE_MULTIPLIER, BASE, {
        ...BASE,
        passiveCounterChancePct: 100,
      }),
      "p1",
      "p2",
    ).state;
    const normalRune = maybeApplyRuneCounter(
      stateWith(undefined, BASE, { ...BASE, runeCounterChancePct: 100 }),
      "p1",
      "p2",
    ).state;
    const arenaRune = maybeApplyRuneCounter(
      stateWith(ARENA_DAMAGE_MULTIPLIER, BASE, {
        ...BASE,
        runeCounterChancePct: 100,
      }),
      "p1",
      "p2",
    ).state;
    const normalDodgeReflect = applyPerAttackDodge(
      stateWith(undefined, BASE, { ...BASE, infiniteThornsAtkPct: 100 }),
      "p1",
      "p2",
      "회피",
      false,
    );
    const arenaDodgeReflect = applyPerAttackDodge(
      stateWith(ARENA_DAMAGE_MULTIPLIER, BASE, {
        ...BASE,
        infiniteThornsAtkPct: 100,
      }),
      "p1",
      "p2",
      "회피",
      false,
    );

    for (const [normal, arena] of [
      [normalReflect, arenaReflect],
      [normalCounter, arenaCounter],
      [normalRune, arenaRune],
      [normalDodgeReflect, arenaDodgeReflect],
    ]) {
      const normalDamage = BASE.hp - normal.p1.hp;
      const arenaDamage = BASE.hp - arena.p1.hp;
      expect(normalDamage).toBeGreaterThan(0);
      expect(arenaDamage).toBe(Math.floor(normalDamage * 0.65));
    }
  });

  it("반사는 방어 감산과 PvP 회피 경감 중 낮은 피해만 적용한다", () => {
    const receiver = { ...BASE, def: 20, evaRating: 300 };
    const reflector = { ...BASE, accRating: 50, thornsPct: 100 };
    const result = applyOnHitReflect(
      stateWith(undefined, receiver, reflector),
      "p1",
      "p2",
      100,
    ).state;

    expect(BASE.hp - result.p1.hp).toBe(43);
  });

  it("반사한 캐릭터의 적중도가 높으면 방어 후보를 선택한다", () => {
    const receiver = { ...BASE, def: 20, evaRating: 300 };
    const reflector = { ...BASE, accRating: 500, thornsPct: 100 };
    const result = applyOnHitReflect(
      stateWith(undefined, receiver, reflector),
      "p1",
      "p2",
      100,
    ).state;

    expect(BASE.hp - result.p1.hp).toBe(80);
  });

  it.each([
    ["가시 갑옷", { bramblePct: 100 }, 43],
    ["수호 반사", { thornsFlatFromDef: 100 }, 43],
    ["무한 가시", { infiniteThornsAtkPct: 100 }, 52],
  ] as const)("%s 피격 반사도 같은 경감 공식을 사용한다", (_label, reflect, damage) => {
    const result = applyOnHitReflect(
      stateWith(
        undefined,
        { ...BASE, def: 20, evaRating: 300 },
        { ...BASE, accRating: 50, ...reflect },
      ),
      "p1",
      "p2",
      100,
    ).state;

    expect(BASE.hp - result.p1.hp).toBe(damage);
  });

  it("회피 시 발생하는 무한 가시 반사도 같은 경감 공식을 사용한다", () => {
    const result = applyPerAttackDodge(
      stateWith(
        undefined,
        { ...BASE, def: 20, evaRating: 300 },
        { ...BASE, accRating: 50, infiniteThornsAtkPct: 100 },
      ),
      "p1",
      "p2",
      "회피",
      false,
    );

    expect(result.p1.hp).toBe(948);
  });

  it("반사 회피도 같은 경감 공식을 사용한다", () => {
    const result = applyPerAttackDodge(
      stateWith(
        undefined,
        { ...BASE, def: 20, evaRating: 300 },
        { ...BASE, accRating: 50, reflexEvadeMult: 1 },
      ),
      "p1",
      "p2",
      "회피",
      false,
    );

    expect(result.p1.hp).toBe(957);
  });

  it("회피 경감은 일반 반격과 반격의 룬 피해를 줄이지 않는다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const recipient = { ...BASE, evaRating: 10_000 };
    const normal = stateWith(undefined, BASE, {
      ...BASE,
      passiveCounterChancePct: 100,
      runeCounterChancePct: 100,
    });
    const evasive = stateWith(undefined, recipient, {
      ...BASE,
      passiveCounterChancePct: 100,
      runeCounterChancePct: 100,
    });

    const normalMartial = maybeApplyMartialCounter(normal, "p1", "p2").state;
    const evasiveMartial = maybeApplyMartialCounter(evasive, "p1", "p2").state;
    const normalRune = maybeApplyRuneCounter(normal, "p1", "p2").state;
    const evasiveRune = maybeApplyRuneCounter(evasive, "p1", "p2").state;

    expect(BASE.hp - evasiveMartial.p1.hp).toBe(BASE.hp - normalMartial.p1.hp);
    expect(BASE.hp - evasiveRune.p1.hp).toBe(BASE.hp - normalRune.p1.hp);
  });

  it("장비 방어 관통은 일반 공격뿐 아니라 물리 스킬의 대상 방어력에도 적용된다", () => {
    const skills: V2SkillsState = {
      learned: ["v2_skill_strike"],
      equipped: ["v2_skill_strike"],
    };
    const attacker = {
      ...BASE,
      // 기존 공격력 200에 STR 환산 증가분 300×0.35를 반영해 관통 외 피해 총량을 보존한다.
      atk: 305,
      strStat: 300,
      maxMp: 10_000,
      mp: 10_000,
    };
    const defender = { ...BASE, hp: 10_000, maxHp: 10_000, def: 200 };
    const cast = (armorPierceFraction?: number) => {
      const state = initialBattleStatePvP(
        { ...attacker, armorPierceFraction },
        defender,
        "P1",
        "P2",
        skills,
        EMPTY_SKILLS,
      );
      vi.spyOn(Math, "random").mockReturnValue(0);
      return castV2SkillOnAttackerTurnPvP(state, "p1").state;
    };
    const normal = cast();
    vi.restoreAllMocks();
    const pierced = cast(0.5);

    const normalDamage = 10_000 - normal.p2.hp;
    const piercedDamage = 10_000 - pierced.p2.hp;
    expect(normalDamage).toBe(137);
    expect(piercedDamage).toBe(267);
  });

  it("분신 같은 턴 종료 추가타에도 배율을 적용한다", () => {
    const attacker = { ...BASE, shadowCloneAtkPct: 100 };
    const target = { ...BASE, hp: 10_000, maxHp: 10_000 };
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const normal = endAttackerPhase(
      stateWith(undefined, attacker, target),
      "p1",
      "p2",
    );
    const arena = endAttackerPhase(
      stateWith(ARENA_DAMAGE_MULTIPLIER, attacker, target),
      "p1",
      "p2",
    );
    const normalDamage = target.hp - normal.p2.hp;
    const arenaDamage = target.hp - arena.p2.hp;

    expect(normalDamage).toBeGreaterThan(0);
    expect(arenaDamage).toBe(Math.floor(normalDamage * 0.65));
  });

  it("HP 소모형 스킬의 자해 비용은 줄이지 않는다", () => {
    const skills: V2SkillsState = {
      learned: ["v2c_berserker_bloodslash"],
      equipped: ["v2c_berserker_bloodslash"],
    };
    const makeSkillState = (multiplier?: number) =>
      initialBattleStatePvP(
        BASE,
        { ...BASE, hp: 10_000, maxHp: 10_000 },
        "P1",
        "P2",
        skills,
        EMPTY_SKILLS,
        multiplier,
      );
    vi.spyOn(Math, "random").mockReturnValue(0);
    const normal = castV2SkillOnAttackerTurnPvP(makeSkillState(), "p1").state;
    const arena = castV2SkillOnAttackerTurnPvP(
      makeSkillState(ARENA_DAMAGE_MULTIPLIER),
      "p1",
    ).state;

    expect(normal.p1.hp).toBeLessThan(BASE.hp);
    expect(arena.p1.hp).toBe(normal.p1.hp);
    expect(arena.p2.hp).toBeGreaterThan(normal.p2.hp);
  });

  it("아레나의 일반 회복 스킬 회복량을 35% 줄인다", () => {
    const skills: V2SkillsState = {
      learned: ["v2c_acolyte_smite"],
      equipped: ["v2c_acolyte_smite"],
    };
    const wounded = { ...BASE, hp: 100, magicAtk: 120, healMult: 1 };
    const makeSkillState = (sustainMultiplier?: number) =>
      initialBattleStatePvP(
        wounded,
        BASE,
        "P1",
        "P2",
        skills,
        EMPTY_SKILLS,
        undefined,
        sustainMultiplier,
      );
    vi.spyOn(Math, "random").mockReturnValue(0);
    const normal = castV2SkillOnAttackerTurnPvP(makeSkillState(), "p1").state;
    const arena = castV2SkillOnAttackerTurnPvP(
      makeSkillState(ARENA_SUSTAIN_MULTIPLIER),
      "p1",
    ).state;
    const normalHealing = normal.p1.hp - wounded.hp;
    const arenaHealing = arena.p1.hp - wounded.hp;

    expect(normalHealing).toBeGreaterThan(0);
    expect(arenaHealing).toBe(Math.floor(normalHealing * 0.65));
  });

  it("아레나의 직접 보호막 생성량을 35% 줄인다", () => {
    const skills: V2SkillsState = {
      learned: ["v2c_warder_barrier"],
      equipped: ["v2c_warder_barrier"],
    };
    const wounded = { ...BASE, hp: 500 };
    const makeSkillState = (sustainMultiplier?: number) =>
      initialBattleStatePvP(
        wounded,
        BASE,
        "P1",
        "P2",
        skills,
        EMPTY_SKILLS,
        undefined,
        sustainMultiplier,
      );
    vi.spyOn(Math, "random").mockReturnValue(0);
    const normal = castV2SkillOnAttackerTurnPvP(makeSkillState(), "p1").state;
    const arena = castV2SkillOnAttackerTurnPvP(
      makeSkillState(ARENA_SUSTAIN_MULTIPLIER),
      "p1",
    ).state;

    expect(normal.p1.stacks.playerShield).toBeGreaterThan(0);
    expect(arena.p1.stacks.playerShield).toBe(
      Math.floor(normal.p1.stacks.playerShield * 0.65),
    );
  });

  it("별도 PvP 50% 제한을 받는 1회 회복기에는 아레나 배율을 중복 적용하지 않는다", () => {
    const skills: V2SkillsState = {
      learned: ["v2c_survivor_firstaid"],
      equipped: ["v2c_survivor_firstaid"],
    };
    const wounded = { ...BASE, hp: 100, healMult: 1 };
    const makeSkillState = (sustainMultiplier?: number) =>
      initialBattleStatePvP(
        wounded,
        BASE,
        "P1",
        "P2",
        skills,
        EMPTY_SKILLS,
        undefined,
        sustainMultiplier,
      );
    vi.spyOn(Math, "random").mockReturnValue(0);
    const normal = castV2SkillOnAttackerTurnPvP(makeSkillState(), "p1").state;
    const arena = castV2SkillOnAttackerTurnPvP(
      makeSkillState(ARENA_SUSTAIN_MULTIPLIER),
      "p1",
    ).state;

    expect(normal.p1.hp).toBeGreaterThan(wounded.hp);
    expect(arena.p1.hp).toBe(normal.p1.hp);
  });

  it("전투 시작 시 생성되는 보호막에도 아레나 보정을 적용한다", () => {
    const shielded = { ...BASE, bulwarkShield: 100 };
    const normal = stateWith(undefined, shielded, BASE);
    const arena = stateWith(
      undefined,
      shielded,
      BASE,
      ARENA_SUSTAIN_MULTIPLIER,
    );

    expect(normal.p1.stacks.playerShield).toBe(100);
    expect(arena.p1.stacks.playerShield).toBe(65);
  });
});
