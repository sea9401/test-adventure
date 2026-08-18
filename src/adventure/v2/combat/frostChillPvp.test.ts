import { afterEach, describe, expect, it, vi } from "vitest";
import type { SignatureEffect } from "@/adventure/data/v2/v2Equipment";
import type { V2SkillsState } from "@/adventure/data/v2/v2Skills";
import {
  castV2SkillOnAttackerTurnPvP,
  initialBattleStatePvP,
  type PvPBattleState,
} from "./engine-pvp";
import type { PlayerCombat } from "./engine";

const player: PlayerCombat = {
  hp: 100_000,
  maxHp: 100_000,
  mp: 10_000,
  maxMp: 1_000,
  intStat: 100,
  atk: 100,
  magicAtk: 100,
  def: 0,
  magicDef: 0,
  spd: 100,
  evasionPct: 0,
  accuracyPct: 100,
  attackCount: 1,
  classTier: 5,
};

const absoluteZero: V2SkillsState = {
  learned: ["v2c_cryomancer_absolutezero"],
  equipped: ["v2c_cryomancer_absolutezero"],
};

function state(
  p1: PlayerCombat = player,
  p2: PlayerCombat = player,
  damageMultiplier?: number,
  p2Skills: V2SkillsState = { learned: [], equipped: [] },
): PvPBattleState {
  return initialBattleStatePvP(
    p1,
    p2,
    "빙결 시전자",
    "대상",
    absoluteZero,
    p2Skills,
    damageMultiplier,
  );
}

function freezeDamage(result: ReturnType<typeof castV2SkillOnAttackerTurnPvP>) {
  const line = result.state.log.find((entry) => entry.text.startsWith("빙결! "));
  const match = line?.text.match(/ (\d+) 피해/);
  return match ? Number(match[1]) : 0;
}

afterEach(() => vi.restoreAllMocks());

describe("PvP 한기·빙결", () => {
  it("상대에게 0 → 3 → 빙결 → 0으로 누적하고 기본 지연을 반환한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const first = castV2SkillOnAttackerTurnPvP(state(), "p1");
    const second = castV2SkillOnAttackerTurnPvP(first.state, "p1");

    expect(first.state.p2.stacks.frostChillStacks).toBe(3);
    expect(first.enemyDelayPct).toBe(0);
    expect(second.state.p2.stacks.frostChillStacks).toBe(0);
    expect(second.enemyDelayPct).toBe(30);
    expect(freezeDamage(second)).toBeGreaterThan(0);
  });

  it("빙점 지배는 직업 검사 없이 빙결 피해와 지연을 강화한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const ready = state();
    ready.p2.stacks.frostChillStacks = 2;
    const plain = castV2SkillOnAttackerTurnPvP(ready, "p1");
    const masteredReady = state({ ...player, freezeDamagePct: 50, freezeDelayPct: 40 });
    masteredReady.p2.stacks.frostChillStacks = 2;
    const masteredCast = castV2SkillOnAttackerTurnPvP(masteredReady, "p1");

    expect(plain.enemyDelayPct).toBe(30);
    expect(masteredCast.enemyDelayPct).toBe(40);
    expect(freezeDamage(masteredCast)).toBe(Math.round(freezeDamage(plain) * 1.5));
  });

  it("PvP 최종 피해 배율을 빙결 추가타에도 한 번 적용한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const normalReady = state();
    normalReady.p2.stacks.frostChillStacks = 2;
    const arenaReady = state(player, player, 0.65);
    arenaReady.p2.stacks.frostChillStacks = 2;
    const normal = castV2SkillOnAttackerTurnPvP(normalReady, "p1");
    const arena = castV2SkillOnAttackerTurnPvP(arenaReady, "p1");

    expect(freezeDamage(arena)).toBe(Math.floor(freezeDamage(normal) * 0.65));
  });

  it("보장 회피는 직접 피해와 한기를 함께 막는다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const result = castV2SkillOnAttackerTurnPvP(
      state(player, { ...player, guaranteedEvades: 1 }),
      "p1",
    );

    expect(result.state.p2.stacks.frostChillStacks).toBeUndefined();
    expect(result.state.p2.stacks.evadesRemaining).toBe(0);
    expect(result.enemyDelayPct).toBe(0);
  });

  it("상태이상 1회 방어는 직접 피해를 남기고 한기만 차단한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const signature: SignatureEffect = {
      trigger: "status_block_once",
      label: "시험 정화",
      statusBlockOnce: true,
    };
    const start = state(player, { ...player, equipSignatures: [signature] });
    const result = castV2SkillOnAttackerTurnPvP(start, "p1");

    expect(result.state.p2.hp).toBeLessThan(start.p2.hp);
    expect(result.state.p2.flags.statusBlockUsed).toBe(true);
    expect(result.state.p2.stacks.frostChillStacks).toBeUndefined();
    expect(result.state.log.some((entry) => entry.text.includes("[시험 정화]"))).toBe(true);
  });

  it("정화결계도 직접 피해를 남기고 한기만 차단한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const start = state(player, player, undefined, {
      learned: ["v2c_grandwarder_tripleward"],
      equipped: ["v2c_grandwarder_tripleward"],
    });
    const result = castV2SkillOnAttackerTurnPvP(start, "p1");

    expect(result.state.p2.hp).toBeLessThan(start.p2.hp);
    expect(result.state.p2.stacks.tripleWard.purification).toBe(0);
    expect(result.state.p2.stacks.frostChillStacks).toBeUndefined();
    expect(result.state.log.some((entry) => entry.text.includes("[정화결계]"))).toBe(true);
  });
});
