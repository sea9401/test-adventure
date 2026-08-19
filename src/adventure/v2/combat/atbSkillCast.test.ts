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
  it("무영검신은 단일 피해를 기록해 적의 다음 행동 뒤 검영으로 실현한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const res = resolveBattle(
      { ...player, atk: 120, lukStat: 200, hp: 5_000, maxHp: 5_000 },
      {
        name: "검영 허수아비",
        tags: [],
        hp: 100_000,
        atk: 1,
        def: 10,
        spd: 30,
        exp: 0,
        evasionPct: 0,
      },
      "테스터",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: {},
        maxTurns: 4,
        v2Skills: {
          learned: [
            "v2c_shadowblade_afterimage",
            "v2c_shadowblade_swordshadow",
          ],
          equipped: [
            "v2c_shadowblade_afterimage",
            "v2c_shadowblade_swordshadow",
          ],
        },
      } as never,
    );

    expect(countText(res, "잔영!")).toBeGreaterThan(0);
    expect(countText(res, "[검영]")).toBeGreaterThan(0);
  });

  it("멸검은 한 행동을 충전에 쓰고 다음 행동 기회에 자동 해방한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const res = resolveBattle(
      { ...player, atk: 200, strStat: 200, hp: 2_500, maxHp: 5_000 },
      {
        name: "멸검 허수아비",
        tags: [],
        hp: 100_000,
        atk: 1,
        def: 10,
        spd: 20,
        exp: 0,
        evasionPct: 0,
      },
      "테스터",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: {},
        maxTurns: 5,
        v2Skills: {
          learned: [
            "v2c_ruinblade_ruinsword",
            "v2c_ruinblade_oneintent",
          ],
          equipped: [
            "v2c_ruinblade_ruinsword",
            "v2c_ruinblade_oneintent",
          ],
        },
      } as never,
    );

    const chargeIndex = res.finalState.log.findIndex((entry) =>
      entry.text.includes("[멸검] 충전을 시작했다"),
    );
    const releaseIndex = res.finalState.log.findIndex((entry) =>
      entry.text.includes("[멸검] 충전을 해방"),
    );
    expect(chargeIndex).toBeGreaterThan(-1);
    expect(releaseIndex).toBeGreaterThan(chargeIndex);
    expect(countText(res, "멸검!")).toBeGreaterThan(0);
  });

  it("비천무신은 원거리 다음 체술에 교차 추격을 발동한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const res = resolveBattle(
      { ...player, atk: 150, dexStat: 200, hp: 5_000, maxHp: 5_000 },
      {
        name: "교차 허수아비",
        tags: [],
        hp: 100_000,
        atk: 1,
        def: 10,
        spd: 20,
        exp: 0,
        evasionPct: 0,
      },
      "테스터",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: {},
        maxTurns: 5,
        v2Skills: {
          learned: [
            "v2c_skyascendant_fallingstar",
            "v2c_skyascendant_voidbreak",
            "v2c_skyascendant_crossover",
          ],
          equipped: [
            "v2c_skyascendant_fallingstar",
            "v2c_skyascendant_voidbreak",
            "v2c_skyascendant_crossover",
          ],
          pattern: {
            blocks: [
              {
                condition: { kind: "turn", op: "atMost", value: 1 },
                action: {
                  kind: "skill",
                  skillId: "v2c_skyascendant_fallingstar",
                },
              },
              {
                condition: { kind: "always" },
                action: {
                  kind: "skill",
                  skillId: "v2c_skyascendant_voidbreak",
                },
              },
            ],
          },
        },
      } as never,
    );

    expect(countText(res, "낙성!")).toBeGreaterThan(0);
    expect(countText(res, "파공!")).toBeGreaterThan(0);
    expect(countText(res, "[교차·추격]")).toBeGreaterThan(0);
  });

  it("태초현자는 서로 다른 직접 마법 세 번째 시전에 완전식을 발동한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const res = resolveBattle(
      {
        ...player,
        atk: 100,
        magicAtk: 220,
        intStat: 220,
        hp: 5_000,
        maxHp: 5_000,
      },
      {
        name: "완전식 허수아비",
        tags: [],
        hp: 100_000,
        atk: 1,
        def: 10,
        magicDef: 10,
        spd: 20,
        exp: 0,
        evasionPct: 0,
      },
      "테스터",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: {},
        maxTurns: 6,
        v2Skills: {
          learned: [
            "v2c_mage_fireball",
            "v2c_archmage_collapse",
            "v2c_primordialsage_greatorb",
            "v2c_primordialsage_optimization",
            "v2c_primordialsage_completeformula",
          ],
          equipped: [
            "v2c_mage_fireball",
            "v2c_archmage_collapse",
            "v2c_primordialsage_greatorb",
            "v2c_primordialsage_optimization",
            "v2c_primordialsage_completeformula",
          ],
          pattern: {
            blocks: [
              {
                condition: { kind: "turn", op: "atMost", value: 1 },
                action: { kind: "skill", skillId: "v2c_mage_fireball" },
              },
              {
                condition: { kind: "turn", op: "every", value: 2 },
                action: {
                  kind: "skill",
                  skillId: "v2c_archmage_collapse",
                },
              },
              {
                condition: { kind: "always" },
                action: {
                  kind: "skill",
                  skillId: "v2c_primordialsage_greatorb",
                },
              },
            ],
          },
        },
      } as never,
    );

    expect(countText(res, "[완전식]")).toBeGreaterThan(0);
    expect(countText(res, "대마력구!")).toBeGreaterThan(0);
  });




  it("감전은 적의 다음 행동 묶음만 건너뛰고 그 다음 행동은 보장한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const shockPlayer: PlayerCombat = {
      ...player,
      hp: 10_000,
      maxHp: 10_000,
      atk: 1,
      def: 100,
      spd: 30,
      equipSignatures: [
        {
          trigger: "on_hit",
          label: "시험 감전",
          shockChancePct: 100,
        },
      ],
    };
    const enemy: Monster = {
      name: "감전 허수아비",
      tags: [],
      hp: 100_000,
      atk: 1,
      def: 100,
      spd: 30,
      exp: 0,
      evasionPct: 0,
      accuracy: 100,
    };

    const res = resolveBattle(shockPlayer, enemy, "테스터", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
      maxTurns: 6,
    });

    const firstSkip = res.finalState.log.findIndex((entry) =>
      entry.text.includes("[감전] 감전 허수아비이(가) 움직이지 못했다."),
    );
    const secondSkip = res.finalState.log.findIndex(
      (entry, index) =>
        index > firstSkip &&
        entry.text.includes("[감전] 감전 허수아비이(가) 움직이지 못했다."),
    );
    expect(firstSkip).toBeGreaterThan(-1);
    expect(secondSkip).toBeGreaterThan(firstSkip);
    expect(
      res.finalState.log
        .slice(firstSkip + 1, secondSkip)
        .some((entry) => entry.kind === "enemy_attack"),
    ).toBe(true);
  });

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

  it("법칙술사는 문장 시전으로 네 각인을 쌓고 다음 행동에 완성 해방한다", () => {
    const enemy: Monster = {
      name: "각인 허수아비",
      tags: [],
      hp: 100_000,
      atk: 1,
      def: 0,
      spd: 5,
      exp: 0,
      evasionPct: 0,
    };
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const res = resolveBattle(
      {
        ...player,
        hp: 10_000,
        maxHp: 10_000,
        atk: 100,
        magicAtk: 100,
        intStat: 100,
        spd: 100,
        lawInscription: true,
      },
      enemy,
      "법칙술사",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: {},
        maxTurns: 4,
        v2Skills: {
          learned: [
            "v2c_lawweaver_release",
            "v2c_inscriber_release",
            "v2c_lawweaver_inscription",
            "v2c_mage_acumen",
            "v2c_caster_acumen",
            "v2c_magus_acumen3",
            "v2c_runecaster_circuit",
          ],
          equipped: [
            "v2c_lawweaver_release",
            "v2c_inscriber_release",
            "v2c_lawweaver_inscription",
            "v2c_mage_acumen",
            "v2c_caster_acumen",
            "v2c_magus_acumen3",
            "v2c_runecaster_circuit",
          ],
        },
      } as never,
    );
    vi.restoreAllMocks();

    expect(countText(res, "법칙 각인: 공격 +1 · 환류 +1 · 침식 +1 · 수호 +1 (총 4/8)")).toBeGreaterThan(0);
    expect(countText(res, "만상각인 해방: 공격 1 · 환류 1 · 침식 1 · 수호 1 소비")).toBeGreaterThan(0);
    expect(countText(res, "공격·환류·침식·수호가 하나로 이어져 완성 각인이 발동했다.")).toBeGreaterThan(0);
    expect(countText(res, "적이 받는 마법 피해 +7%")).toBeGreaterThan(0);
    expect(res.finalState.stacks.lawInscriptions).toEqual({
      assault: 0,
      reflux: 0,
      erosion: 0,
      ward: 0,
    });
    expect(
      res.finalState.log.some(
        (entry) =>
          entry.kind === "hp_bar" &&
          entry.playerSignatureResources?.lawInscriptions ===
            "4/8 · 공격 1 · 환류 1 · 침식 1 · 수호 1",
      ),
    ).toBe(true);
  });
});
