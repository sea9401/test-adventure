import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return { ...actual, V2_CORE_LOOP_V2: true };
});

import type { Monster } from "@/adventure/data/monsters";
import {
  resolveBattle,
  type BattleResolution,
  type PlayerCombat,
} from "./engine";

const basePlayer: PlayerCombat = {
  hp: 100_000,
  maxHp: 100_000,
  atk: 1,
  def: 0,
  spd: 25,
  evasionPct: 0,
  attackCount: 1,
  accuracyPct: 100,
};

function toxicMonster(options?: {
  spd?: number;
  heavyBlowEvery?: number;
}): Monster {
  return {
    name: "독혈 군주",
    tags: ["undead", "beast"],
    hp: 1_000_000,
    atk: 100,
    def: 100,
    spd: options?.spd ?? 5,
    accuracy: 100,
    evasionPct: 0,
    exp: 0,
    ...(options?.heavyBlowEvery
      ? {
          skill: {
            kind: "heavy_blow" as const,
            name: "독혈 파열",
            everyPhases: options.heavyBlowEvery,
            multiplier: 1.8,
          },
        }
      : {}),
  };
}

afterEach(() => vi.restoreAllMocks());

function runBattle(options?: {
  mechanic?: boolean;
  enemy?: Monster;
  player?: PlayerCombat;
  maxTurns?: number;
  forceAtbSkills?: boolean;
}): BattleResolution {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  return resolveBattle(
    options?.player ?? basePlayer,
    options?.enemy ?? toxicMonster(),
    "독혈 대상",
    {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
      isBoss: true,
      maxTurns: options?.maxTurns ?? 2,
      forceAtbSkills: options?.forceAtbSkills,
      ...(options?.mechanic === false
        ? {}
        : { bossMechanic: { kind: "toxic_blood_lord" as const } }),
    },
  );
}

