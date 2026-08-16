// PR-B — V2_ATB_SKILLS on 일 때 ATB(라이브 PvE) 전투에서 플레이어 v2 액티브 스킬이 시전되는지.
//   플래그 off(기본)는 combatAtb.test 가 byte-identical 로 커버한다(여기선 on 동작만 락).
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return { ...actual, V2_CORE_LOOP_V2: true, V2_ATB_SKILLS: true };
});

import type { Monster } from "@/adventure/data/monsters";
import {
  resolveBattle,
  type BattleResolution,
  type PlayerCombat,
} from "@/adventure/v2/combat/engine";

afterEach(() => vi.restoreAllMocks());

const SKILL = "v2c_warrior_flurry"; // 난격 (3타 데미지, procChance 40, mpCost 26)

const player: PlayerCombat = {
  hp: 300, maxHp: 300, atk: 30, def: 6, spd: 30,
  evasionPct: 0, attackCount: 1, accuracyPct: 100,
  maxMp: 100000, mp: 100000, // 사실상 무한 MP — MP 고갈로 평타 폴백되는 경우 배제(XOR 검증용)
};

function run(enemy: Monster, randomValue: number): BattleResolution {
  return runWithSkill(enemy, randomValue, SKILL);
}

function runWithSkill(
  enemy: Monster,
  randomValue: number,
  skillId: string,
): BattleResolution {
  vi.spyOn(Math, "random").mockReturnValue(randomValue);
  const res = resolveBattle(player, enemy, "테스터", {
    pickAction: () => ({ kind: "attack" }),
    potions: {},
    v2Skills: { learned: [skillId], equipped: [skillId] },
  } as never);
  vi.restoreAllMocks();
  return res;
}

function countText(res: BattleResolution, needle: string): number {
  return res.finalState.log.filter(
    (e) =>
      typeof (e as { text?: string }).text === "string" &&
      (e as { text: string }).text.includes(needle),
  ).length;
}

