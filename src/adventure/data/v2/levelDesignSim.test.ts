import { describe, expect, it } from "vitest";

import {
  auditCustomLoadoutCombat,
  auditFixedProgressionCombat,
  buildGrowthPacing,
  buildReport,
  classifyStage,
  huntStageDepths,
  parseOptions,
} from "../../../../scripts/sim-v2-level-design";
import type { V2EquipSlot, V2EquipmentId } from "./v2Equipment";

describe("sim-v2-level-design", () => {
  it("기본 전투 표본은 경고선 근처의 승률 오탐을 줄이는 50회다", () => {
    expect(parseOptions([]).trials).toBe(50);
    expect(parseOptions(["--trials=20"]).trials).toBe(20);
    expect(parseOptions(["--trials=999"]).trials).toBe(100);
  });

  it("검사 대상은 실제 선택 가능한 2~78 짝수 단계 39개다", () => {
    const depths = huntStageDepths();
    expect(depths).toHaveLength(39);
    expect(depths[0]).toBe(2);
    expect(depths.at(-1)).toBe(78);
    expect(depths.every((depth) => depth % 2 === 0)).toBe(true);
  });

  it("성장 페이싱은 운영 에너지·EXP·드랍 설정을 한 소스에서 계산한다", () => {
    const growth = buildGrowthPacing();
    const fieldEnd = growth.rows.find((row) => row.depth === 6)!;
    const frontierEntry = growth.rows.find((row) => row.depth === 8)!;
    const endgame = growth.rows.find((row) => row.depth === 72)!;
    const skyRift = growth.rows.find((row) => row.depth === 78)!;

    expect(growth.totalExpToLevelCap).toBe(2_275_428);
    expect(growth.energy).toMatchObject({
      baseMax: 2_000,
      baseFullHours: 20 / 3,
      baseNaturalPerDay: 7_200,
      supportMax: 3_000,
      supportNaturalPerDay: 8_640,
      starterChargeEach: 100_000,
    });
    expect(growth.career).toMatchObject({
      tierRequirements: [1_000, 2_500, 4_500, 18_000, 35_000],
      totalWinsToTier6Path: 61_000,
    });
    expect(frontierEntry.avgVeteranExpPerWin / fieldEnd.avgVeteranExpPerWin).toBeGreaterThan(15);
    expect(fieldEnd.newbieLevelCapWins).toBeGreaterThan(30_000);
    expect(fieldEnd.newbieLevelCapWins).toBeLessThan(fieldEnd.veteranLevelCapWins);
    expect(
      (endgame.veteranLevelCapWins - 1) * endgame.avgVeteranExpPerWin,
    ).toBeLessThan(growth.totalExpToLevelCap);
    expect(
      endgame.veteranLevelCapWins * endgame.avgVeteranExpPerWin,
    ).toBeGreaterThanOrEqual(growth.totalExpToLevelCap);
    expect(endgame.commonAnyExpectedWins).toBeCloseTo(1 / 0.00075);
    expect(endgame.signatureAnyExpectedWins).toBe(2_000);
    expect(endgame.signatureSpecificExpectedWins).toBe(10_000);
    expect(skyRift.commonAnyExpectedWins).toBe(1_000);
    expect(skyRift.commonSpecificExpectedWins).toBe(6_000);
    expect(skyRift.signatureAnyExpectedWins).toBeNull();
  });

  it("실제 승률 절벽·전직 회복 필요·저승률·빌드 격차·장기전을 독립적으로 경고한다", () => {
    expect(
      classifyStage({
        minWinRateDropPct: 20,
        readinessRecoveryCount: 1,
        minWinRatePct: 59,
        winRateGapPct: 30,
        maxAvgWinTurns: 26,
      }),
    ).toEqual([
      "DIFFICULTY_CLIFF",
      "READINESS_RECOVERY",
      "LOW_WIN_RATE",
      "BUILD_GAP",
      "SLOW_FIGHT",
    ]);
  });

  it("안정 범위는 경고하지 않는다", () => {
    expect(
      classifyStage({
        minWinRateDropPct: 19.9,
        readinessRecoveryCount: 0,
        minWinRatePct: 60,
        winRateGapPct: 29.9,
        maxAvgWinTurns: 25,
      }),
    ).toEqual([]);
  });

  it("권장 전투력만 크게 바뀌고 실제 승률이 유지되면 난이도 절벽으로 오판하지 않는다", () => {
    expect(
      classifyStage({
        minWinRateDropPct: 0,
        readinessRecoveryCount: 0,
        minWinRatePct: 100,
        winRateGapPct: 0,
        maxAvgWinTurns: 8,
      }),
    ).toEqual([]);
  });

  it("수행 0회·전투력 1,500 이하 캐릭터는 심해 폐허 최심부를 안정적으로 우회하지 못한다", () => {
    const builds = auditFixedProgressionCombat({
      depth: 72,
      careerWins: 500_000,
      cultivate: false,
      trials: 50,
    });
    const underpowered = builds.filter((build) => build.power <= 1_500);

    expect(underpowered.length).toBeGreaterThan(0);
    expect(builds.every((build) => build.cultivations === 0)).toBe(true);
    expect(Math.max(...underpowered.map((build) => build.winRatePct))).toBeLessThan(20);
  });

  it("전투력 미달 보정 없이도 무수행 저성장 캐릭터는 후반까지 연속 우회하지 못한다", () => {
    const averageWinRate = (depth: number) => {
      const builds = auditFixedProgressionCombat({
        depth,
        careerWins: 15_000,
        cultivate: false,
        trials: 50,
      });
      return builds.reduce((sum, build) => sum + build.winRatePct, 0) / builds.length;
    };

    expect(averageWinRate(8)).toBeGreaterThanOrEqual(90); // 첫 프론티어는 온보딩 보호
    // 예전 전투력 미달 몬스터 강화가 사라져 초중반은 높은 승률로 통과할 수 있다.
    // 전역 INT 장벽을 2차 마법사 패시브로 옮긴 뒤 26구간 무수행 표본은 약 89.5%다.
    expect(averageWinRate(20)).toBeGreaterThan(90);
    expect(averageWinRate(26)).toBeGreaterThan(85);
    // 수행 스탯 상향으로 일부 중반 구간은 쉬워졌지만, 44부터 다시 막히며 최종 지역은 통과할 수 없다.
    expect(averageWinRate(32)).toBeLessThan(90);
    expect(averageWinRate(44)).toBeLessThan(90);
    expect(averageWinRate(72)).toBeLessThan(20);
  }, 15_000);

  it("흑월은 산군에서 무풍암영 2→6부위로 교체하는 전 구간에서 성능이 급락하지 않는다", () => {
    const sangoon = {
      armor: "v2_hard_sangoon_hide",
      gloves: "v2_hard_sangoon_claws",
      boots: "v2_hard_sangoon_stride",
      ring: "v2_hard_sangoon_ring",
      necklace: "v2_hard_sangoon_amulet",
    } as const;
    const shadow = {
      weapon: "v2_storm_gale_dagger",
      armor: "v2_storm_shadow_armor",
      gloves: "v2_storm_shadow_gloves",
      boots: "v2_storm_shadow_boots",
      ring: "v2_storm_shadow_ring",
      necklace: "v2_storm_shadow_necklace",
    } as const;
    const slots: V2EquipSlot[] = [
      "weapon",
      "ring",
      "necklace",
      "armor",
      "gloves",
      "boots",
    ];
    const results = [2, 3, 4, 5, 6].map((count) => {
      const equipment: Partial<Record<V2EquipSlot, V2EquipmentId>> = {
        weapon: shadow.weapon,
        ...sangoon,
      };
      for (const slot of slots.slice(0, count)) equipment[slot] = shadow[slot];
      return auditCustomLoadoutCombat({
        arch: "LUK",
        depth: 76,
        equipment,
        careerWins: 500_000,
        extraSp: count === 2 ? 2 : 4,
        enhanceLevel: 12,
        trials: 50,
        seed: 20260808,
      });
    });
    const winRates = results.map((result) => result.winRatePct);
    const powers = results.map((result) => result.power);

    // 산군 부분 착용 효율을 낮춘 만큼 초반 혼합 구간은 이전보다 약해질 수 있다. 완성 전까지
    // 최소 사용 가능선은 지키되, 아래의 교체 중 급락과 6T 완성 우위 검증을 핵심으로 둔다.
    expect(Math.min(...winRates)).toBeGreaterThanOrEqual(25);
    // 방어·회피 생존축 분리로 무풍암영의 방어 보너스를 HP로 일부 전환했다. 표시 점수는
    // 방어를 함께 주던 때보다 더 벌어질 수 있지만, 실제 승률 급락 가드를 우선한다.
    expect(Math.max(...powers) - Math.min(...powers)).toBeLessThan(320);
    for (let i = 1; i < winRates.length; i++) {
      expect(winRates[i - 1] - winRates[i]).toBeLessThan(20);
    }
    expect(results[0].player.spd).toBeGreaterThan(900);
    expect(results[0].player.spd).toBeLessThan(1_100);
  }, 15_000);

  it("회피형 6T 완성 세트는 산군 장비를 남긴 혼합 세팅에 밀리지 않는다", () => {
    const sangoon = {
      armor: "v2_hard_sangoon_hide",
      gloves: "v2_hard_sangoon_claws",
      boots: "v2_hard_sangoon_stride",
      ring: "v2_hard_sangoon_ring",
      necklace: "v2_hard_sangoon_amulet",
    } as const;
    const cases = [
      {
        arch: "DEX" as const,
        equipment: {
          weapon: "v2_storm_gale_bow",
          armor: "v2_storm_gale_armor",
          gloves: "v2_storm_gale_gloves",
          boots: "v2_storm_gale_boots",
          ring: "v2_storm_gale_ring",
          necklace: "v2_storm_gale_necklace",
        } as const,
      },
      {
        arch: "LUK" as const,
        equipment: {
          weapon: "v2_storm_gale_dagger",
          armor: "v2_storm_shadow_armor",
          gloves: "v2_storm_shadow_gloves",
          boots: "v2_storm_shadow_boots",
          ring: "v2_storm_shadow_ring",
          necklace: "v2_storm_shadow_necklace",
        } as const,
      },
      {
        arch: "LUK" as const,
        equipment: {
          weapon: "v2_storm_venom_dagger",
          armor: "v2_storm_venom_armor",
          gloves: "v2_storm_venom_gloves",
          boots: "v2_storm_venom_boots",
          ring: "v2_storm_venom_ring",
          necklace: "v2_storm_venom_necklace",
        } as const,
      },
    ];
    const replacementOrder: V2EquipSlot[] = [
      "weapon",
      "ring",
      "necklace",
      "armor",
      "gloves",
      "boots",
    ];

    for (const testCase of cases) {
      const results = [2, 3, 4, 5, 6].map((count) => {
        const equipment: Partial<Record<V2EquipSlot, V2EquipmentId>> = {
          weapon: testCase.equipment.weapon,
          ...sangoon,
        };
        for (const slot of replacementOrder.slice(0, count)) {
          equipment[slot] = testCase.equipment[slot];
        }
        return auditCustomLoadoutCombat({
          arch: testCase.arch,
          depth: 76,
          equipment,
          careerWins: 500_000,
          extraSp: 4,
          enhanceLevel: 12,
          trials: 50,
          seed: 20260809,
        });
      });
      const completeWinRate = results.at(-1)!.winRatePct;
      const bestSangoonMixWinRate = Math.max(
        ...results.slice(0, -1).map((result) => result.winRatePct),
      );

      expect(completeWinRate).toBeGreaterThan(bestSangoonMixWinRate);
    }
  }, 15_000);

  it("깊이·빌드별 전투 난수는 전체 실행 순서와 무관하다", () => {
    const full = buildReport(parseOptions(["--trials=1"]));
    const single = buildReport(parseOptions(["--depth=62", "--trials=1"]));
    const fromFull = full.stages.find((stage) => stage.depth === 62);

    expect(fromFull).toBeDefined();
    expect(single.stages[0].readinessRecoveryCount).toBe(
      fromFull!.readinessRecoveryCount,
    );
    expect(full.observationCounts.powerTargetMissStages).toBeGreaterThan(0);
    expect(full.observationCounts.powerTargetMissBuilds).toBeGreaterThan(0);
    expect(
      single.stages[0].builds.map((build) => ({
        arch: build.arch,
        wins: build.combat.wins,
        turns: build.combat.avgWinTurns,
      })),
    ).toEqual(
      fromFull!.builds.map((build) => ({
        arch: build.arch,
        wins: build.combat.wins,
        turns: build.combat.avgWinTurns,
      })),
    );
  }, 30_000);
});