describe("toxic blood lord ATB mechanic", () => {
  it("실제 HP 피해를 준 일반 행동은 독혈을 한 번 쌓는다", () => {
    const result = runBattle();

    expect(result.finalState.bossMechanic).toMatchObject({
      kind: "toxic_blood_lord",
      toxicBloodStacks: 1,
    });
    expect(
      result.finalState.log.some((entry) =>
        entry.text.includes("[독혈] +1 · 현재 1/10"),
      ),
    ).toBe(true);
  });

  it("독혈 파열은 공격 행동당 독혈을 두 번 쌓는다", () => {
    const result = runBattle({
      enemy: toxicMonster({ heavyBlowEvery: 1 }),
    });

    expect(result.finalState.bossMechanic).toMatchObject({
      kind: "toxic_blood_lord",
      toxicBloodStacks: 2,
    });
    expect(
      result.finalState.log.some((entry) =>
        entry.text.includes("[독혈] +2 · 현재 2/10"),
      ),
    ).toBe(true);
  });

  it("피해를 준 몬스터 V2 스킬 행동도 독혈을 한 번 쌓는다", () => {
    const result = runBattle({
      forceAtbSkills: true,
      enemy: {
        ...toxicMonster(),
        v2MaxMp: 30,
        v2Skills: {
          learned: ["mob_crushing_blow"],
          equipped: ["mob_crushing_blow"],
        },
      },
    });

    expect(
      result.finalState.log.some((entry) =>
        entry.text.includes("분쇄 일격!"),
      ),
    ).toBe(true);
    expect(result.finalState.bossMechanic).toMatchObject({
      kind: "toxic_blood_lord",
      toxicBloodStacks: 1,
    });
  });

  it("독혈 파열 다섯 행동째 10중첩을 소비해 한 번 폭발한다", () => {
    const result = runBattle({
      enemy: toxicMonster({ spd: 70, heavyBlowEvery: 1 }),
    });

    expect(result.finalState.bossMechanic).toMatchObject({
      kind: "toxic_blood_lord",
      toxicBloodStacks: 0,
      toxicRecoveryLockActions: 1,
      toxicExplosionCount: 1,
    });
    expect(
      result.finalState.log.filter((entry) =>
        entry.text.includes("[독혈 폭발]"),
      ),
    ).toHaveLength(1);
    expect(
      result.finalState.log.filter(
        (entry) =>
          entry.text ===
          "[독혈 10/10] 축적된 독혈이 한꺼번에 파열된다.",
      ),
    ).toHaveLength(1);
  });

  it("플레이어 행동 시작에 현재 중첩 비례 지속 피해를 준다", () => {
    const result = runBattle();

    expect(
      result.finalState.log.some((entry) =>
        entry.text.includes("[독혈 1중첩] 지속 피해 500"),
      ),
    ).toBe(true);
    expect(result.finalState.bossMechanic).toMatchObject({
      toxicDamageTaken: 500,
    });
  });

  it("상태 피해 감소는 독혈 지속 피해에 적용된다", () => {
    const result = runBattle({
      player: { ...basePlayer, statusDamageReductionPct: 50 },
    });

    expect(
      result.finalState.log.some((entry) =>
        entry.text.includes("[독혈 1중첩] 지속 피해 250"),
      ),
    ).toBe(true);
    expect(result.finalState.bossMechanic).toMatchObject({
      toxicDamageTaken: 250,
    });
  });

  it("일반 보호막이 공격을 전부 흡수하면 독혈을 쌓지 않는다", () => {
    const result = runBattle({
      player: { ...basePlayer, bulwarkShield: 10_000 },
    });

    expect(result.finalState.bossMechanic).toMatchObject({
      kind: "toxic_blood_lord",
      toxicBloodStacks: 0,
    });
    expect(
      result.finalState.log.some((entry) => entry.text.includes("[독혈] +")),
    ).toBe(false);
  });

  it("독혈 4와 7 구간에 처음 진입할 때 단계별 전조를 한 번씩 남긴다", () => {
    const result = runBattle({
      enemy: toxicMonster({ spd: 58, heavyBlowEvery: 1 }),
    });
    const logs = result.finalState.log.map((entry) => entry.text);

    expect(result.finalState.bossMechanic).toMatchObject({
      toxicBloodStacks: 8,
      toxicExplosionCount: 0,
    });
    expect(
      logs.filter(
        (text) =>
          text === "[독혈 4/10] 검붉은 독혈이 상처 깊숙이 스며든다.",
      ),
    ).toHaveLength(1);
    expect(
      logs.filter(
        (text) =>
          text ===
          "[독혈 8/10] 축적된 독혈이 불길하게 맥동한다. 폭발이 임박했다.",
      ),
    ).toHaveLength(1);
  });

  it("중첩형 회복 감소를 기존 받는 회복 배율과 한 번씩 곱한다", () => {
    const result = runBattle({
      enemy: { ...toxicMonster(), atk: 2_000 },
      player: {
        ...basePlayer,
        regen: { interval: 1, amount: 1_000 },
        receivedHealMult: 1.2,
      },
    });

    expect(
      result.finalState.log.some((entry) =>
        entry.text.includes("[재생] 독혈 대상의 HP +1164"),
      ),
    ).toBe(true);
  });

  it("독혈 중첩은 다음 피격에서 흡혈 갑옷 회복도 줄인다", () => {
    const result = runBattle({
      maxTurns: 3,
      player: { ...basePlayer, bloodfeastPct: 100 },
    });

    expect(
      result.finalState.log.some((entry) =>
        entry.text.includes("[흡혈 갑옷] 독혈 대상의 HP +97"),
      ),
    ).toBe(true);
  });

  it("폭발 후 첫 플레이어 행동의 재생은 50%만 적용된다", () => {
    const result = runBattle({
      enemy: { ...toxicMonster({ spd: 70, heavyBlowEvery: 1 }), atk: 2_000 },
      player: {
        ...basePlayer,
        regen: { interval: 1, amount: 1_000 },
      },
    });

    expect(
      result.finalState.log.some((entry) =>
        entry.text.includes("[재생] 독혈 대상의 HP +500"),
      ),
    ).toBe(true);
    expect(result.finalState.bossMechanic).toMatchObject({
      toxicRecoveryLockActions: 1,
    });
  });

  it("불굴로 폭발을 버티면 전투 기록에는 실제 HP 차감량을 남긴다", () => {
    const result = runBattle({
      enemy: { ...toxicMonster({ spd: 75, heavyBlowEvery: 1 }), atk: 1 },
      player: {
        ...basePlayer,
        hp: 20_000,
        enduranceActive: true,
      },
    });
    const explosion = result.finalState.log.find((entry) =>
      entry.text.includes("[독혈 폭발]"),
    );
    const loggedDamage = Number(explosion?.text.match(/피해 (\d+)/)?.[1]);

    expect(result.finalState.flags.enduranceTriggered).toBe(true);
    expect(loggedDamage).toBeGreaterThan(0);
    expect(loggedDamage).toBeLessThan(20_000);
  });

  it("독혈 설정이 없는 같은 전투에는 독혈 상태와 로그가 없다", () => {
    const result = runBattle({ mechanic: false });

    expect(result.finalState.bossMechanic).toBeUndefined();
    expect(
      result.finalState.log.some(
        (entry) =>
          entry.text.includes("[독혈] +") ||
          entry.text.includes("[독혈 폭발]"),
      ),
    ).toBe(false);
  });
});
