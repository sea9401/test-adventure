import { describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return {
    ...actual,
    V2_CORE_LOOP_V2: true,
    V2_ATB_SKILLS: true,
    V2_SKILL_PROC_IN_PATTERN: true,
  };
});

import {
  SPECIALTY_LOADOUTS,
  buildUnexploredSpecialtyBalanceReport,
  main,
  unexploredSpecialtyBalanceViolations,
} from "../../../../scripts/sim-v2-unexplored-specialty-sets";

describe("미개척지 상위 특화 세트 결정적 밸런스 시뮬레이션", () => {
  it("네 세트의 폭풍·개척자·전환 장비가 정확한 여섯 슬롯을 채운다", () => {
    expect(Object.keys(SPECIALTY_LOADOUTS)).toEqual([
      "tracking",
      "toxic_blood",
      "glacial_guard",
      "deep_arcane",
    ]);

    for (const loadouts of Object.values(SPECIALTY_LOADOUTS)) {
      expect(Object.keys(loadouts.storm)).toHaveLength(6);
      expect(Object.keys(loadouts.stormTransition)).toHaveLength(6);
      expect(Object.keys(loadouts.pioneer)).toHaveLength(6);
      expect(Object.keys(loadouts.pioneerTransition)).toHaveLength(6);
    }
  });

  it("독혈·빙하 보스 고유 참고 조합은 개척자 기준의 정확한 세 슬롯만 교체한다", () => {
    expect(SPECIALTY_LOADOUTS.toxic_blood.bossReference).toEqual({
      weapon: "v2_unexplored_toxic_blood_claw",
      armor: "v2_unexplored_uncorrupted_heart",
      gloves: "v2_pioneer_bloodlight_gauntlets",
      boots: "v2_pioneer_berserk_boots",
      ring: "v2_unexplored_coagulated_venom_ring",
      necklace: "v2_pioneer_mana_barrier_core",
    });
    expect(SPECIALTY_LOADOUTS.glacial_guard.bossReference).toEqual({
      weapon: "v2_unexplored_glacial_crushing_hammer",
      armor: "v2_unexplored_frozen_great_armor",
      gloves: "v2_pioneer_iron_guard_gloves",
      boots: "v2_pioneer_berserk_boots",
      ring: "v2_pioneer_regrowth_ring",
      necklace: "v2_unexplored_absolute_zero_core",
    });
    expect(SPECIALTY_LOADOUTS.tracking.bossReference).toBeUndefined();
    expect(SPECIALTY_LOADOUTS.deep_arcane.bossReference).toBeUndefined();
  });

  it("합법적인 보스 고유 계보에만 다섯 번째 PvE 참고 행을 만든다", () => {
    const report = buildUnexploredSpecialtyBalanceReport({
      pveTrials: 1,
      pvpPairs: 0,
      seed: 20260831,
    });

    expect(
      Object.fromEntries(
        report.pve.map((entry) => [
          entry.setId,
          entry.comparisons.map((comparison) => comparison.loadout),
        ]),
      ),
    ).toEqual({
      tracking: ["storm", "stormTransition", "pioneer", "pioneerTransition"],
      toxic_blood: [
        "storm",
        "stormTransition",
        "pioneer",
        "pioneerTransition",
        "bossReference",
      ],
      glacial_guard: [
        "storm",
        "stormTransition",
        "pioneer",
        "pioneerTransition",
        "bossReference",
      ],
      deep_arcane: ["storm", "stormTransition", "pioneer", "pioneerTransition"],
    });
  }, 60_000);

  it("보스 참고 조합보다 주 역할과 생존이 모두 5% 넘게 높을 때만 실패한다", () => {
    const base = buildUnexploredSpecialtyBalanceReport({
      pveTrials: 1,
      pvpPairs: 0,
      seed: 20260831,
    });
    const bothAxes = structuredClone(base);
    const toxic = bothAxes.pve.find((entry) => entry.setId === "toxic_blood")!;
    const transition = toxic.comparisons.find(
      (entry) => entry.loadout === "pioneerTransition",
    )!;
    const bossReference = toxic.comparisons.find(
      (entry) => entry.loadout === "bossReference",
    )!;
    for (const scenario of bossReference.scenarios) {
      scenario.medianDamagePer1000Ticks = 100;
      scenario.medianSurvivalTicks = 100;
    }
    for (const scenario of transition.scenarios) {
      scenario.medianDamagePer1000Ticks = 106;
      scenario.medianSurvivalTicks = 106;
    }

    expect(unexploredSpecialtyBalanceViolations(bothAxes).failures).toContainEqual(
      expect.objectContaining({
        code: "PVE_BOSS_UNIQUE_CAP",
        setId: "toxic_blood",
      }),
    );

    const roleOnly = structuredClone(bothAxes);
    const roleOnlyTransition = roleOnly.pve
      .find((entry) => entry.setId === "toxic_blood")!
      .comparisons.find((entry) => entry.loadout === "pioneerTransition")!;
    for (const scenario of roleOnlyTransition.scenarios) {
      scenario.medianSurvivalTicks = 100;
    }

    expect(unexploredSpecialtyBalanceViolations(roleOnly).failures).not.toContainEqual(
      expect.objectContaining({
        code: "PVE_BOSS_UNIQUE_CAP",
        setId: "toxic_blood",
      }),
    );
  }, 60_000);

  it("같은 계보·같은 슬롯의 특화 장비와 보스 고유를 유효 위력·옵션으로 비교한다", () => {
    const report = buildUnexploredSpecialtyBalanceReport({
      pveTrials: 1,
      pvpPairs: 0,
      seed: 20260831,
    });

    expect(report.equipmentComparisons).toEqual([
      {
        setId: "tracking",
        slot: "boots",
        specialty: {
          id: "v2_unexplored_shadow_leap_boots",
          name: "그림자 도약화",
          power: 80,
          options: { hp: 180, crit: 8, eva: 20, spd: 28, accuracy: 12 },
        },
        bossUnique: {
          id: "v2_unexplored_phantom_acceleration_boots",
          name: "허상 가속화",
          power: 67,
          options: { crit: 6, eva: 20, spd: 28, accuracy: 10 },
        },
      },
      {
        setId: "toxic_blood",
        slot: "armor",
        specialty: {
          id: "v2_unexplored_toxic_blood_erosion_armor",
          name: "독혈 침식갑",
          power: 255,
          options: { hp: 850, magicDef: 55, statusDamageReductionPct: 15 },
        },
        bossUnique: {
          id: "v2_unexplored_uncorrupted_heart",
          name: "부패하지 않는 심장",
          power: 285,
          options: {
            hp: 1_050,
            eva: 24,
            magicDef: 115,
            statusDamageReductionPct: 30,
          },
        },
      },
      {
        setId: "toxic_blood",
        slot: "ring",
        specialty: {
          id: "v2_unexplored_lord_pulse_ring",
          name: "군주의 맥동환",
          power: 136,
          options: {
            hp: 300,
            crit: 12,
            critMult: 65,
            magicDef: 30,
            spd: 6,
            statusDamageReductionPct: 8,
          },
        },
        bossUnique: {
          id: "v2_unexplored_coagulated_venom_ring",
          name: "응고독 반지",
          power: 123,
          options: { hp: 220, crit: 14, critMult: 70, accuracy: 18 },
        },
      },
      {
        setId: "glacial_guard",
        slot: "armor",
        specialty: {
          id: "v2_unexplored_colossus_wall_armor",
          name: "거수 성벽갑",
          power: 280,
          options: {
            hp: 1_250,
            def: 55,
            magicDef: 50,
            critResist: 10,
            spd: -10,
          },
        },
        bossUnique: {
          id: "v2_unexplored_frozen_great_armor",
          name: "얼어붙은 거갑",
          power: 257,
          options: {
            hp: 1_200,
            def: 125,
            magicDef: 100,
            critResist: 12,
            spd: -10,
          },
        },
      },
      {
        setId: "glacial_guard",
        slot: "necklace",
        specialty: {
          id: "v2_unexplored_icewall_core_necklace",
          name: "빙벽 핵목걸이",
          power: 160,
          options: {
            hp: 450,
            mp: 160,
            magicDef: 105,
            critResist: 8,
            statusDamageReductionPct: 10,
          },
        },
        bossUnique: {
          id: "v2_unexplored_absolute_zero_core",
          name: "절대영도의 핵",
          power: 170,
          options: {
            hp: 620,
            mp: 560,
            def: 70,
            magicDef: 145,
            statusDamageReductionPct: 18,
          },
        },
      },
    ]);
  }, 60_000);

  it("각 세트의 폭풍·개척자·보스 참고 비율을 구조화해 보고한다", () => {
    const report = buildUnexploredSpecialtyBalanceReport({
      pveTrials: 1,
      pvpPairs: 0,
      seed: 20260831,
    });

    expect(report.ratios.map((entry) => entry.setId)).toEqual([
      "tracking",
      "toxic_blood",
      "glacial_guard",
      "deep_arcane",
    ]);
    expect(report.ratios).toEqual([
      expect.objectContaining({
        setId: "tracking",
        stormRoleRatio: expect.closeTo(0.8771429113, 8),
        pioneerRoleRatio: expect.closeTo(1.1128499591, 8),
        bossRoleRatio: null,
        bossSurvivalRatio: null,
      }),
      expect.objectContaining({
        setId: "toxic_blood",
        stormRoleRatio: expect.closeTo(0.8441341691, 8),
        pioneerRoleRatio: expect.closeTo(0.930818169, 8),
        bossRoleRatio: expect.closeTo(0.7954701682, 8),
        bossSurvivalRatio: expect.closeTo(1, 8),
      }),
      expect.objectContaining({
        setId: "glacial_guard",
        stormRoleRatio: expect.closeTo(1.0011185682, 8),
        pioneerRoleRatio: expect.closeTo(0.9888888889, 8),
        bossRoleRatio: expect.closeTo(1.0053089348, 8),
        bossSurvivalRatio: expect.closeTo(1.0053089348, 8),
      }),
      expect.objectContaining({
        setId: "deep_arcane",
        stormRoleRatio: expect.closeTo(0.8537761684, 8),
        pioneerRoleRatio: expect.closeTo(1.0996511069, 8),
        bossRoleRatio: null,
        bossSurvivalRatio: null,
      }),
    ]);
    expect(JSON.stringify(report.ratios)).not.toMatch(/NaN|Infinity/);
  }, 60_000);

  it("간결 CLI가 조합 비율과 정적 장비 비교표를 직접 출력한다", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      main([
        "--pve-trials=1",
        "--pvp-pairs=0",
        "--seed=20260831",
      ]);
      const output = log.mock.calls.flat().join("\n");

      expect(output).toContain(
        "세트 | 폭풍 전환/폭풍 | 개척자 전환/개척자 | 전환/보스 역할 | 전환/보스 생존",
      );
      expect(output).toContain("tracking | 0.877 | 1.113 | - | -");
      expect(output).toContain(
        "세트 | 슬롯 | 특화 장비(위력·옵션) | 보스 고유(위력·옵션)",
      );
      expect(output).toContain(
        "tracking | boots | 그림자 도약화(80",
      );
      expect(output).toContain("허상 가속화(67");
    } finally {
      log.mockRestore();
      error.mockRestore();
      warn.mockRestore();
    }
  }, 60_000);

  it("같은 시드의 PvE 보고서는 완전히 동일하고 모든 요약값이 유한하다", () => {
    const options = { pveTrials: 2, pvpPairs: 0, seed: 20260831 };
    const first = buildUnexploredSpecialtyBalanceReport(options);
    const second = buildUnexploredSpecialtyBalanceReport(options);

    expect(second.pve).toEqual(first.pve);
    expect(first.pve).toHaveLength(4);
    expect(first.pve.map((entry) => entry.comparisons.length)).toEqual([
      4, 5, 5, 4,
    ]);
    expect(JSON.stringify(first.pve)).not.toMatch(/NaN|Infinity/);
  }, 60_000);

  it("각 신규 전환 조합의 전문 시그니처가 PvE 표본에서 관측된다", () => {
    const report = buildUnexploredSpecialtyBalanceReport({
      pveTrials: 8,
      pvpPairs: 0,
      seed: 20260831,
    });
    const expectedLabels = {
      tracking: ["암영 가속", "추적 연쇄"],
      toxic_blood: ["군락독", "혈흔 개방"],
      glacial_guard: ["빙벽 전개", "거수 압축"],
      deep_arcane: ["마력 재순환", "심층 방전"],
    } as const;

    for (const entry of report.pve) {
      const transition = entry.comparisons.find(
        (comparison) => comparison.loadout === "pioneerTransition",
      );
      expect(transition, entry.setId).toBeDefined();
      for (const label of expectedLabels[entry.setId]) {
        expect(
          transition!.scenarios.some(
            (scenario) => (scenario.signatureTriggers[label] ?? 0) > 0,
          ),
          `${entry.setId}:${label}`,
        ).toBe(true);
      }
    }
  }, 120_000);

  it("PvP는 양쪽 선공을 한 쌍으로 집계하고 승률을 유한한 범위로 제한한다", () => {
    const report = buildUnexploredSpecialtyBalanceReport({
      pveTrials: 0,
      pvpPairs: 2,
      seed: 20260831,
    });

    expect(report.pvp).toHaveLength(4);
    for (const entry of report.pvp) {
      expect(entry.battles).toBe(4);
      expect(entry.specialtyWins + entry.baselineWins + entry.draws).toBe(4);
      expect(entry.specialtyWinRatePct).toBeGreaterThanOrEqual(0);
      expect(entry.specialtyWinRatePct).toBeLessThanOrEqual(100);
    }
  }, 120_000);

  it("PvP 60% 초과는 경고, 62% 초과는 실패다", () => {
    const base = buildUnexploredSpecialtyBalanceReport({
      pveTrials: 0,
      pvpPairs: 1,
      seed: 20260831,
    });
    const warningReport = {
      ...base,
      pvp: base.pvp.map((entry, index) => ({
        ...entry,
        specialtyWinRatePct: index === 0 ? 60.01 : 50,
      })),
    };
    const failureReport = {
      ...base,
      pvp: base.pvp.map((entry, index) => ({
        ...entry,
        specialtyWinRatePct: index === 0 ? 62.01 : 50,
      })),
    };

    expect(unexploredSpecialtyBalanceViolations(warningReport).warnings).toContainEqual(
      expect.objectContaining({ code: "PVP_SOFT_CAP", setId: "tracking" }),
    );
    expect(unexploredSpecialtyBalanceViolations(failureReport).failures).toContainEqual(
      expect.objectContaining({ code: "PVP_HARD_CAP", setId: "tracking" }),
    );
  }, 120_000);

  it("폭풍 전환은 관찰값으로만 남기고 실패 게이트에 포함하지 않는다", () => {
    const base = buildUnexploredSpecialtyBalanceReport({
      pveTrials: 1,
      pvpPairs: 0,
      seed: 20260831,
    });
    const broken = structuredClone(base);
    const transition = broken.pve[0].comparisons.find(
      (entry) => entry.loadout === "stormTransition",
    )!;
    const long = transition.scenarios.find(
      (entry) => entry.scenarioId === "long_dummy",
    )!;
    long.medianDamagePer1000Ticks = 0;

    expect(unexploredSpecialtyBalanceViolations(broken).failures).not.toContainEqual(
      expect.objectContaining({ code: "PVE_STORM_RANGE", setId: "tracking" }),
    );
  }, 120_000);

  it("개척자 기준 주 역할 비율이 0.97 미만이면 PvE 실패로 보고한다", () => {
    const base = buildUnexploredSpecialtyBalanceReport({
      pveTrials: 1,
      pvpPairs: 0,
      seed: 20260831,
    });
    const broken = structuredClone(base);
    const transition = broken.pve[0].comparisons.find(
      (entry) => entry.loadout === "pioneerTransition",
    )!;
    const long = transition.scenarios.find(
      (entry) => entry.scenarioId === "long_dummy",
    )!;
    long.medianDamagePer1000Ticks = 0;

    expect(unexploredSpecialtyBalanceViolations(broken).failures).toContainEqual(
      expect.objectContaining({ code: "PVE_PIONEER_RANGE", setId: "tracking" }),
    );
  }, 120_000);

  it("보정된 개척자 전환 조합은 파일럿 PvE·PvP 게이트를 모두 통과한다", () => {
    const report = buildUnexploredSpecialtyBalanceReport({
      pveTrials: 20,
      pvpPairs: 40,
      seed: 20260831,
    });

    expect(unexploredSpecialtyBalanceViolations(report)).toEqual({
      warnings: [],
      failures: [],
    });
  }, 120_000);
});
