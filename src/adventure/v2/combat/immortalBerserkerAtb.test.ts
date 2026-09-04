import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return { ...actual, V2_CORE_LOOP_V2: true, V2_ATB_SKILLS: true };
});

import type { Monster } from "@/adventure/data/monsters";
import { UNEXPLORED_BOSSES } from "@/adventure/data/v2/unexploredBosses";
import {
  resolveBattle,
  type BattleResolution,
  type PlayerCombat,
} from "./engine";
import {
  initialImmortalBerserkerState,
  type ImmortalBerserkerBattleState,
} from "./immortalBerserkerMechanic";

const SHARED_MAX_HP = 10_800_000;
const FIRST_FLOOR = 7_236_000;
const SECOND_FLOOR = 3_672_000;

const player: PlayerCombat = {
  hp: 1_000_000,
  maxHp: 1_000_000,
  atk: 100_000,
  def: 1_000,
  spd: 100,
  evasionPct: 0,
  attackCount: 1,
  accuracyPct: 100,
};

const boss: Monster = {
  name: "불멸의 광전왕",
  tags: ["undead"],
  hp: SHARED_MAX_HP,
  atk: 100,
  def: 0,
  magicDef: 0,
  spd: 1,
  directActionSpd: true,
  accuracy: 100,
  evasionPct: 0,
  exp: 0,
};

afterEach(() => vi.restoreAllMocks());

function runImmortal(options?: {
  initialState?: ImmortalBerserkerBattleState;
  initialEnemyHp?: number;
  maxTurns?: number;
  player?: PlayerCombat;
  boss?: Monster;
  randomValue?: number;
}): BattleResolution {
  vi.spyOn(Math, "random").mockReturnValue(options?.randomValue ?? 0.5);
  return resolveBattle(
    options?.player ?? player,
    options?.boss ?? boss,
    "시험자",
    {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
      isBoss: true,
      initialEnemyHp: options?.initialEnemyHp ?? SHARED_MAX_HP,
      maxTurns: options?.maxTurns ?? 1,
      bossMechanic: {
        kind: "immortal_berserker",
        sharedMaxHp: SHARED_MAX_HP,
        initialState:
          options?.initialState ??
          initialImmortalBerserkerState(SHARED_MAX_HP),
      },
    },
  );
}

function catalogSkillBoss(): Monster {
  const catalogMonster = UNEXPLORED_BOSSES.immortal_berserker.monster;
  return {
    ...boss,
    atk: 100,
    spd: 100,
    v2Skills: catalogMonster.v2Skills
      ? {
          learned: [...catalogMonster.v2Skills.learned],
          equipped: [...catalogMonster.v2Skills.equipped],
        }
      : undefined,
    v2MaxMp: catalogMonster.v2MaxMp,
  };
}

function firstCrushingBlowDamage(result: BattleResolution): number {
  const crushingBlow = result.finalState.log.find(
    (entry) =>
      entry.kind === "enemy_attack" && entry.text.startsWith("분쇄 일격!"),
  );
  expect(crushingBlow?.kind).toBe("enemy_attack");
  if (!crushingBlow || crushingBlow.kind !== "enemy_attack") return 0;
  return crushingBlow.enemyHpDamage ?? 0;
}

