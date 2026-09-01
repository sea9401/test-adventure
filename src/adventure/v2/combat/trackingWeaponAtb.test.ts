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
  hp: 1_000,
  maxHp: 1_000,
  atk: 10,
  def: 0,
  spd: 30,
  evasionPct: 0,
  attackCount: 1,
  accuracyPct: 100,
};

const trackingWeapon: Monster = {
  name: "추적 병기",
  tags: ["golem"],
  hp: 100_000,
  atk: 200,
  def: 100,
  spd: 1,
  accuracy: 0,
  evasionPct: 0,
  exp: 0,
};

afterEach(() => vi.restoreAllMocks());

function runTrackingBattle(options: {
  initialThreat: number;
  player?: PlayerCombat;
  enemyHp?: number;
  enemy?: Monster;
  maxTurns?: number;
}): BattleResolution {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const enemy = options.enemy ?? trackingWeapon;
  return resolveBattle(
    options.player ?? basePlayer,
    enemy,
    "추적 대상",
    {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
      isBoss: true,
      maxTurns: options.maxTurns ?? 1,
      initialEnemyHp: options.enemyHp ?? enemy.hp,
      bossMechanic: {
        kind: "tracking_weapon",
        initialThreat: options.initialThreat,
      },
    },
  );
}

function eliminationLogs(result: BattleResolution) {
  return result.finalState.log.filter(
    (entry) =>
      entry.kind === "enemy_attack" && entry.text.startsWith("추적 섬멸!"),
  );
}

function trackingState(result: BattleResolution) {
  const mechanic = result.finalState.bossMechanic;
  expect(mechanic?.kind).toBe("tracking_weapon");
  if (!mechanic || mechanic.kind !== "tracking_weapon") {
    throw new Error("tracking weapon mechanic state missing");
  }
  return mechanic;
}

describe("tracking weapon ATB mechanic", () => {
  it("저장된 추적이 준비됐으면 플레이어 행동 뒤 2연타를 한 번 발동한다", () => {
    const result = runTrackingBattle({ initialThreat: 100 });

    expect(result.finalState.bossMechanic).toMatchObject({
      kind: "tracking_weapon",
      trackingCounterCount: 1,
    });
    expect(eliminationLogs(result)).toHaveLength(2);
    expect(
      result.finalState.log.some((entry) =>
        entry.text.includes("추적 완료 — 추적 섬멸 발동"),
      ),
    ).toBe(true);
    expect(result.finalState.playerHp).toBeLessThan(basePlayer.maxHp);
  });

  it("방어력이 높은 캐릭터는 같은 추적 섬멸에서 더 적은 HP 피해를 받는다", () => {
    const unarmored = runTrackingBattle({ initialThreat: 100 });
    vi.restoreAllMocks();
    const armored = runTrackingBattle({
      initialThreat: 100,
      player: { ...basePlayer, def: 150 },
    });

    expect(basePlayer.maxHp - armored.finalState.playerHp).toBeLessThan(
      basePlayer.maxHp - unarmored.finalState.playerHp,
    );
  });

  it("첫 타격에 쓰러지면 두 번째 타격을 중단한다", () => {
    const result = runTrackingBattle({
      initialThreat: 100,
      player: { ...basePlayer, hp: 100, maxHp: 100 },
    });

    expect(result.outcome).toBe("lose");
    expect(eliminationLogs(result)).toHaveLength(1);
  });

  it("플레이어 행동으로 보스를 처치하면 반격하지 않고 추적을 초기화한다", () => {
    const result = runTrackingBattle({ initialThreat: 100, enemyHp: 1 });

    expect(result.outcome).toBe("win");
    expect(eliminationLogs(result)).toHaveLength(0);
    expect(result.finalState.bossMechanic).toMatchObject({
      trackingThreat: 0,
      trackingCounterCount: 0,
      trackingCounterDamage: 0,
    });
  });

  it("기본 공격 로그에 실제 직접 타격 횟수를 정형 값으로 남긴다", () => {
    const result = runTrackingBattle({ initialThreat: 0 });
    const attack = result.finalState.log.find(
      (entry) => entry.kind === "player_attack" && entry.text.startsWith("공격!"),
    );

    expect(attack?.kind).toBe("player_attack");
    if (!attack || attack.kind === "hp_bar") throw new Error("기본 공격 로그가 없습니다.");
    expect(attack.directHits).toBe(1);
  });

  it("한 행동의 큰 초과분도 반격 한 번과 위협 99만 남긴다", () => {
    const result = runTrackingBattle({
      initialThreat: 99,
      player: { ...basePlayer, atk: 500_000 },
      enemy: { ...trackingWeapon, hp: 1_000_000, def: 0 },
    });

    expect(result.finalState.bossMechanic).toMatchObject({
      trackingThreat: 99,
      trackingCounterCount: 1,
    });
    expect(eliminationLogs(result)).toHaveLength(2);
  });

  it("일반 보호막이 추적 섬멸을 기존 물리 공격처럼 흡수한다", () => {
    const result = runTrackingBattle({
      initialThreat: 100,
      player: { ...basePlayer, bulwarkShield: 2_000 },
    });

    expect(result.finalState.playerHp).toBe(basePlayer.maxHp);
    expect(trackingState(result).trackingCounterDamage).toBe(0);
    expect(eliminationLogs(result)).toHaveLength(2);
  });

  it("적 행동 중 반사 피해도 피해량 비례 추적으로 다음 행동까지 유지한다", () => {
    const enemy = {
      ...trackingWeapon,
      hp: 1_000_000,
      spd: 100,
      directActionSpd: true,
    };
    const plain = runTrackingBattle({
      initialThreat: 0,
      enemy,
      maxTurns: 2,
      player: { ...basePlayer, hp: 10_000, maxHp: 10_000 },
    });
    vi.restoreAllMocks();
    const reflected = runTrackingBattle({
      initialThreat: 0,
      enemy,
      maxTurns: 2,
      player: {
        ...basePlayer,
        hp: 10_000,
        maxHp: 10_000,
        thornsPct: 2_000,
      },
    });

    expect(trackingState(reflected).trackingThreat).toBeGreaterThan(
      trackingState(plain).trackingThreat,
    );
  });

  it("HP 스냅샷에 현재 추적 게이지를 적 자원으로 남긴다", () => {
    const result = runTrackingBattle({ initialThreat: 20 });
    const snapshot = result.finalState.log.findLast(
      (entry) => entry.kind === "hp_bar",
    );

    expect(snapshot?.enemySignatureResources?.trackingThreat).toBe("24/100");
  });

  it("추적 설정이 없는 전투에는 상태와 추적 로그를 만들지 않는다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const result = resolveBattle(basePlayer, trackingWeapon, "일반 대상", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
      maxTurns: 1,
    });

    expect(result.finalState.bossMechanic).toBeUndefined();
    expect(result.finalState.log.some((entry) => entry.text.includes("추적 +")))
      .toBe(false);
  });
});
