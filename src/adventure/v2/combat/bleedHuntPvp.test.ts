import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  V2SkillId,
  V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { makeBleedDot } from "./combatShared";
import {
  castV2SkillOnAttackerTurnPvP,
  initialBattleStatePvP,
  tickPvPSideDotsOnAction,
  type PvPBattleState,
} from "./engine-pvp";
import type { PlayerCombat } from "./engine";

afterEach(() => vi.restoreAllMocks());

const EMPTY: V2SkillsState = { learned: [], equipped: [] };
const player = (over: Partial<PlayerCombat> = {}): PlayerCombat => ({
  hp: 500,
  maxHp: 1_000,
  mp: 10_000,
  maxMp: 10_000,
  atk: 100,
  strStat: 100,
  dexStat: 100,
  def: 20,
  spd: 50,
  accuracyPct: 0,
  accRating: 0,
  evasionPct: 0,
  evaRating: 0,
  attackCount: 1,
  ...over,
});

const skills = (...ids: V2SkillId[]): V2SkillsState => ({
  learned: ids,
  equipped: ids,
});

function withBleed(
  state: PvPBattleState,
  target: "p1" | "p2",
  stacks: number,
  turns = 3,
): PvPBattleState {
  return {
    ...state,
    [target]: {
      ...state[target],
      v2Dots: [
        makeBleedDot({
          stacks,
          turns,
          flatPerStack: 7,
          sourceAtk: 321,
        }),
      ],
    },
  };
}

describe("출혈 사냥 PvP 적용", () => {
  it("출혈 연장 효과가 없는 장착 스킬은 전용 난수를 소비하지 않는다", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const initial = initialBattleStatePvP(
      player(),
      player(),
      "P1",
      "P2",
      skills("v2c_tracker_pounce"),
      EMPTY,
    );

    castV2SkillOnAttackerTurnPvP(initial, "p1");

    expect(random).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["p1", "p2"],
    ["p2", "p1"],
  ] as const)("%s 포식은 %s 보호막에 준 실제 피해 중 14퍼센트만 회복한다", (actorKey, targetKey) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const initial = initialBattleStatePvP(
      player(actorKey === "p1" ? {} : { bulwarkShield: 5_000 }),
      player(actorKey === "p2" ? {} : { bulwarkShield: 5_000 }),
      "P1",
      "P2",
      actorKey === "p1" ? skills("v2c_predator_devour") : EMPTY,
      actorKey === "p2" ? skills("v2c_predator_devour") : EMPTY,
    );
    const primed = withBleed(initial, targetKey, 10);
    const beforeShield = primed[targetKey].stacks.playerShield;
    const cast = castV2SkillOnAttackerTurnPvP(primed, actorKey).state;
    const shieldDamage = beforeShield - cast[targetKey].stacks.playerShield;
    expect(shieldDamage).toBeGreaterThan(0);
    expect(cast[targetKey].hp).toBe(500);
    expect(cast[actorKey].hp).toBe(500 + Math.floor(shieldDamage * 0.14));
  });

  it("5중첩 적중 보너스가 PvP 회피 경감을 줄인다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const run = (stacks: number) => {
      const initial = initialBattleStatePvP(
        player(),
        player({ hp: 5_000, maxHp: 5_000, evasionPct: 80, evaRating: 80 }),
        "P1",
        "P2",
        skills("v2c_tracker_pounce"),
        EMPTY,
      );
      return castV2SkillOnAttackerTurnPvP(
        withBleed(initial, "p2", stacks),
        "p1",
      ).state.p2.hp;
    };
    expect(run(5)).toBeLessThan(run(4));
  });

  it("상처 덧내기는 기존 출혈의 출처를 보존하고 지속을 갱신한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const initial = initialBattleStatePvP(
      player(),
      player(),
      "P1",
      "P2",
      skills("v2c_beastwarrior_reopen"),
      EMPTY,
    );
    const primed = withBleed(initial, "p2", 5, 2);
    const original = primed.p2.v2Dots[0]!;
    const cast = castV2SkillOnAttackerTurnPvP(primed, "p1").state;
    expect(cast.p2.v2Dots[0]).toEqual({
      ...original,
      stacks: 6,
      turns: 4,
    });
    expect(
      cast.log.some((entry) =>
        entry.text.includes("출혈 지속이 4회로 갱신됐다"),
      ),
    ).toBe(true);
  });

  it("보장 회피는 대상 효과와 회복을 지우지만 21% 시전 가속은 보존한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const initial = initialBattleStatePvP(
      player(),
      player(),
      "P1",
      "P2",
      skills(
        "v2c_primalpredator_primalfeast",
        "v2c_tracker_instinct",
      ),
      EMPTY,
    );
    const primed = withBleed(
      {
        ...initial,
        p2: {
          ...initial.p2,
          stacks: { ...initial.p2.stacks, evadesRemaining: 1 },
        },
      },
      "p2",
      10,
      2,
    );
    const cast = castV2SkillOnAttackerTurnPvP(primed, "p1");
    expect(cast.selfHastePct).toBe(21);
    expect(cast.enemyDelayPct).toBe(0);
    expect(cast.state.p1.hp).toBe(500);
    expect(cast.state.p2.v2Dots[0]).toEqual(primed.p2.v2Dots[0]);
  });

  it.each([
    ["p1", "p2"],
    ["p2", "p1"],
  ] as const)("%s의 피의 양식은 %s의 치명적인 10중첩 출혈 틱 전에 회복한다", (sourceKey, targetKey) => {
    const initial = initialBattleStatePvP(
      player(sourceKey === "p1" ? {} : { hp: 50, maxHp: 1_000 }),
      player(sourceKey === "p2" ? {} : { hp: 50, maxHp: 1_000 }),
      "P1",
      "P2",
      sourceKey === "p1" ? skills("v2c_predator_bloodnourishment") : EMPTY,
      sourceKey === "p2" ? skills("v2c_predator_bloodnourishment") : EMPTY,
    );
    const primed = withBleed(initial, targetKey, 10, 1);
    const next = tickPvPSideDotsOnAction(primed, targetKey);
    expect(next.outcome).toBe(sourceKey === "p1" ? "p1_win" : "p2_win");
    expect(next[sourceKey].hp).toBe(510);
  });
});
