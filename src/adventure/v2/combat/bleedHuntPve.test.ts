import { afterEach, describe, expect, it, vi } from "vitest";
import type { Monster } from "@/adventure/data/monsters";
import type { V2SkillId } from "@/adventure/data/v2/v2Skills";
import {
  advanceTurn,
  applyPlayerV2SkillCast,
  initialBattleState,
  type PlayerCombat,
} from "./engine";
import { makeBleedDot } from "./combatShared";

afterEach(() => vi.restoreAllMocks());

const enemy = (over: Partial<Monster> = {}): Monster => ({
  name: "출혈 허수아비",
  tags: ["beast"],
  hp: 5_000,
  atk: 0,
  def: 20,
  spd: 1,
  exp: 0,
  evasionPct: 0,
  ...over,
});

const player = (over: Partial<PlayerCombat> = {}): PlayerCombat => ({
  hp: 500,
  maxHp: 1_000,
  mp: 10_000,
  maxMp: 10_000,
  atk: 100,
  strStat: 100,
  dexStat: 100,
  def: 100,
  spd: 100,
  accuracyPct: 0,
  evasionPct: 0,
  attackCount: 1,
  ...over,
});

function castState(
  skillId: V2SkillId,
  bleedStacks: number,
  bleedTurns = 3,
  enemyOver: Partial<Monster> = {},
) {
  const actor = player();
  const state = initialBattleState(actor, enemy(enemyOver), "수인", {
    learned: [skillId],
    equipped: [skillId],
  });
  return {
    actor,
    state: {
      ...state,
      enemyV2Dots:
        bleedStacks > 0
          ? [
              makeBleedDot({
                stacks: bleedStacks,
                turns: bleedTurns,
                flatPerStack: 7,
                sourceAtk: 321,
              }),
            ]
          : [],
    },
  };
}

describe("출혈 사냥 PvE 적용", () => {
  it("출혈 연장 효과가 없는 장착 스킬은 전용 난수를 소비하지 않는다", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const { actor, state } = castState("v2c_tracker_pounce", 0);

    applyPlayerV2SkillCast(state, actor, {
      selfBuffs: {},
      selfDebuffs: {},
      enemyDebuffs: {},
    });

    expect(random).toHaveBeenCalledTimes(1);
  });

  it("5중첩 조건부 적중이 회피 경감을 줄인다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const run = (stacks: number) => {
      const { actor, state } = castState(
        "v2c_tracker_pounce",
        stacks,
        3,
        { evasionPct: 80 },
      );
      return applyPlayerV2SkillCast(state, actor, {
        selfBuffs: {},
        selfDebuffs: {},
        enemyDebuffs: {},
      }).state;
    };
    expect(run(5).enemyHp).toBeLessThan(run(4).enemyHp);
  });

  it("포식은 초과 피해가 아닌 실제 감소 HP의 14%만 회복한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { actor, state } = castState(
      "v2c_predator_devour",
      10,
      3,
      { hp: 50, def: 0 },
    );
    const cast = applyPlayerV2SkillCast(state, actor, {
      selfBuffs: {},
      selfDebuffs: {},
      enemyDebuffs: {},
    });
    expect(cast.state.enemyHp).toBe(0);
    expect(cast.state.playerHp).toBe(507);
  });

  it("상처 덧내기는 기존 출혈 계수를 보존하고 4회로 갱신한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { actor, state } = castState("v2c_beastwarrior_reopen", 5, 2);
    const original = state.enemyV2Dots[0]!;
    const cast = applyPlayerV2SkillCast(state, actor, {
      selfBuffs: {},
      selfDebuffs: {},
      enemyDebuffs: {},
    });
    expect(cast.state.enemyV2Dots[0]).toEqual({
      ...original,
      stacks: 6,
      turns: 4,
    });
    expect(
      cast.state.log.some((entry) =>
        entry.text.includes("출혈 지속이 4회로 갱신됐다"),
      ),
    ).toBe(true);
  });

  it("10중첩 출혈의 처치 틱은 피의 양식을 한 번 적용한다", () => {
    const actor = player();
    const state = initialBattleState(actor, enemy({ hp: 50 }), "수인", {
      learned: ["v2c_predator_bloodnourishment"],
      equipped: ["v2c_predator_bloodnourishment"],
    });
    const primed = {
      ...state,
      phase: "enemy" as const,
      enemyV2Dots: [
        makeBleedDot({
          stacks: 10,
          turns: 1,
          flatPerStack: 10,
          sourceAtk: 0,
        }),
      ],
    };
    const after = advanceTurn(primed, actor, "수인");
    expect(after.outcome).toBe("win");
    expect(after.playerHp).toBe(510);
  });

  it("9중첩이거나 피의 양식을 장착하지 않으면 출혈 틱 회복이 없다", () => {
    const run = (stacks: number, equipped: boolean) => {
      const actor = player();
      const skills = equipped
        ? {
            learned: ["v2c_predator_bloodnourishment" as const],
            equipped: ["v2c_predator_bloodnourishment" as const],
          }
        : undefined;
      const state = initialBattleState(actor, enemy({ hp: 50 }), "수인", skills);
      return advanceTurn(
        {
          ...state,
          phase: "enemy" as const,
          enemyV2Dots: [
            makeBleedDot({
              stacks,
              turns: 1,
              flatPerStack: 10,
              sourceAtk: 0,
            }),
          ],
        },
        actor,
        "수인",
      );
    };
    expect(run(9, true).playerHp).toBe(500);
    expect(run(10, false).playerHp).toBe(500);
  });
});
