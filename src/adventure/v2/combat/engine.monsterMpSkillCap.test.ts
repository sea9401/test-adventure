// 몬스터 MP 게이트 — v2Skills 장착 + 유한 v2MaxMp 인 몹은 MP 소진(전투 내 재생 없음)까지만
//   시그니처 액티브를 시전하고, 이후 평타로 폴백한다. ATB(라이브) 엔진의 적 v2 cast 배선
//   (applyEnemyV2SkillCast)이 실제로 발동하는지 + MP 가 시전 횟수를 캡하는지 회귀 가드.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return { ...actual, V2_CORE_LOOP_V2: true, V2_ATB_SKILLS: true };
});

import type { Monster } from "@/adventure/data/monsters";
import {
  applyEnemyV2SkillCast,
  initialBattleState,
  resolveBattle,
  type BattleResolution,
  type PlayerCombat,
} from "@/adventure/v2/combat/engine";

afterEach(() => vi.restoreAllMocks());

// 안 죽는 샌드백 플레이어 — 둘 다 못 죽여 전투가 tick cap 까지 가도록(적 행동 기회 충분).
const player: PlayerCombat = {
  hp: 1_000_000,
  maxHp: 1_000_000,
  atk: 1,
  def: 0,
  spd: 5,
  evasionPct: 0,
  attackCount: 1,
  accuracyPct: 100,
  maxMp: 0,
  mp: 0,
};

function countText(res: BattleResolution, needle: string): number {
  return res.finalState.log.filter(
    (e) =>
      typeof (e as { text?: string }).text === "string" &&
      (e as { text: string }).text.includes(needle),
  ).length;
}

function runWithPlayer(combatant: PlayerCombat, enemy: Monster): BattleResolution {
  // 항상 proc(0.1×100=10 < procChance 60) + 결정론. 플레이어는 스킬 없음(평타만).
  vi.spyOn(Math, "random").mockReturnValue(0.1);
  const res = resolveBattle(combatant, enemy, "테스터", {
    pickAction: () => ({ kind: "attack" }),
    potions: {},
    v2Skills: { learned: [], equipped: [] },
  } as never);
  vi.restoreAllMocks();
  return res;
}

function run(enemy: Monster): BattleResolution {
  return runWithPlayer(player, enemy);
}

