import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return { ...actual, V2_CORE_LOOP_V2: true };
});

import type { Monster } from "@/adventure/data/monsters";
import { damageToMagicDefender } from "./combatShared";
import {
  resolveBattle,
  type BattleLogEntry,
  type BattleResolution,
  type PlayerCombat,
} from "./engine";
import {
  initialSkywardCrystalEyeState,
  type SkywardCrystalEyeBattleState,
} from "./skywardCrystalEyeMechanic";
import { skywardCrystalEyeStackGainFromLogs } from "./engine.atb";

const SHARED_MAX_HP = 10_800_000;

const player: PlayerCombat = {
  hp: 1_000_000_000,
  maxHp: 1_000_000_000,
  atk: 100,
  def: 1_000,
  magicDef: 100,
  spd: 50,
  evasionPct: 0,
  attackCount: 1,
  accuracyPct: 100,
  critChancePct: 0,
  maxMp: 100_000,
  mp: 100_000,
};

const boss: Monster = {
  name: "천공의 수정안",
  tags: ["golem", "spirit"],
  hp: SHARED_MAX_HP,
  atk: 100,
  atkType: "magic",
  def: 0,
  magicDef: 0,
  spd: 1,
  directActionSpd: true,
  accuracy: 100,
  evasionPct: 0,
  critPct: 100,
  exp: 0,
};

afterEach(() => vi.restoreAllMocks());

function runEye(options: {
  initialState?: SkywardCrystalEyeBattleState;
  initialEnemyHp?: number;
  maxTurns?: number;
  player?: PlayerCombat;
  boss?: Monster;
  skills?: readonly string[];
} = {}): BattleResolution {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const skills = options.skills ?? [];
  return resolveBattle(options.player ?? player, options.boss ?? boss, "시험자", {
    pickAction: () => ({ kind: "attack" }),
    potions: {},
    isBoss: true,
    initialEnemyHp: options.initialEnemyHp ?? SHARED_MAX_HP,
    maxTurns: options.maxTurns ?? 1,
    forceAtbSkills: skills.length > 0,
    v2Skills: { learned: [...skills], equipped: [...skills] },
    bossMechanic: {
      kind: "skyward_crystal_eye",
      sharedMaxHp: SHARED_MAX_HP,
      initialState: options.initialState ?? initialSkywardCrystalEyeState(),
    },
  } as never);
}

function eyeState(result: BattleResolution): SkywardCrystalEyeBattleState {
  expect(result.finalState.bossMechanic?.kind).toBe("skyward_crystal_eye");
  return result.finalState.bossMechanic as SkywardCrystalEyeBattleState;
}

describe("skyward crystal eye ATB mechanic", () => {
  it("counts every landed skill hit and awards two stacks to every critical hit", () => {
    const normal = runEye({
      skills: ["v2c_warrior_flurry"],
      maxTurns: 1,
    });
    const critical = runEye({
      skills: ["v2c_warrior_flurry"],
      maxTurns: 1,
      player: { ...player, critChancePct: 100 },
    });

    expect(eyeState(normal).disruptionStacks).toBe(3);
    expect(eyeState(critical).disruptionStacks).toBe(6);
  });

  it("uses structured direct-hit metadata and excludes DoT, reflection, and automatic effects", () => {
    const logs: BattleLogEntry[] = [
      { kind: "player_attack", text: "공격", directHits: 2, criticalDirectHits: 0 },
      { kind: "player_attack", text: "치명", directHits: 3, criticalDirectHits: 3 },
      { kind: "player_attack", effect: "extra_damage", text: "반사 피해" },
      { kind: "info", effect: "status_damage", text: "중독 피해" },
    ];

    expect(skywardCrystalEyeStackGainFromLogs(logs, 0)).toBe(8);
  });

  it("fires independently at ticks 900, 1800, and 2700", () => {
    const result = runEye({
      maxTurns: 100,
      player: { ...player, atk: 1 },
    });
    const shots = result.finalState.log.filter(
      (entry) => entry.kind === "enemy_attack" && entry.text.startsWith("천공 포격!"),
    );

    expect(shots.map((entry) => entry.t)).toEqual([900, 1800, 2700]);
    expect(result.finalState.skywardCrystalEyeArtilleryEvents?.map((event) => event.tick)).toEqual([
      900,
      1800,
      2700,
    ]);
    expect(eyeState(result).artilleryCount).toBe(3);
    expect(eyeState(result).aimTicksRemaining).toBe(600);
  });

  it("continues inherited partial aim and exposure timers", () => {
    const result = runEye({
      maxTurns: 2,
      initialState: {
        ...initialSkywardCrystalEyeState(),
        aimTicksRemaining: 40,
        coreExposureTicksRemaining: 50,
      },
    });

    expect(
      result.finalState.log.some(
        (entry) => entry.kind === "enemy_attack" && entry.t === 40 && entry.text.startsWith("천공 포격!"),
      ),
    ).toBe(true);
    expect(eyeState(result).coreExposureTicksRemaining).toBe(0);
  });

  it("gives a player lethal action priority over artillery on an exact-tick tie", () => {
    const result = runEye({
      initialEnemyHp: 1,
      player: { ...player, atk: 1_000_000 },
      initialState: { ...initialSkywardCrystalEyeState(), aimTicksRemaining: 0 },
    });

    expect(result.outcome).toBe("win");
    expect(eyeState(result).artilleryCount).toBe(0);
    expect(
      result.finalState.log.some((entry) => entry.text.startsWith("천공 포격!")),
    ).toBe(false);
  });

  it("amplifies player-action damage by 25% during core exposure without stopping aim", () => {
    const plain = runEye();
    const exposed = runEye({
      initialState: {
        ...initialSkywardCrystalEyeState(),
        coreExposureTicksRemaining: 250,
      },
    });
    const plainDamage = SHARED_MAX_HP - plain.finalState.enemyHp;
    const exposedDamage = SHARED_MAX_HP - exposed.finalState.enemyHp;

    expect(exposedDamage).toBe(plainDamage + Math.floor(plainDamage * 0.25));
    expect(eyeState(exposed).aimTicksRemaining).toBe(900);
    expect(eyeState(exposed).disruptionStacks).toBe(1);
  });

  it("fires mandatory non-critical magic artillery with 20% magic-defense penetration", () => {
    const result = runEye({
      maxTurns: 2,
      initialState: { ...initialSkywardCrystalEyeState(), aimTicksRemaining: 0 },
      player: { ...player, atk: 0, magicDef: 100 },
    });
    const shot = result.finalState.log.find(
      (entry) => entry.kind === "enemy_attack" && entry.text.startsWith("천공 포격!"),
    );

    expect(shot?.text).toContain("[마법]");
    expect(shot?.text).not.toContain("[치명타]");
    expect(shot?.kind === "enemy_attack" && shot.enemyHpDamage).toBe(
      damageToMagicDefender(180, 80),
    );
  });

  it("fires at 50% power and immediately starts the next aim while exposing the core", () => {
    const result = runEye({
      maxTurns: 2,
      initialState: {
        ...initialSkywardCrystalEyeState(),
        aimTicksRemaining: 0,
        disruptionStacks: 40,
      },
    });

    expect(eyeState(result)).toMatchObject({
      aimTicksRemaining: 786,
      disruptionStacks: 1,
      coreExposureTicksRemaining: 136,
      artilleryCount: 1,
      lastArtilleryPowerPct: 50,
    });
    expect(
      result.finalState.log.some((entry) => entry.text.includes("핵 노출 250틱")),
    ).toBe(true);
  });
});