describe("immortal berserker ATB mechanic", () => {
  it("casts roar then crushing blow without adding a basic attack on either skill tick", () => {
    const result = runImmortal({
      maxTurns: 4,
      randomValue: 0.1,
      player: {
        ...player,
        hp: 1_000_000_000,
        maxHp: 1_000_000_000,
        atk: 1,
        def: 0,
        spd: 99,
      },
      boss: catalogSkillBoss(),
    });
    const roar = result.finalState.log.find((entry) =>
      entry.text.includes("[포효]"),
    );
    const crushingBlow = result.finalState.log.find(
      (entry) =>
        entry.kind === "enemy_attack" &&
        entry.text.startsWith("분쇄 일격!"),
    );

    expect(roar?.t).toBeTypeOf("number");
    expect(crushingBlow?.t).toBeTypeOf("number");
    expect(crushingBlow!.t!).toBeGreaterThan(roar!.t!);
    const skillTicks = new Set([roar!.t, crushingBlow!.t]);
    expect(
      result.finalState.log.some(
        (entry) =>
          entry.kind === "enemy_attack" &&
          entry.text.startsWith("공격!") &&
          skillTicks.has(entry.t),
      ),
    ).toBe(false);
  });

  it("deals less crushing blow damage to a player with higher defense", () => {
    const runAgainstDefense = (def: number) =>
      runImmortal({
        maxTurns: 4,
        randomValue: 0.1,
        player: {
          ...player,
          hp: 1_000_000_000,
          maxHp: 1_000_000_000,
          atk: 1,
          def,
          spd: 99,
        },
        boss: catalogSkillBoss(),
      });

    const lowDefenseDamage = firstCrushingBlowDamage(runAgainstDefense(0));
    const highDefenseDamage = firstCrushingBlowDamage(runAgainstDefense(150));

    expect(highDefenseDamage).toBeLessThan(lowDefenseDamage);
  });

  it("blocks overkill at a life boundary and cancels the remaining attacks in that action", () => {
    const result = runImmortal({
      initialEnemyHp: FIRST_FLOOR + 10,
      player: { ...player, attackCount: 2 },
    });

    expect(result.finalState.enemyHp).toBe(FIRST_FLOOR);
    expect(result.finalState.bossMechanic).toMatchObject({
      kind: "immortal_berserker",
      lifeIndex: 1,
      regenActionCount: 0,
      regenUsesRemaining: 2,
      revivalsCompleted: 1,
      immortalBodyDamage: 10,
      immortalRevivalCount: 1,
    });
    expect(
      result.finalState.log.filter((entry) => entry.kind === "player_attack"),
    ).toHaveLength(1);
    expect(result.finalState.log.some((entry) => entry.text.includes("첫 번째 부활"))).toBe(true);
    expect(result.finalState.log.some((entry) => entry.text.includes("공격력 +20%"))).toBe(true);
    expect(result.finalState.log.some((entry) => entry.text.includes("행동 속도 +10%"))).toBe(true);
  });

  it("announces the stronger enrage when the second revival begins", () => {
    const result = runImmortal({
      initialState: {
        kind: "immortal_berserker",
        lifeIndex: 1,
        regenActionCount: 0,
        regenUsesRemaining: 2,
        revivalsCompleted: 1,
      },
      initialEnemyHp: SECOND_FLOOR + 10,
    });

    expect(result.finalState.enemyHp).toBe(SECOND_FLOOR);
    expect(result.finalState.bossMechanic).toMatchObject({
      kind: "immortal_berserker",
      lifeIndex: 2,
      revivalsCompleted: 2,
    });
    expect(result.finalState.log.some((entry) => entry.text.includes("두 번째 부활"))).toBe(true);
    expect(result.finalState.log.some((entry) => entry.text.includes("공격력 +60%"))).toBe(true);
    expect(result.finalState.log.some((entry) => entry.text.includes("행동 속도 +25%"))).toBe(true);
  });

  it("allows the next independent player action to damage the revived life", () => {
    const result = runImmortal({
      initialEnemyHp: FIRST_FLOOR + 10,
      maxTurns: 2,
    });

    expect(result.finalState.enemyHp).toBeLessThan(FIRST_FLOOR);
    expect(result.finalState.bossMechanic).toMatchObject({
      kind: "immortal_berserker",
      lifeIndex: 1,
      immortalRevivalCount: 1,
    });
  });

  it.each([
    {
      label: "first life",
      hp: 10_500_000,
      state: {
        ...initialImmortalBerserkerState(SHARED_MAX_HP),
        regenActionCount: 3,
      } satisfies ImmortalBerserkerBattleState,
      healed: 142_560,
      atk: 100,
      spd: 100,
    },
    {
      label: "second life",
      hp: 7_000_000,
      state: {
        kind: "immortal_berserker",
        lifeIndex: 1,
        regenActionCount: 3,
        regenUsesRemaining: 2,
        revivalsCompleted: 1,
      } satisfies ImmortalBerserkerBattleState,
      healed: 106_920,
      atk: 120,
      spd: 110,
    },
    {
      label: "third life",
      hp: 3_500_000,
      state: {
        kind: "immortal_berserker",
        lifeIndex: 2,
        regenActionCount: 0,
        regenUsesRemaining: 0,
        revivalsCompleted: 2,
      } satisfies ImmortalBerserkerBattleState,
      healed: 0,
      atk: 160,
      spd: 125,
    },
  ])("applies regeneration and enrage after an enemy action in the $label", ({
    hp,
    state,
    healed,
    atk,
    spd,
  }) => {
    const result = runImmortal({
      initialState: state,
      initialEnemyHp: hp,
      maxTurns: 2,
      player: { ...player, atk: 1, spd: 99 },
      boss: { ...boss, spd: 100 },
    });

    const mechanic = result.finalState.bossMechanic;
    expect(mechanic?.kind).toBe("immortal_berserker");
    if (!mechanic || mechanic.kind !== "immortal_berserker") return;
    expect(result.finalState.enemyHp).toBe(
      hp - mechanic.immortalBodyDamage + mechanic.immortalHealing,
    );
    expect(result.finalState.enemy.atk).toBeCloseTo(atk);
    expect(result.finalState.enemy.spd).toBeCloseTo(spd);
    expect(result.finalState.bossMechanic).toMatchObject({
      kind: "immortal_berserker",
      immortalHealing: healed,
    });
    expect(
      result.finalState.log.some((entry) => entry.text.includes("재생 +")),
    ).toBe(healed > 0);
  });

  it("exposes life, regeneration and enrage values in replay snapshots", () => {
    const result = runImmortal({
      initialState: {
        kind: "immortal_berserker",
        lifeIndex: 1,
        regenActionCount: 2,
        regenUsesRemaining: 1,
        revivalsCompleted: 1,
      },
      initialEnemyHp: 7_000_000,
    });
    const snapshot = result.finalState.log.findLast(
      (entry) => entry.kind === "hp_bar",
    );

    expect(snapshot?.kind === "hp_bar" && snapshot.enemySignatureResources).toMatchObject({
      immortalLife: "2/3",
      immortalLifeHp: "3,228,000 / 3,564,000",
      immortalRegeneration: "2행동 · 1회",
      immortalEnrage: "공격 +20% · 속도 +10%",
    });
  });
});