describe("몬스터 MP 시전 횟수 제한 (ATB applyEnemyV2SkillCast)", () => {
  it("v2MaxMp 60 / 분쇄 일격(mpCost 30) → 정확히 2회 시전 후 MP 소진(평타 폴백)", () => {
    const enemy: Monster = {
      name: "정예 시험체",
      tags: [],
      hp: 1_000_000,
      atk: 50,
      def: 0,
      spd: 30,
      exp: 0,
      evasionPct: 0,
      v2Skills: {
        learned: ["mob_crushing_blow"],
        equipped: ["mob_crushing_blow"],
      },
      v2MaxMp: 60,
    };
    // MP 60 / mpCost 30 = 2회. 이후 MP 부족(0 < 30)으로 시전 불가 → 평타.
    expect(countText(run(enemy), "분쇄 일격")).toBe(2);
  });

  it("v2MaxMp 30 → 1회만 시전(MP 정확히 1회분)", () => {
    const enemy: Monster = {
      name: "정예 시험체2",
      tags: [],
      hp: 1_000_000,
      atk: 50,
      def: 0,
      spd: 30,
      exp: 0,
      evasionPct: 0,
      v2Skills: {
        learned: ["mob_crushing_blow"],
        equipped: ["mob_crushing_blow"],
      },
      v2MaxMp: 30,
    };
    expect(countText(run(enemy), "분쇄 일격")).toBe(1);
  });

  it("v2Skills 미장착 몹은 시전 0 (기존 전투 byte-identical 가드)", () => {
    const enemy: Monster = {
      name: "평범한 몹",
      tags: [],
      hp: 1_000_000,
      atk: 50,
      def: 0,
      spd: 30,
      exp: 0,
      evasionPct: 0,
    };
    expect(countText(run(enemy), "분쇄 일격")).toBe(0);
  });

  it("몬스터 v2 스킬 피해에도 피격 반격 패시브가 발동한다", () => {
    const counterPlayer: PlayerCombat = {
      ...player,
      atk: 25,
      passiveCounterChancePct: 100,
    };
    const enemy: Monster = {
      name: "정예 반격 시험체",
      tags: [],
      hp: 1_000_000,
      atk: 50,
      def: 0,
      spd: 30,
      exp: 0,
      evasionPct: 0,
      v2Skills: {
        learned: ["mob_crushing_blow"],
        equipped: ["mob_crushing_blow"],
      },
      v2MaxMp: 30,
    };

    const res = runWithPlayer(counterPlayer, enemy);

    expect(countText(res, "분쇄 일격")).toBe(1);
    expect(countText(res, "[반격] 정예 반격 시험체에게")).toBeGreaterThan(0);
  });

  it("몬스터 직접 피해 스킬의 일반 회피 경감이 on_dodge 장비를 한 번 발동한다", () => {
    const reactivePlayer: PlayerCombat = {
      ...player,
      hp: 1_000,
      maxHp: 1_000,
      evasionPct: 100,
      evaRating: 100,
      equipSignatures: [
        { trigger: "on_dodge", label: "해연", healPct: 6 },
      ],
    };
    const enemy: Monster = {
      name: "정예 경감 시험체",
      tags: [],
      hp: 10_000,
      atk: 100,
      def: 0,
      spd: 30,
      accuracy: 0,
      exp: 0,
      evasionPct: 0,
      v2Skills: {
        learned: ["mob_crushing_blow"],
        equipped: ["mob_crushing_blow"],
      },
      v2MaxMp: 30,
    };
    const state = {
      ...initialBattleState(reactivePlayer, enemy, "그림자"),
      playerHp: 500,
    };
    const random = vi.spyOn(Math, "random").mockReturnValue(0);

    const cast = applyEnemyV2SkillCast(state, reactivePlayer);

    const damageLog = cast.state.log.find(
      (entry) =>
        entry.text.includes("분쇄 일격!") && entry.text.includes("피해를 입혔다"),
    );
    const damage = Number(damageLog?.text.match(/(\d+) 피해/)?.[1]);
    expect(cast.castFired).toBe(true);
    expect(damage).toBeGreaterThan(0);
    expect(cast.state.playerHp).toBe(500 - damage + 60);
    expect(cast.state.log.some((entry) => entry.text.includes("회피 경감"))).toBe(true);
    expect(cast.state.log.filter((entry) => entry.text.includes("[해연]")).length).toBe(1);
    expect(random).toHaveBeenCalledTimes(2); // 스킬 proc 1회 + 회피 반응 1회
  });

  it("그림자 도약의 보장 회피는 몬스터의 다음 직접 피해 스킬도 막는다", () => {
    const guardedPlayer: PlayerCombat = {
      ...player,
      hp: 1_000,
      maxHp: 1_000,
      guaranteedEvades: 1,
      equipSignatures: [
        { trigger: "on_dodge", label: "해연", healPct: 6 },
      ],
    };
    const enemy: Monster = {
      name: "정예 회피 시험체",
      tags: [],
      hp: 10_000,
      atk: 100,
      def: 0,
      spd: 30,
      exp: 0,
      evasionPct: 0,
      v2Skills: {
        learned: ["mob_crushing_blow"],
        equipped: ["mob_crushing_blow"],
      },
      v2MaxMp: 30,
    };
    const state = initialBattleState(guardedPlayer, enemy, "그림자");
    const random = vi.spyOn(Math, "random").mockReturnValue(0.1);

    const cast = applyEnemyV2SkillCast(state, guardedPlayer);

    expect(cast.castFired).toBe(true);
    expect(cast.state.playerHp).toBe(state.playerHp);
    expect(cast.state.stacks.evadesRemaining).toBe(0);
    expect(
      cast.state.log.some(
        (entry) =>
          entry.text.includes("[회피 강화]") &&
          entry.text.includes("분쇄 일격"),
      ),
    ).toBe(true);
    expect(
      cast.state.log.some(
        (entry) =>
          entry.text.includes("분쇄 일격!") &&
          entry.text.includes("피해를 입혔다"),
      ),
    ).toBe(false);
    expect(random).toHaveBeenCalledTimes(1); // 스킬 proc만 굴리고 일반 회피 반응은 생략
  });

  it("ATB 몬스터 직접 피해 스킬에도 일반 받는 피해 감소를 적용한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const enemy: Monster = {
      name: "정예 경감 시험체",
      tags: [],
      hp: 10_000,
      atk: 100,
      def: 0,
      spd: 30,
      exp: 0,
      evasionPct: 0,
      v2Skills: {
        learned: ["mob_crushing_blow"],
        equipped: ["mob_crushing_blow"],
      },
      v2MaxMp: 30,
    };
    const plainPlayer: PlayerCombat = {
      ...player,
      hp: 1_000,
      maxHp: 1_000,
    };
    const reducedPlayer: PlayerCombat = {
      ...plainPlayer,
      passiveDamageTakenReductionPct: 20,
    };
    const plainState = initialBattleState(plainPlayer, enemy, "일반");
    const reducedState = initialBattleState(reducedPlayer, enemy, "경감");

    const plainAfter = applyEnemyV2SkillCast(plainState, plainPlayer).state;
    const reducedAfter = applyEnemyV2SkillCast(
      reducedState,
      reducedPlayer,
    ).state;
    const plainDamage = plainState.playerHp - plainAfter.playerHp;
    const reducedDamage = reducedState.playerHp - reducedAfter.playerHp;

    expect(reducedDamage).toBe(Math.floor(plainDamage * 0.8));
  });

  it("받는 피해 감소가 있어도 몬스터의 비피해 스킬은 피해를 주지 않는다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const defender: PlayerCombat = {
      ...player,
      hp: 1_000,
      maxHp: 1_000,
      passiveDamageTakenReductionPct: 20,
    };
    const enemy: Monster = {
      name: "포효 시험체",
      tags: [],
      hp: 10_000,
      atk: 100,
      def: 0,
      spd: 30,
      exp: 0,
      evasionPct: 0,
      v2Skills: {
        learned: ["mob_savage_roar"],
        equipped: ["mob_savage_roar"],
      },
      v2MaxMp: 25,
    };
    const state = initialBattleState(defender, enemy, "경감");

    const cast = applyEnemyV2SkillCast(state, defender);

    expect(cast.castFired).toBe(true);
    expect(cast.state.playerHp).toBe(state.playerHp);
  });
});
