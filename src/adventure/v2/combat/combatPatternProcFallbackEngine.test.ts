import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return { ...actual, V2_SKILL_PROC_IN_PATTERN: true };
});

import type { Monster } from "@/adventure/data/monsters";
import type { V2SkillsState } from "@/adventure/data/v2/v2Skills";
import {
  applyPlayerV2SkillCast,
  initialBattleState,
  type PlayerCombat,
} from "./engine";
import {
  castV2SkillOnAttackerTurnPvP,
  initialBattleStatePvP,
} from "./engine-pvp";
import { makePoisonDot } from "./combatShared";

const SKILL_IDS = [
  "v2c_archmage_collapse", // 40%
  "v2c_arcanist_burst", // 45%
  "v2c_mage_boltcast", // 100%
] as const;

const skills: V2SkillsState = {
  learned: [...SKILL_IDS],
  equipped: [...SKILL_IDS],
  pattern: {
    blocks: SKILL_IDS.map((skillId) => ({
      condition: { kind: "always" },
      action: { kind: "skill", skillId },
    })),
  },
};

const player: PlayerCombat = {
  hp: 10_000,
  maxHp: 10_000,
  atk: 100,
  magicAtk: 100,
  intStat: 100,
  def: 100,
  spd: 100,
  evasionPct: 0,
  accuracyPct: 100,
  attackCount: 1,
  maxMp: 10_000,
  mp: 10_000,
};

const enemy: Monster = {
  name: "패턴 허수아비",
  tags: [],
  hp: 100_000,
  atk: 1,
  def: 0,
  magicDef: 0,
  spd: 1,
  exp: 0,
  evasionPct: 0,
};

afterEach(() => vi.restoreAllMocks());

describe("전투 엔진의 다음 순위 스킬 독립 판정", () => {
  it("PvE에서 1순위 실패 뒤 2순위를 새 판정값으로 시전한다", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.1)
      .mockReturnValue(0.1);
    const initial = initialBattleState(player, enemy, "P1", skills);

    const result = applyPlayerV2SkillCast(initial, player, {
      selfBuffs: {},
      selfDebuffs: {},
      enemyDebuffs: {},
    });

    expect(
      result.state.log.some((entry) => entry.text.startsWith("비전 폭발!")),
    ).toBe(true);
  });

  it("PvP에서 1순위 실패 뒤 2순위를 새 판정값으로 시전한다", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.1)
      .mockReturnValue(0.1);
    const initial = initialBattleStatePvP(
      player,
      { ...player, spd: 1 },
      "P1",
      "P2",
      skills,
      { learned: [], equipped: [] },
      undefined,
      undefined,
      "p1",
    );

    const result = castV2SkillOnAttackerTurnPvP(initial, "p1");

    expect(
      result.state.log.some((entry) => entry.text.startsWith("비전 폭발!")),
    ).toBe(true);
  });

  const remainingPoisonPatternSkills: V2SkillsState = {
    learned: ["v2c_mage_boltcast", "v2c_warrior_flurry"],
    equipped: ["v2c_mage_boltcast", "v2c_warrior_flurry"],
    pattern: {
      blocks: [
        {
          condition: {
            kind: "enemy_status",
            tag: "poison",
            metric: "remainingTurns",
            op: "atLeast",
            stacks: 2,
          },
          action: { kind: "skill", skillId: "v2c_mage_boltcast" },
        },
        {
          condition: { kind: "always" },
          action: { kind: "skill", skillId: "v2c_warrior_flurry" },
        },
      ],
    },
  };

  it("PvE에서 적 중독의 남은 횟수를 패턴 조건에 전달한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const initial = initialBattleState(
      player,
      enemy,
      "P1",
      remainingPoisonPatternSkills,
    );
    const prepared = {
      ...initial,
      enemyV2Dots: [
        makePoisonDot({
          stacks: 6,
          turns: 2,
          pctMaxHpPerStack: 0.001,
          sourceAtk: 100,
        }),
      ],
    };

    const result = applyPlayerV2SkillCast(prepared, player, {
      selfBuffs: {},
      selfDebuffs: {},
      enemyDebuffs: {},
    });

    expect(
      result.state.log.some((entry) => entry.text.startsWith("마력탄!")),
    ).toBe(true);
  });

  it("PvP에서 상대 중독의 남은 횟수를 패턴 조건에 전달한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const initial = initialBattleStatePvP(
      player,
      { ...player, spd: 1 },
      "P1",
      "P2",
      remainingPoisonPatternSkills,
      { learned: [], equipped: [] },
      undefined,
      undefined,
      "p1",
    );
    const prepared = {
      ...initial,
      p2: {
        ...initial.p2,
        v2Dots: [
          makePoisonDot({
            stacks: 6,
            turns: 2,
            pctMaxHpPerStack: 0.001,
            sourceAtk: 100,
          }),
        ],
      },
    };

    const result = castV2SkillOnAttackerTurnPvP(prepared, "p1");

    expect(
      result.state.log.some((entry) => entry.text.startsWith("마력탄!")),
    ).toBe(true);
  });
});
