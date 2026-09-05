import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return { ...actual, V2_CORE_LOOP_V2: true };
});

import type { Monster } from "@/adventure/data/monsters";
import type { SignatureEffect } from "@/adventure/data/v2/v2Equipment";
import type { V2SkillsState } from "@/adventure/data/v2/v2Skills";
import {
  resolveBattle,
  type BattleResolution,
  type PlayerCombat,
} from "./engine";

const basePlayer: PlayerCombat = {
  hp: 1_000_000,
  maxHp: 1_000_000,
  atk: 1,
  def: 0,
  spd: 25,
  evasionPct: 0,
  attackCount: 1,
  accuracyPct: 100,
};

function glacialMonster(options?: {
  spd?: number;
  directActionSpd?: boolean;
}): Monster {
  return {
    name: "빙하 거수",
    tags: ["golem"],
    hp: 1_000_000,
    atk: 100,
    def: 100,
    spd: options?.spd ?? 40,
    directActionSpd: options?.directActionSpd ?? true,
    accuracy: 100,
    evasionPct: 0,
    exp: 0,
  };
}

afterEach(() => vi.restoreAllMocks());

function runGlacialBattle(options?: {
  mechanic?: boolean;
  player?: PlayerCombat;
  enemy?: Monster;
  maxTurns?: number;
  pickAction?: Parameters<typeof resolveBattle>[3]["pickAction"];
  v2Skills?: V2SkillsState;
}): BattleResolution {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  return resolveBattle(
    options?.player ?? basePlayer,
    options?.enemy ?? glacialMonster(),
    "빙결 대상",
    {
      pickAction: options?.pickAction ?? (() => ({ kind: "attack" })),
      potions: {},
      isBoss: true,
      maxTurns: options?.maxTurns ?? 2,
      v2Skills: options?.v2Skills,
      ...(options?.mechanic === false
        ? {}
        : { bossMechanic: { kind: "glacial_colossus" as const } }),
    },
  );
}

function playerAttackTicks(result: BattleResolution): number[] {
  return result.finalState.log
    .filter(
      (entry) =>
        entry.kind === "player_attack" && entry.text.startsWith("공격!"),
    )
    .map((entry) => entry.t ?? -1);
}