describe("PR-B: V2_ATB_SKILLS on → ATB 스킬 시전", () => {
  it("회피 회복 장비는 스킬 행동 시작에도 한 번 발동한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const recoveringPlayer: PlayerCombat = {
      ...player,
      hp: 200,
      maxHp: 400,
      evaRating: 100,
      evasionPct: 100,
      equipSignatures: [
        {
          trigger: "on_action_evasion",
          label: "봉인",
          lostHpHealPct: 4,
        },
      ],
    };
    const enemy: Monster = {
      name: "허수아비",
      tags: [],
      hp: 120,
      atk: 1,
      def: 3,
      spd: 6,
      exp: 0,
      evasionPct: 0,
      accuracy: 0,
    };

    const res = resolveBattle(recoveringPlayer, enemy, "테스터", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
      v2Skills: { learned: [SKILL], equipped: [SKILL] },
    } as never);

    const recoveryTicks = new Set(
      res.finalState.log
        .filter((entry) => entry.text.includes("[봉인]"))
        .map((entry) => entry.t),
    );
    const skillTicks = res.finalState.log
      .filter((entry) => entry.text.includes("난격"))
      .map((entry) => entry.t);
    expect(recoveryTicks.size).toBeGreaterThan(0);
    expect(skillTicks.some((tick) => recoveryTicks.has(tick))).toBe(true);
  });

  it("난격이 ATB 전투에서 시전된다 (라이브 PvE 액티브 활성화)", () => {
    // 항상 proc(0.1×100=10 < 40) → 매 플레이어 행동이 시전. 적 HP 충분히 커서 여러 번 시전.
    const enemy: Monster = {
      name: "허수아비", tags: [], hp: 2000, atk: 4, def: 3, spd: 6, exp: 0, evasionPct: 0,
    };
    const res = run(enemy, 0.1);
    expect(countText(res, "난격")).toBeGreaterThan(0);
  });

  it("cast XOR 평타 — 매 행동이 시전이면 기본 '공격!' 평타가 0건이다", () => {
    const enemy: Monster = {
      name: "허수아비", tags: [], hp: 2000, atk: 4, def: 3, spd: 6, exp: 0, evasionPct: 0,
    };
    const res = run(enemy, 0.1); // 항상 proc → 모든 플레이어 행동이 시전(평타 대체)
    const basicAttacks = res.finalState.log.filter(
      (e) =>
        (e as { kind?: string }).kind === "player_attack" &&
        typeof (e as { text?: string }).text === "string" &&
        (e as { text: string }).text.includes("공격!"),
    ).length;
    expect(basicAttacks).toBe(0);
    expect(countText(res, "난격")).toBeGreaterThan(0);
  });

  it("시전으로 적 처치 시 정상 승리 종료(쓰러뜨렸다 + win)", () => {
    const enemy: Monster = {
      name: "허수아비", tags: [], hp: 120, atk: 4, def: 3, spd: 6, exp: 0, evasionPct: 0,
    };
    const res = run(enemy, 0.1);
    expect(res.outcome).toBe("win");
    // 시전 처치 승리 로그는 ATB 틱 t 가 찍혀야 한다(tagNewLogEntries 가 cast 분기 뒤에 한 번 →
    //   외톨이 박스 방지·Codex PR-B 리뷰 버그#1 회귀 가드).
    const winEntries = res.finalState.log.filter(
      (e) =>
        typeof (e as { text?: string }).text === "string" &&
        (e as { text: string }).text.includes("쓰러뜨렸다"),
    );
    expect(winEntries.length).toBeGreaterThan(0);
    for (const e of winEntries) {
      expect(typeof (e as { t?: number }).t).toBe("number");
    }
  });

  it("스탯 디버프 로그는 내부 영문 키 대신 한글 이름을 표시한다", () => {
    const enemy: Monster = {
      name: "허수아비", tags: [], hp: 2000, atk: 4, def: 3, spd: 6, exp: 0, evasionPct: 0,
    };
    const res = runWithSkill(enemy, 0.1, "v2c_warrior_sunder");

    expect(countText(res, "[파쇄 + 무력] 활력 -15% (대상 행동 3회)")).toBeGreaterThan(0);
    expect(countText(res, "VIT -15%")).toBe(0);
  });

  it("봉마진은 적 행동 3회를 보호하고 유지 중에는 다른 행동을 막지 않는다", () => {
    const enemy: Monster = {
      name: "봉쇄 허수아비",
      tags: [],
      hp: 100_000,
      atk: 1,
      def: 100,
      spd: 6,
      exp: 0,
      evasionPct: 0,
    };
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const res = resolveBattle(
      { ...player, spd: 100, atk: 1 },
      enemy,
      "테스터",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: {},
        v2Skills: {
          learned: ["v2c_spellsealer_sealingfield"],
          equipped: ["v2c_spellsealer_sealingfield"],
        },
      } as never,
    );
    vi.restoreAllMocks();

    expect(countText(res, "적 주는 피해 −12%")).toBeGreaterThan(1);
    expect(countText(res, "공격!")).toBeGreaterThan(0);
    expect(countText(res, "적 행동 3회")).toBeGreaterThan(0);
  });

  it("수호의 도발은 사냥에서 적의 다음 행동을 소모하지 않고 즉시 기본 공격 2회를 유도한다", () => {
    const enemy: Monster = {
      name: "도발 허수아비",
      tags: [],
      hp: 2_000,
      atk: 10,
      def: 0,
      spd: 10,
      exp: 0,
      evasionPct: 0,
      v2Skills: {
        learned: ["mob_venom_bite"],
        equipped: ["mob_venom_bite"],
      },
    };
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const res = resolveBattle(
      {
        ...player,
        hp: 5_000,
        maxHp: 5_000,
        atk: 1,
        def: 100,
        fortressImpactOnHit: true,
        fortressImpactDamagePctPerStack: 15,
      },
      enemy,
      "수호자",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: {},
        v2Skills: {
          learned: ["v2c_ironknight_guard", "v2c_warden_aegis"],
          equipped: ["v2c_ironknight_guard", "v2c_warden_aegis"],
        },
      } as never,
    );
    vi.restoreAllMocks();

    expect(countText(res, "즉시 기본 공격 2회")).toBeGreaterThan(0);
    const provokeIndex = res.finalState.log.findIndex((entry) =>
      entry.text.includes("즉시 기본 공격 2회"),
    );
    const provokeTick = res.finalState.log[provokeIndex]?.t;
    const immediateEnemyAttacks = res.finalState.log
      .slice(provokeIndex + 1)
      .filter(
        (entry) => entry.kind === "enemy_attack" && entry.t === provokeTick,
      );
    expect(immediateEnemyAttacks).toHaveLength(2);
    expect(
      immediateEnemyAttacks.every((entry) => entry.text.startsWith("공격!")),
    ).toBe(true);
    expect(
      res.finalState.log
        .slice(provokeIndex + 1)
        .filter(
          (entry) =>
            entry.t === provokeTick && entry.text.includes("[철벽 반사]"),
        ),
    ).toHaveLength(2);
    expect(
      res.finalState.log.some(
        (entry) => entry.t !== provokeTick && entry.text.includes("독니"),
      ),
    ).toBe(true);
  });

  it("철벽 태세는 3회 반사하고 충격 3스택 성채 충각은 적중 후 충격을 소비한다", () => {
    const enemy: Monster = {
      name: "성채 허수아비",
      tags: [],
      hp: 20_000,
      atk: 120,
      def: 20,
      spd: 25,
      exp: 0,
      evasionPct: 0,
    };
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const res = resolveBattle(
      {
        ...player,
        hp: 10_000,
        maxHp: 10_000,
        atk: 10,
        def: 200,
        spd: 35,
        fortressImpactOnHit: true,
        fortressImpactDamagePctPerStack: 20,
        fortressDefSkillStatCoefPct: 15,
      },
      enemy,
      "성채기사",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: {},
        v2Skills: {
          learned: ["v2c_ironknight_guard", "v2c_fortressknight_ram"],
          equipped: ["v2c_ironknight_guard", "v2c_fortressknight_ram"],
        },
      } as never,
    );
    vi.restoreAllMocks();

    expect(countText(res, "철벽 반사 3회")).toBeGreaterThan(0);
    expect(countText(res, "[철벽 반사]")).toBeGreaterThanOrEqual(3);
    expect(countText(res, "충격 3스택 소비")).toBeGreaterThan(0);
  });
});
