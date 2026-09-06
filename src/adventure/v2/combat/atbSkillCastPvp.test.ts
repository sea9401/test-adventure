// PR-C — V2_ATB_SKILLS on 일 때 PvP ATB(라이브 아레나) 전투에서 v2 액티브 스킬이 시전되는지.
//   PvP 도 PvE처럼 스킬 시전이 그 행동의 평타를 대체한다. 플래그 off 는
//   combatPvpAtb.test 가 byte-identical 로 커버한다.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return { ...actual, V2_CORE_LOOP_V2: true, V2_ATB_SKILLS: true };
});

import {
  castV2SkillOnAttackerTurnPvP,
  endAttackerPhase,
  initialBattleStatePvP,
  releaseSwordShadowAfterPvPAction,
  resolveBattlePvP,
  type PvPBattleResolution,
} from "./engine-pvp";
import type { PlayerCombat } from "./engine";
import { makePoisonDot } from "./combatShared";
import type {
  V2SkillId,
  V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { actionInterval } from "./combatTimeline";

afterEach(() => vi.restoreAllMocks());

const SKILL = "v2c_warrior_flurry"; // 난격 (3타 데미지, procChance 40, mpCost 26)

const caster: PlayerCombat = {
  hp: 400, maxHp: 400, atk: 24, def: 8, spd: 60,
  evasionPct: 0, attackCount: 1, accuracyPct: 100,
  maxMp: 100000, mp: 100000, // 사실상 무한 MP — 여러 번 시전 보장
};
const target: PlayerCombat = {
  hp: 4000, maxHp: 4000, atk: 4, def: 8, spd: 30,
  evasionPct: 0, attackCount: 1, accuracyPct: 100,
};

function run(): PvPBattleResolution {
  vi.spyOn(Math, "random").mockReturnValue(0.1); // proc(10<40) 항상 통과 — p1 매 번들 시전
  const res = resolveBattlePvP(caster, target, "P1", "P2", {
    pickAction: () => ({ kind: "attack" }),
    potions: { p1: {}, p2: {} },
    v2Skills: { p1: { learned: [SKILL], equipped: [SKILL] } },
  } as never);
  vi.restoreAllMocks();
  return res;
}

describe("PR-C: V2_ATB_SKILLS on → PvP ATB 스킬 시전", () => {
  it.each([0, 100_000])("추격 로그는 보호막 %i 적용 후 HP 피해를 별도로 기록한다", (shield) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const skillId = "v2c_skyascendant_voidbreak";
    const skills: V2SkillsState = {
      learned: [skillId, "v2c_skyascendant_crossover"],
      equipped: [skillId, "v2c_skyascendant_crossover"],
      pattern: { blocks: [{ condition: { kind: "always" }, action: { kind: "skill", skillId } }] },
    };
    const initial = initialBattleStatePvP(
      { ...caster, atk: 150, dexStat: 200 },
      { ...target, hp: 100_000, maxHp: 100_000 },
      "P1", "P2", skills, { learned: [], equipped: [] }, undefined, undefined, "p1",
    );
    initial.p1.stacks.tier7 = { ...initial.p1.stacks.tier7, lastCrossFamily: "ranged" };
    initial.p2.stacks.playerShield = shield;
    const result = castV2SkillOnAttackerTurnPvP(initial, "p1");
    expect(result.castFired).toBe(true);
    const pursuit = result.state.log.find((entry) => entry.text.startsWith("[교차·추격]") && entry.text.includes("추가 피해"));
    expect(pursuit && "additionalHpDamage" in pursuit).toBe(true);
    if (!pursuit || pursuit.kind === "hp_bar") throw new Error("추격 로그 없음");
    const hits = result.state.log.filter((entry) => entry.text.startsWith("파공!") && entry.text.includes("피해를 입혔다"));
    expect(hits).toHaveLength(4);
    const directDamage = hits.reduce((sum, entry) => sum + Number(entry.text.match(/(\d+) 피해를 입혔다/)![1]), 0);
    expect(directDamage + pursuit.additionalHpDamage!).toBe(initial.p2.hp - result.state.p2.hp);
    if (shield > 0) expect(pursuit.additionalHpDamage).toBe(0);
    else expect(pursuit.additionalHpDamage).toBeGreaterThan(0);
  });

  it("교대 패턴은 PvP에서도 사용 불가 뒤 현재 스킬을 재시도한다", () => {
    const firstSkillId = "v2c_skyascendant_fallingstar";
    const secondSkillId = "v2c_skyascendant_voidbreak";
    const skills: V2SkillsState = {
      learned: [firstSkillId, secondSkillId],
      equipped: [firstSkillId, secondSkillId],
      pattern: {
        blocks: [
          {
            condition: { kind: "always" },
            action: { kind: "alternate", firstSkillId, secondSkillId },
          },
        ],
      },
    };
    let state = initialBattleStatePvP(
      { ...caster, atk: 150, dexStat: 200 },
      { ...target, hp: 100_000, maxHp: 100_000 },
      "P1",
      "P2",
      skills,
      { learned: [], equipped: [] },
      undefined,
      undefined,
      "p1",
    );
    const castSequence: Array<string | null> = [];

    for (let index = 0; index < 4; index += 1) {
      if (index === 2) {
        state = {
          ...state,
          p1: {
            ...state.p1,
            v2SkillCooldowns: {
              ...state.p1.v2SkillCooldowns,
              [firstSkillId]: 2,
            },
          },
        };
      }
      vi.spyOn(Math, "random").mockReturnValue(0);
      const logStart = state.log.length;
      const cast = castV2SkillOnAttackerTurnPvP(state, "p1");
      const skillLog = cast.state.log
        .slice(logStart)
        .find((entry) => entry.kind === "info" && entry.skillCast);
      castSequence.push(
        skillLog && skillLog.kind !== "hp_bar"
          ? (skillLog.skillCast?.skillId ?? null)
          : null,
      );
      state = {
        ...cast.state,
        p1: {
          ...cast.state.p1,
          turn: {
            ...cast.state.p1.turn,
            completedPlayerTurns: index + 1,
          },
        },
      };
      vi.restoreAllMocks();
    }

    expect(castSequence).toEqual([
      firstSkillId,
      secondSkillId,
      null,
      firstSkillId,
    ]);
  });

  it("PvP의 효과 전용 스킬도 구조화된 시전 경계를 기록한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const skillId = "v2c_ironman_brace" as const;
    const skills: V2SkillsState = {
      learned: [skillId],
      equipped: [skillId],
      pattern: {
        blocks: [
          {
            condition: { kind: "always" },
            action: { kind: "skill", skillId },
          },
        ],
      },
    };
    const initial = initialBattleStatePvP(
      caster,
      target,
      "P1",
      "P2",
      skills,
      { learned: [], equipped: [] },
      undefined,
      undefined,
      "p1",
    );

    const cast = castV2SkillOnAttackerTurnPvP(initial, "p1");

    expect(cast.castFired).toBe(true);
    expect(
      cast.state.log.some(
        (entry) =>
          entry.kind === "info" &&
          entry.skillCast?.skillId === skillId &&
          entry.skillCast.skillName === "버티기",
      ),
    ).toBe(true);
  });

  it("빙점 지배 빙결은 상대의 예약된 다음 행동을 정확히 40% 미룬다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const speed = 30;
    const res = resolveBattlePvP(
      {
        ...caster,
        hp: 100_000,
        maxHp: 100_000,
        atk: 100,
        magicAtk: 100,
        intStat: 100,
        maxMp: 1_000,
        mp: 100_000,
        spd: speed,
        freezeDamagePct: 50,
        freezeDelayPct: 40,
      },
      {
        ...target,
        hp: 100_000,
        maxHp: 100_000,
        atk: 1,
        def: 0,
        magicDef: 0,
        spd: speed,
      },
      "P1",
      "P2",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: { p1: {}, p2: {} },
        maxTurns: 6,
        v2Skills: {
          p1: {
            learned: ["v2c_cryomancer_absolutezero"],
            equipped: ["v2c_cryomancer_absolutezero"],
          },
        },
      } as never,
    );
    const p2Ticks = res.finalState.log
      .filter(
        (entry) =>
          entry.kind === "player_attack" &&
          entry.side === "p2" &&
          entry.text.startsWith("공격!"),
      )
      .map((entry) => entry.t)
      .filter((tick): tick is number => typeof tick === "number");
    const interval = actionInterval(speed);

    expect(p2Ticks.slice(0, 3)).toEqual([
      0,
      interval,
      interval * 2.4,
    ]);
    expect(
      res.finalState.log.some(
        (entry) =>
          entry.kind === "hp_bar" &&
          entry.enemySignatureResources?.frostChill === "한기 3/5",
      ),
    ).toBe(true);
  });

  it("검영은 PvP에서 상대의 다음 행동 종료 뒤 보호막보다 먼저 실현된다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const skills: V2SkillsState = {
      learned: [
        "v2c_shadowblade_afterimage",
        "v2c_shadowblade_swordshadow",
      ],
      equipped: [
        "v2c_shadowblade_afterimage",
        "v2c_shadowblade_swordshadow",
      ],
    };
    let state = initialBattleStatePvP(
      { ...caster, atk: 200, lukStat: 200 },
      { ...target, hp: 20_000, maxHp: 20_000 },
      "P1",
      "P2",
      skills,
      { learned: [], equipped: [] },
      undefined,
      undefined,
      "p1",
    );
    state = castV2SkillOnAttackerTurnPvP(state, "p1").state;
    expect(state.p1.stacks.tier7?.swordShadow).toBeDefined();
    state = endAttackerPhase(state, "p1", "p2");
    const hpBeforeRelease = state.p2.hp;
    state = endAttackerPhase(state, "p2", "p1", {
      skipOffensiveFollowups: true,
    });

    expect(state.p2.hp).toBeLessThan(hpBeforeRelease);
    expect(state.p1.stacks.tier7?.swordShadow).toBeUndefined();
    expect(state.p1.stacks.tier7?.shadowFollowUpPct).toBe(12);
    expect(state.log.some((entry) => entry.text.includes("[검영]"))).toBe(true);
  });

  it("계승 무심검의 PvP 검영 기록률은 10%의 92.2%인 9.22%다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const skills: V2SkillsState = {
      learned: [
        "v2c_swordsaint_flash",
        "v2c_shadowblade_swordshadow",
      ],
      equipped: [
        "v2c_swordsaint_flash",
        "v2c_shadowblade_swordshadow",
      ],
    };
    const state = initialBattleStatePvP(
      { ...caster, atk: 200, strStat: 200, lukStat: 200 },
      { ...target, hp: 20_000, maxHp: 20_000 },
      "P1",
      "P2",
      skills,
      { learned: [], equipped: [] },
      undefined,
      undefined,
      "p1",
    );

    expect(
      castV2SkillOnAttackerTurnPvP(state, "p1").state.p1.stacks.tier7
        ?.swordShadow?.recordPct,
    ).toBe(9.22);
  });

  it("검영 시전자가 상대 행동에 쓰러져도 검영을 실현해 동시 사망을 무승부로 만든다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const skills: V2SkillsState = {
      learned: [
        "v2c_shadowblade_afterimage",
        "v2c_shadowblade_swordshadow",
      ],
      equipped: [
        "v2c_shadowblade_afterimage",
        "v2c_shadowblade_swordshadow",
      ],
    };
    const initial = initialBattleStatePvP(
      { ...caster, atk: 200, lukStat: 200 },
      { ...target, hp: 20_000, maxHp: 20_000 },
      "P1",
      "P2",
      skills,
      { learned: [], equipped: [] },
      undefined,
      undefined,
      "p1",
    );
    const recorded = castV2SkillOnAttackerTurnPvP(initial, "p1").state;
    const ended = {
      ...recorded,
      p1: { ...recorded.p1, hp: 0 },
      p2: { ...recorded.p2, hp: 1 },
      phase: "ended" as const,
      outcome: "p2_win" as const,
    };

    const released = releaseSwordShadowAfterPvPAction(
      ended,
      "p2",
      "p1",
    );
    expect(released.p1.hp).toBe(0);
    expect(released.p2.hp).toBe(0);
    expect(released.outcome).toBe("draw");
  });

  it("완전식은 PvP에서 미환급 소비가 없으면 MP 0 강제 시전으로 자원을 만들지 않는다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const skills: V2SkillsState = {
      learned: [
        "v2c_archmage_collapse",
        "v2c_primordialsage_optimization",
        "v2c_primordialsage_completeformula",
      ],
      equipped: [
        "v2c_archmage_collapse",
        "v2c_primordialsage_optimization",
        "v2c_primordialsage_completeformula",
      ],
    };
    const initial = initialBattleStatePvP(
      { ...caster, maxMp: 1_000, magicAtk: 200, intStat: 200 },
      { ...target, hp: 20_000, maxHp: 20_000 },
      "P1",
      "P2",
      skills,
      { learned: [], equipped: [] },
      undefined,
      undefined,
      "p1",
    );
    const prepared = {
      ...initial,
      p1: {
        ...initial.p1,
        mp: 0,
        stacks: {
          ...initial.p1.stacks,
          tier7: {
            formula: {
              stages: 2,
              seenSkillIds: ["v2c_mage_fireball"] as V2SkillId[],
            },
          },
        },
      },
    };
    const cast = castV2SkillOnAttackerTurnPvP(prepared, "p1");

    expect(cast.castFired).toBe(true);
    expect(cast.state.p1.mp).toBe(0);
    expect(cast.selfHastePct).toBe(12);
    expect(cast.state.log.some((entry) => entry.text.includes("[완전식]"))).toBe(true);
    expect(
      cast.state.log.some((entry) => entry.text.includes("[마력 최적화]")),
    ).toBe(false);
  });

  it("PvP에서도 스킬 자체 MP 회복과 별개로 실제 지불 비용을 기준으로 환급한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const skills: V2SkillsState = {
      learned: [
        "v2c_primordialmage_return",
        "v2c_primordialmage_resonance",
      ],
      equipped: [
        "v2c_primordialmage_return",
        "v2c_primordialmage_resonance",
      ],
    };
    const initial = initialBattleStatePvP(
      {
        ...caster,
        maxMp: 1_000,
        mp: 1_000,
        equipSignatures: [
          {
            trigger: "on_skill_cast",
            label: "마력 순환",
            mpRefundPctOfCost: 15,
          },
        ],
      },
      { ...target, hp: 20_000, maxHp: 20_000 },
      "P1",
      "P2",
      skills,
      { learned: [], equipped: [] },
      undefined,
      undefined,
      "p1",
    );

    const cast = castV2SkillOnAttackerTurnPvP(initial, "p1");

    expect(cast.state.p1.mp).toBe(888);
    expect(
      cast.state.log.some(
        (entry) =>
          entry.text === "[근원공명] 태초회귀로 P1 마나 80 회복했다.",
      ),
    ).toBe(true);
    expect(cast.state.log.some((entry) => entry.text === "[마력 순환] P1 마나 33 환급")).toBe(true);
  });

  it("재앙독갑 직접 액티브 효과가 PvP에서도 중독 대상 피해와 시전당 중독을 적용한다", () => {
    const cast = (boosted: boolean, poisoned: boolean) => {
      vi.spyOn(Math, "random").mockReturnValue(0);
      const attacker: PlayerCombat = {
        ...caster,
        atk: 100,
        critChancePct: 0,
        equipSignatures: boosted
          ? [
              {
                trigger: "direct_skill_hit",
                label: "재앙독 주입",
                poisonChancePct: 25,
                poisonStacks: 1,
              },
              {
                trigger: "direct_skill_hit",
                label: "맹독 추격",
                poisonedTargetDamagePct: 10,
              },
            ]
          : undefined,
      };
      const initial = initialBattleStatePvP(
        attacker,
        { ...target, hp: 10_000, maxHp: 10_000, def: 0 },
        "P1",
        "P2",
        { learned: ["v2_skill_strike"], equipped: ["v2_skill_strike"] },
        { learned: [], equipped: [] },
        undefined,
        undefined,
        "p1",
      );
      const prepared = poisoned
        ? {
            ...initial,
            p2: {
              ...initial.p2,
              v2Dots: [
                makePoisonDot({
                  stacks: 1,
                  pctMaxHpPerStack: 0.001,
                  sourceAtk: 100,
                }),
              ],
            },
          }
        : initial;
      const result = castV2SkillOnAttackerTurnPvP(prepared, "p1").state;
      vi.restoreAllMocks();
      return result;
    };

    const plain = cast(false, true);
    const boosted = cast(true, true);
    expect(10_000 - boosted.p2.hp).toBe(Math.floor((10_000 - plain.p2.hp) * 1.1));
    const newlyPoisoned = cast(true, false);
    expect(newlyPoisoned.p2.v2Dots.find((dot) => dot.tag === "poison")?.stacks).toBe(1);
  });

  it("빙호수호 3세트는 PvP 시작 보호막 8%를 별도 추적한다", () => {
    const guarded: PlayerCombat = {
      ...target,
      hp: 1_000,
      maxHp: 1_000,
      equipSignatures: [
        {
          trigger: "battle_start",
          label: "빙호수호",
          battleStartShieldPctMaxHp: 8,
        },
        {
          trigger: "tracked_shield_break",
          label: "빙호 해방",
          trackedShieldPctMaxHp: 8,
          cleanseHarmfulStatuses: true,
          damageTakenReductionPct: 15,
          buffActions: 2,
        },
      ],
    };
    const initial = initialBattleStatePvP(
      caster,
      guarded,
      "P1",
      "P2",
      { learned: [], equipped: [] },
      { learned: [], equipped: [] },
      undefined,
      undefined,
      "p1",
    );
    expect(initial.p2.stacks.playerShield).toBe(80);
    expect(initial.p2.stacks.trackedSetShield).toBe(80);
    expect(initial.p2.flags.trackedShieldBreakUsed).toBe(false);
  });

  it("빙호수호 전용 시작 보호막이 처음 소진되면 PvP 해로운 효과를 정화하고 2행동 받피감을 건다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const guarded: PlayerCombat = {
      ...target,
      hp: 1_000,
      maxHp: 1_000,
      def: 0,
      equipSignatures: [
        {
          trigger: "battle_start",
          label: "빙호수호",
          battleStartShieldPctMaxHp: 8,
        },
        {
          trigger: "tracked_shield_break",
          label: "빙호 해방",
          trackedShieldPctMaxHp: 8,
          cleanseHarmfulStatuses: true,
          damageTakenReductionPct: 15,
          buffActions: 2,
        },
      ],
    };
    const initial = initialBattleStatePvP(
      { ...caster, atk: 100 },
      guarded,
      "P1",
      "P2",
      { learned: ["v2_skill_strike"], equipped: ["v2_skill_strike"] },
      { learned: [], equipped: [] },
      undefined,
      undefined,
      "p1",
    );
    const prepared = {
      ...initial,
      p2: {
        ...initial.p2,
        v2Dots: [
          makePoisonDot({
            stacks: 2,
            pctMaxHpPerStack: 0.001,
            sourceAtk: 100,
          }),
        ],
        v2SelfDebuffs: { spd: { pct: 20, turns: 3 } },
      },
    };
    const result = castV2SkillOnAttackerTurnPvP(prepared, "p1").state;
    vi.restoreAllMocks();

    expect(result.p2.stacks.trackedSetShield).toBe(0);
    expect(result.p2.flags.trackedShieldBreakUsed).toBe(true);
    expect(result.p2.v2Dots).toEqual([]);
    expect(result.p2.v2SelfDebuffs).toEqual({});
    expect(result.p2.buffs.playerDmgReductionPct).toBe(15);
    expect(result.p2.buffs.playerDmgReductionTurnsLeft).toBe(2);
    expect(result.log.filter((entry) => entry.text.includes("빙호 해방"))).toHaveLength(1);
  });

  it("PvP도 문장 시전으로 각인을 쌓고 같은 규칙으로 전량 해방한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const skills = [
      "v2c_lawweaver_release",
      "v2c_inscriber_release",
      "v2c_lawweaver_inscription",
      "v2c_mage_acumen",
      "v2c_caster_acumen",
      "v2c_magus_acumen3",
      "v2c_runecaster_circuit",
    ];
    const res = resolveBattlePvP(
      {
        ...caster,
        hp: 10_000,
        maxHp: 10_000,
        atk: 100,
        magicAtk: 100,
        intStat: 100,
        lawInscription: true,
      },
      { ...target, hp: 100_000, maxHp: 100_000, atk: 1 },
      "P1",
      "P2",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: { p1: {}, p2: {} },
        v2Skills: {
          p1: { learned: skills, equipped: skills },
        },
      } as never,
    );
    vi.restoreAllMocks();

    expect(
      res.finalState.log.some((entry) =>
        entry.text.includes("법칙 각인: 공격 +1 · 환류 +1 · 침식 +1 · 수호 +1 (총 4/8)"),
      ),
    ).toBe(true);
    expect(
      res.finalState.log.some((entry) =>
        entry.text.includes("만상각인 해방: 공격 1 · 환류 1 · 침식 1 · 수호 1 소비"),
      ),
    ).toBe(true);
    expect(
      res.finalState.log.some((entry) =>
        entry.text.includes("받는 마법 피해 +7%"),
      ),
    ).toBe(true);
    expect(
      res.finalState.log.some(
        (entry) =>
          entry.kind === "hp_bar" &&
          entry.playerSignatureResources?.lawInscriptions ===
            "4/8 · 공격 1 · 환류 1 · 침식 1 · 수호 1",
      ),
    ).toBe(true);
  });
  it("PvP 감전은 대상의 다음 행동 묶음만 건너뛰고 그 다음 행동은 보장한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const shockCaster: PlayerCombat = {
      ...caster,
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
    const durableTarget: PlayerCombat = {
      ...target,
      hp: 10_000,
      maxHp: 10_000,
      atk: 1,
      def: 100,
      spd: 30,
    };

    const res = resolveBattlePvP(shockCaster, durableTarget, "P1", "P2", {
      pickAction: () => ({ kind: "attack" }),
      potions: { p1: {}, p2: {} },
      initiativeRoll: 0,
    });

    const firstSkip = res.finalState.log.findIndex((entry) =>
      entry.text.includes("[감전] P2이(가) 움직이지 못했다."),
    );
    const secondSkip = res.finalState.log.findIndex(
      (entry, index) =>
        index > firstSkip && entry.text.includes("[감전] P2이(가) 움직이지 못했다."),
    );
    expect(firstSkip).toBeGreaterThan(-1);
    expect(secondSkip).toBeGreaterThan(firstSkip);
    expect(
      res.finalState.log
        .slice(firstSkip + 1, secondSkip)
        .some((entry) => entry.kind === "player_attack" && entry.side === "p2"),
    ).toBe(true);
  });

  it("그림자 도약은 독립 행동 로그를 남기고 같은 행동에서 평타를 쓰지 않는다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const res = resolveBattlePvP(
      { ...caster, spd: 30 },
      { ...target, hp: 800, maxHp: 800, spd: 80 },
      "혈향",
      "Soo",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: { p1: {}, p2: {} },
        v2Skills: {
          p2: {
            learned: ["v2c_shadow_shadowstep"],
            equipped: ["v2c_shadow_shadowstep"],
          },
        },
      } as never,
    );

    const shadowStep = res.finalState.log.find(
      (entry) => entry.side === "p2" && entry.text.startsWith("그림자 도약!"),
    );
    expect(shadowStep).toMatchObject({ kind: "player_attack", side: "p2" });
    expect(shadowStep?.t).toBeTypeOf("number");
    expect(
      res.finalState.log.some(
        (entry) =>
          entry.side === "p2" &&
          entry.t === shadowStep?.t &&
          entry.text.startsWith("공격!"),
      ),
    ).toBe(false);
  });

  it("회피 회복 장비는 PvP 스킬 행동 시작에도 발동한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const recoveringCaster: PlayerCombat = {
      ...caster,
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
    const lowAccuracyTarget: PlayerCombat = {
      ...target,
      hp: 120,
      maxHp: 120,
      accRating: 0,
      accuracyPct: 0,
    };

    const res = resolveBattlePvP(recoveringCaster, lowAccuracyTarget, "P1", "P2", {
      pickAction: () => ({ kind: "attack" }),
      potions: { p1: {}, p2: {} },
      v2Skills: { p1: { learned: [SKILL], equipped: [SKILL] } },
    } as never);

    expect(
      res.finalState.log.some(
        (entry) => entry.side === "p1" && entry.text.includes("[봉인]"),
      ),
    ).toBe(true);
    expect(
      res.finalState.log.some(
        (entry) =>
          entry.side === "p1" &&
          entry.kind === "player_attack" &&
          entry.text.includes("공격!"),
      ),
    ).toBe(false);
  });

  it("p1 이 PvP ATB 에서 난격을 시전한다 (라이브 아레나 액티브 활성화)", () => {
    const res = run();
    const p1Casts = res.finalState.log.filter(
      (e) =>
        typeof (e as { text?: string }).text === "string" &&
        (e as { text: string }).text.includes("난격") &&
        (e as { side?: string }).side === "p1",
    );
    expect(p1Casts.length).toBeGreaterThan(0);
    // 시전 로그도 ATB 틱 t 가 찍혀야 한다(외톨이 박스 방지·tagNewLogEntries 가 cast 뒤에).
    for (const e of p1Casts) {
      expect(typeof (e as { t?: number }).t).toBe("number");
    }
  });

  it("cast XOR 평타 — 매 행동에 스킬이 발동하면 p1 평타가 나가지 않는다", () => {
    const res = run();
    const p1Basic = res.finalState.log.filter(
      (e) =>
        (e as { kind?: string }).kind === "player_attack" &&
        (e as { side?: string }).side === "p1" &&
        typeof (e as { text?: string }).text === "string" &&
        (e as { text: string }).text.includes("공격!"),
    ).length;
    expect(p1Basic).toBe(0);
  });

  it("수호의 도발은 PvP에서 상대의 다음 행동을 소모하지 않고 즉시 기본 공격 2회를 유도한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const provokeCaster: PlayerCombat = {
      ...caster,
      hp: 1_000,
      maxHp: 1_000,
      fortressImpactOnHit: true,
      fortressImpactDamagePctPerStack: 15,
    };
    const res = resolveBattlePvP(provokeCaster, target, "수호자", "상대", {
      pickAction: () => ({ kind: "attack" }),
      potions: { p1: {}, p2: {} },
      v2Skills: {
        p1: {
          learned: ["v2c_ironknight_guard", "v2c_warden_aegis"],
          equipped: ["v2c_ironknight_guard", "v2c_warden_aegis"],
        },
        p2: {
          learned: ["v2c_warrior_flurry"],
          equipped: ["v2c_warrior_flurry"],
        },
      },
    } as never);
    vi.restoreAllMocks();

    const provokeIndex = res.finalState.log.findIndex(
      (entry) => entry.side === "p1" && entry.text.includes("즉시 기본 공격 2회"),
    );
    expect(provokeIndex).toBeGreaterThanOrEqual(0);
    const provokeTick = res.finalState.log[provokeIndex]?.t;
    const casterActionEnd = res.finalState.log.findIndex(
      (entry, index) => index > provokeIndex && entry.kind === "hp_bar",
    );
    const immediateOpponentAttacks = res.finalState.log
      .slice(provokeIndex + 1, casterActionEnd)
      .filter(
        (entry) =>
          entry.side === "p2" &&
          entry.kind === "player_attack" &&
          entry.t === provokeTick &&
          entry.text.includes("공격!"),
    );
    expect(immediateOpponentAttacks).toHaveLength(2);
    expect(
      immediateOpponentAttacks.every(
        (entry) =>
          entry.kind !== "hp_bar" &&
          entry.forcedBySkill === "수호의 도발",
      ),
    ).toBe(true);
    expect(
      res.finalState.log.slice(provokeIndex + 1, casterActionEnd).filter(
        (entry) => entry.t === provokeTick && entry.text.includes("[철벽 반사]"),
      ),
    ).toHaveLength(2);
    expect(
      res.finalState.log.some(
        (entry) =>
          entry.side === "p2" &&
          entry.t !== provokeTick &&
          entry.kind === "player_attack",
      ),
    ).toBe(true);
    expect(
      res.finalState.log.some((entry) => entry.text.includes("스킬 발동률 −100%p")),
    ).toBe(false);
    expect(
      res.finalState.log.some((entry) => entry.text.includes("보호막 +")),
    ).toBe(false);
  });

  it("PvP에서도 철벽 반사와 충격 소비가 같은 횟수 규칙을 사용한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const fortress: PlayerCombat = {
      ...caster,
      hp: 10_000,
      maxHp: 10_000,
      atk: 10,
      def: 200,
      spd: 55,
      fortressImpactOnHit: true,
      fortressImpactDamagePctPerStack: 20,
      fortressDefSkillStatCoefPct: 15,
    };
    const opponent: PlayerCombat = {
      ...target,
      hp: 20_000,
      maxHp: 20_000,
      atk: 120,
      def: 20,
      spd: 40,
    };
    const res = resolveBattlePvP(fortress, opponent, "성채기사", "상대", {
      pickAction: () => ({ kind: "attack" }),
      potions: { p1: {}, p2: {} },
      v2Skills: {
        p1: {
          learned: ["v2c_ironknight_guard", "v2c_fortressknight_ram"],
          equipped: ["v2c_ironknight_guard", "v2c_fortressknight_ram"],
        },
      },
    } as never);
    vi.restoreAllMocks();

    expect(
      res.finalState.log.some(
        (entry) =>
          entry.kind === "player_attack" &&
          entry.side === "p1" &&
          entry.text === "철벽 태세! 철벽 반사 3회 준비",
      ),
    ).toBe(true);
    expect(
      res.finalState.log.filter((entry) => entry.text.includes("철벽 반사 3회"))
        .length,
    ).toBeGreaterThan(0);
    expect(
      res.finalState.log.filter((entry) => entry.text.includes("[철벽 반사]"))
        .length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      res.finalState.log.filter((entry) => entry.text.includes("충격 3스택 소비"))
        .length,
    ).toBeGreaterThan(0);
  });
});