describe("glacial colossus ATB mechanic", () => {
  it("100틱마다 액터 행동을 소비하지 않고 혹한의 전장 한기를 쌓는다", () => {
    const result = runGlacialBattle({
      enemy: glacialMonster({ spd: 1, directActionSpd: true }),
      maxTurns: 2,
    });
    const fieldLogs = result.finalState.log.filter((entry) =>
      entry.text.startsWith("[혹한의 전장]"),
    );

    expect(fieldLogs.map((entry) => entry.t)).toEqual([100, 200]);
    expect(fieldLogs.map((entry) => entry.text)).toEqual([
      "[혹한의 전장] 한기 +1 · 현재 1/10",
      "[혹한의 전장] 한기 +1 · 현재 2/10",
    ]);
    expect(
      result.finalState.log.filter((entry) => entry.kind === "player_attack"),
    ).toHaveLength(2);
  });

  it("같은 100틱이면 혹한의 전장을 플레이어 행동보다 먼저 처리한다", () => {
    const result = runGlacialBattle({
      player: { ...basePlayer, spd: 100 },
      enemy: glacialMonster({ spd: 1, directActionSpd: true }),
      maxTurns: 2,
    });
    const atTick100 = result.finalState.log.filter((entry) => entry.t === 100);
    const fieldIndex = atTick100.findIndex((entry) =>
      entry.text.startsWith("[혹한의 전장]"),
    );
    const playerIndex = atTick100.findIndex(
      (entry) => entry.kind === "player_attack",
    );

    expect(fieldIndex).toBeGreaterThanOrEqual(0);
    expect(playerIndex).toBeGreaterThanOrEqual(0);
    expect(fieldIndex).toBeLessThan(playerIndex);
  });

  it("보호막과 상태 방어는 혹한의 전장 한기를 막거나 소비되지 않는다", () => {
    const statusBlock: SignatureEffect = {
      trigger: "status_block_once",
      label: "시험 정화",
      statusBlockOnce: true,
    };
    const result = runGlacialBattle({
      player: {
        ...basePlayer,
        bulwarkShield: 100_000,
        equipSignatures: [statusBlock],
      },
      enemy: glacialMonster({ spd: 1, directActionSpd: true }),
      maxTurns: 2,
      v2Skills: {
        learned: ["v2c_grandwarder_tripleward"],
        equipped: ["v2c_grandwarder_tripleward"],
      },
    });

    expect(result.finalState.bossMechanic).toMatchObject({
      glacialChillStacks: 2,
    });
    expect(result.finalState.flags.statusBlockUsed).toBe(false);
    expect(result.finalState.stacks.tripleWard.purification).toBe(1);
  });

  it("빙결 예약 중 필드 한기를 건너뛰고 다음 주기부터 다시 누적한다", () => {
    const result = runGlacialBattle({
      enemy: glacialMonster({ spd: 83, directActionSpd: true }),
      maxTurns: 3,
    });
    const fieldTicks = result.finalState.log
      .filter((entry) => entry.text.startsWith("[혹한의 전장]"))
      .map((entry) => entry.t);

    expect(result.finalState.log).toContainEqual(
      expect.objectContaining({
        text: "[빙결] 다음 행동이 봉쇄된다.",
        t: 400,
      }),
    );
    expect(fieldTicks).not.toContain(500);
    expect(fieldTicks).toContain(600);
  });

  it("보스 행동은 냉기장과 실제 HP 피해로 한기를 두 번 쌓는다", () => {
    const result = runGlacialBattle();

    expect(result.finalState.bossMechanic).toMatchObject({
      kind: "glacial_colossus",
      glacialChillStacks: 4,
      glacialFreezePending: 0,
    });
    expect(
      result.finalState.log.some((entry) =>
        entry.text.includes("[한기] +2 · 현재 3/10"),
      ),
    ).toBe(true);
  });

  it("일반 보호막이 HP 피해를 전부 막으면 냉기장 한기만 쌓는다", () => {
    const result = runGlacialBattle({
      player: { ...basePlayer, bulwarkShield: 100_000 },
    });

    expect(result.finalState.bossMechanic).toMatchObject({
      glacialChillStacks: 3,
    });
    expect(
      result.finalState.log.some((entry) =>
        entry.text.includes("[한기] +1 · 현재 2/10"),
      ),
    ).toBe(true);
  });

  it("한 행동의 다단 공격도 피격 한기는 한 번만 추가한다", () => {
    const result = runGlacialBattle({
      enemy: { ...glacialMonster(), bonusAttackChancePct: 200 },
    });

    expect(
      result.finalState.log.filter(
        (entry) => entry.kind === "enemy_attack",
      ),
    ).toHaveLength(3);
    expect(result.finalState.bossMechanic).toMatchObject({
      glacialChillStacks: 4,
    });
    expect(
      result.finalState.log.filter((entry) =>
        entry.text.includes("[한기] +2 · 현재 3/10"),
      ),
    ).toHaveLength(1);
  });

  it("상태이상 1회 방어가 피격 한기만 막고 정화결계보다 먼저 소비된다", () => {
    const statusBlock: SignatureEffect = {
      trigger: "status_block_once",
      label: "시험 정화",
      statusBlockOnce: true,
    };
    const result = runGlacialBattle({
      player: { ...basePlayer, equipSignatures: [statusBlock] },
      v2Skills: {
        learned: ["v2c_grandwarder_tripleward"],
        equipped: ["v2c_grandwarder_tripleward"],
      },
    });

    expect(result.finalState.bossMechanic).toMatchObject({
      glacialChillStacks: 3,
    });
    expect(result.finalState.flags.statusBlockUsed).toBe(true);
    expect(result.finalState.stacks.tripleWard.purification).toBe(1);
    expect(
      result.finalState.log.some((entry) =>
        entry.text.includes("[시험 정화] 상태이상을 막았다"),
      ),
    ).toBe(true);
  });

  it("정화결계는 실제 피격의 추가 한기만 한 번 막는다", () => {
    const result = runGlacialBattle({
      v2Skills: {
        learned: ["v2c_grandwarder_tripleward"],
        equipped: ["v2c_grandwarder_tripleward"],
      },
    });

    expect(result.finalState.bossMechanic).toMatchObject({
      glacialChillStacks: 3,
    });
    expect(result.finalState.stacks.tripleWard.purification).toBe(0);
    expect(
      result.finalState.log.some((entry) =>
        entry.text.includes("[정화결계] 상태이상을 막았다. (0회 남음)"),
      ),
    ).toBe(true);
  });

  it("9중첩에서 냉기장만으로 빙결하면 피격 방어를 소비하지 않는다", () => {
    const statusBlock: SignatureEffect = {
      trigger: "status_block_once",
      label: "시험 정화",
      statusBlockOnce: true,
    };
    const result = runGlacialBattle({
      player: {
        ...basePlayer,
        bulwarkShield: 900,
        equipSignatures: [statusBlock],
      },
      enemy: glacialMonster({ spd: 0, directActionSpd: false }),
      maxTurns: 20,
    });
    const freezeLogIndex = result.finalState.log.findIndex((entry) =>
      entry.text.includes("[빙결] 다음 행동이 봉쇄된다"),
    );
    const blockLogIndex = result.finalState.log.findIndex((entry) =>
      entry.text.includes("[시험 정화] 상태이상을 막았다"),
    );

    expect(freezeLogIndex).toBeGreaterThanOrEqual(0);
    expect(
      blockLogIndex === -1 || blockLogIndex > freezeLogIndex,
    ).toBe(true);
  });

  it("보호막 파괴 정화는 기존 한기를 지운 뒤 현재 행동의 한기만 다시 받는다", () => {
    const battleStartShield: SignatureEffect = {
      trigger: "battle_start",
      label: "빙호수호",
      battleStartShieldPctMaxHp: 8,
    };
    const trackedCleanse: SignatureEffect = {
      trigger: "tracked_shield_break",
      label: "빙호 해방",
      trackedShieldPctMaxHp: 8,
      cleanseHarmfulStatuses: true,
      damageTakenReductionPct: 15,
      buffActions: 2,
    };
    const result = runGlacialBattle({
      player: {
        ...basePlayer,
        hp: 1_000,
        maxHp: 1_000,
        bulwarkShield: 200,
        equipSignatures: [battleStartShield, trackedCleanse],
      },
      maxTurns: 4,
    });

    const cleanse = result.finalState.log.find((entry) =>
      entry.text.includes("[빙호 해방] 해로운 상태를 정화"),
    );
    expect(cleanse?.t).toBeTypeOf("number");
    expect(
      result.finalState.log.some(
        (entry) =>
          entry.t === cleanse?.t &&
          entry.text.includes("[한기] +2 · 현재 2/10"),
      ),
    ).toBe(true);
    expect(result.finalState.bossMechanic).toMatchObject({
      glacialFreezePending: 0,
    });
  });

  it("새 한기는 이미 예약된 다음 플레이어 공격을 즉시 늦춘다", () => {
    const plain = runGlacialBattle({ mechanic: false });
    vi.restoreAllMocks();
    const glacial = runGlacialBattle();

    expect(playerAttackTicks(plain)).toEqual([0, 200]);
    expect(playerAttackTicks(glacial)[1]).toBeGreaterThan(200);
    expect(
      glacial.finalState.log.some(
        (entry) =>
          entry.kind === "hp_bar" &&
          entry.enemySignatureResources?.glacialChill === "1/10",
      ),
    ).toBe(true);
  });

  it("10중첩 빙결은 매번 다음 플레이어 행동을 정확히 한 번 취소한다", () => {
    const pickAction = vi.fn(() => ({ kind: "attack" as const }));
    const result = runGlacialBattle({
      pickAction,
      enemy: glacialMonster({ spd: 2, directActionSpd: false }),
      maxTurns: 8,
    });

    expect(result.finalState.bossMechanic).toMatchObject({
      kind: "glacial_colossus",
      glacialFreezeCount: 4,
      glacialSkippedActionCount: 4,
      glacialFreezePending: 0,
    });
    expect(
      result.finalState.log.filter((entry) =>
        entry.text.includes("몸이 얼어붙어 행동할 수 없다"),
      ),
    ).toHaveLength(4);
    expect(
      result.finalState.log.filter(
        (entry) =>
          entry.text ===
          "[한기 10/10] 한기가 한계에 도달해 다음 행동이 봉쇄된다.",
      ),
    ).toHaveLength(4);
    expect(pickAction).toHaveBeenCalledTimes(result.turns);
    expect(result.finalState.turn.completedPlayerTurns).toBe(result.turns);
  });

  it("혹한의 전장이 한기 4와 7에 도달하면 단계별 전조를 남긴다", () => {
    const result = runGlacialBattle({
      enemy: glacialMonster({ spd: 1, directActionSpd: true }),
      maxTurns: 4,
    });
    const warnings = result.finalState.log.filter(
      (entry) =>
        entry.text.includes("냉기장이 짙어지며") ||
        entry.text.includes("온몸에 서리가 번져"),
    );

    expect(warnings).toEqual([
      expect.objectContaining({
        text: "[한기 4/10] 냉기장이 짙어지며 움직임이 무거워진다.",
        t: 400,
      }),
      expect.objectContaining({
        text: "[한기 7/10] 온몸에 서리가 번져 움직임을 붙잡는다.",
        t: 700,
      }),
    ]);
  });

  it("빙결 예약 중 보스가 여러 번 행동해도 한기와 빙결을 더 쌓지 않는다", () => {
    const result = runGlacialBattle({
      enemy: glacialMonster({ spd: 1, directActionSpd: false }),
      maxTurns: 7,
    });
    const freezeLogIndex = result.finalState.log.findIndex((entry) =>
      entry.text.includes("[빙결] 다음 행동이 봉쇄된다"),
    );
    const skipLogIndex = result.finalState.log.findIndex((entry) =>
      entry.text.includes("몸이 얼어붙어 행동할 수 없다"),
    );
    const pendingEntries = result.finalState.log.slice(
      freezeLogIndex + 1,
      skipLogIndex,
    );

    expect(freezeLogIndex).toBeGreaterThanOrEqual(0);
    expect(skipLogIndex).toBeGreaterThan(freezeLogIndex);
    expect(
      pendingEntries.filter((entry) => entry.kind === "enemy_attack").length,
    ).toBeGreaterThan(0);
    expect(
      pendingEntries.some(
        (entry) =>
          entry.text.includes("[한기] +") ||
          entry.text.includes("[혹한의 전장]") ||
          entry.text.includes("[빙결] 다음 행동이 봉쇄된다"),
      ),
    ).toBe(false);
  });

  it("빙결 취소 틱에는 재생과 자동 행동 등 플레이어 행동 효과가 발동하지 않는다", () => {
    const pickAction = vi.fn(() => ({ kind: "attack" as const }));
    const result = runGlacialBattle({
      pickAction,
      player: {
        ...basePlayer,
        hp: 900_000,
        regen: { interval: 1, amount: 1_000 },
      },
      enemy: glacialMonster({ spd: 0, directActionSpd: false }),
      maxTurns: 7,
    });
    const skip = result.finalState.log.find((entry) =>
      entry.text.includes("몸이 얼어붙어 행동할 수 없다"),
    );
    const sameTick = result.finalState.log.filter(
      (entry) => entry.t === skip?.t,
    );

    expect(skip?.t).toBeTypeOf("number");
    expect(sameTick.some((entry) => entry.text.includes("[재생]"))).toBe(
      false,
    );
    expect(
      sameTick.some((entry) => entry.kind === "player_attack"),
    ).toBe(false);
    expect(pickAction).toHaveBeenCalledTimes(result.turns);
  });

  it("보스 행동으로 플레이어가 쓰러지면 한기를 추가하지 않는다", () => {
    const result = runGlacialBattle({
      player: { ...basePlayer, hp: 50, maxHp: 50 },
      enemy: { ...glacialMonster(), atk: 10_000 },
      maxTurns: 10,
    });

    expect(result.outcome).toBe("lose");
    expect(result.finalState.bossMechanic).toMatchObject({
      glacialChillStacks: 1,
      glacialFreezeCount: 0,
    });
    expect(
      result.finalState.log.some(
        (entry) => entry.text === "[혹한의 전장] 한기 +1 · 현재 1/10",
      ),
    ).toBe(true);
    expect(
      result.finalState.log.some((entry) => entry.text.includes("[한기] +")),
    ).toBe(false);
  });

  it("반사로 보스가 쓰러지면 한기와 빙결을 추가하지 않는다", () => {
    const result = runGlacialBattle({
      player: { ...basePlayer, thornsPct: 10_000 },
      enemy: { ...glacialMonster(), hp: 50 },
      maxTurns: 10,
    });

    expect(result.outcome).toBe("win");
    expect(result.finalState.bossMechanic).toMatchObject({
      glacialChillStacks: 1,
      glacialFreezeCount: 0,
    });
    expect(
      result.finalState.log.some(
        (entry) => entry.text === "[혹한의 전장] 한기 +1 · 현재 1/10",
      ),
    ).toBe(true);
    expect(
      result.finalState.log.some((entry) => entry.text.includes("[한기] +")),
    ).toBe(false);
  });

  it("기믹 설정이 없는 같은 전투에는 빙하 거수 상태를 만들지 않는다", () => {
    const result = runGlacialBattle({ mechanic: false });

    expect(result.finalState.bossMechanic).toBeUndefined();
    expect(
      result.finalState.log.some(
        (entry) =>
          entry.text.includes("[한기] +") ||
          entry.text.includes("[혹한의 전장]") ||
          entry.text.includes("[빙결]"),
      ),
    ).toBe(false);
  });
});
