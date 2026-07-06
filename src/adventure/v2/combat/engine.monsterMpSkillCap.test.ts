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
});
