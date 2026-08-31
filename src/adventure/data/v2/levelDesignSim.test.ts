import { describe, expect, it } from "vitest";

import {
  auditCustomLoadoutCombat,
  auditFixedProgressionCombat,
  buildLevelDesignProgressionSnapshot,
  buildGrowthPacing,
  buildReport,
  classifyStage,
  huntStageDepths,
  parseOptions,
} from "../../../../scripts/sim-v2-level-design";
import {
  exclusiveSkillConflicts,
  spCostOf,
  V2_SKILLS,
} from "./v2Skills";
import type { V2EquipSlot, V2EquipmentId } from "./v2Equipment";
import { bandUniquePoolForDepth } from "./dungeonUniqueDrops";
import { derivePowerScore } from "./power";
import { powerInputFromPlayer } from "../../../lib/server/playerPowerInput";

const SIMULATION_TEST_TIMEOUT_MS = 60_000;

describe("sim-v2-level-design", () => {
  it("표본 전투력은 실제 게임과 동일한 전체 전투력 입력을 사용한다", () => {
    const snapshot = buildLevelDesignProgressionSnapshot({
      arch: "SPI",
      depth: 78,
      seed: 20260809,
    });

    expect(snapshot.power).toBe(
      derivePowerScore(
        powerInputFromPlayer(
          snapshot.player,
          snapshot.player.maxHp,
          snapshot.player.maxMp,
        ),
      ),
    );
  });

  it("고정 장비 오버라이드는 실제 전투 스냅샷과 시그니처를 바꾼다", () => {
    const snapshot = buildLevelDesignProgressionSnapshot({
      arch: "INT",
      depth: 84,
      careerWins: 500_000,
      cultivate: true,
      equipment: {
        weapon: "v2_unexplored_deep_alchemy_staff",
        armor: "v2_unexplored_mana_cycle_robe",
        gloves: "v2_pioneer_iron_guard_gloves",
        boots: "v2_pioneer_tracefree_boots",
        ring: "v2_unexplored_abyss_catalyst_ring",
        necklace: "v2_pioneer_refraction_core",
      },
    });

    expect(snapshot.player.magicAtk).toBeGreaterThan(0);
    expect(snapshot.player.equipSignatures?.map((entry) => entry.label)).toEqual(
      expect.arrayContaining(["마력 재순환", "심층 방전"]),
    );
  });

  it("패황 STR 표본은 광기 중첩 없이 계보 액티브 4종과 최고 패시브를 51 SP로 장착한다", () => {
    const snapshot = buildLevelDesignProgressionSnapshot({
      arch: "STR",
      depth: 54,
      careerWins: 500_000,
      seed: 20260811,
    });
    const expected = [
      "v2c_berserker_bloodslash",
      "v2c_warlord_bloodbath",
      "v2c_overlord_ruin",
      "v2c_hegemon_annihilation",
      "v2c_hegemon_dominion",
    ] as const;

    expect(snapshot.currentJobId).toBe("hegemon");
    expect(snapshot.v2Skills.equipped).toEqual(
      expect.arrayContaining([...expected]),
    );
    expect(exclusiveSkillConflicts(snapshot.v2Skills.equipped)).toEqual([]);
    expect(
      snapshot.v2Skills.equipped.reduce(
        (sum, skillId) => sum + spCostOf(V2_SKILLS[skillId]),
        0,
      ),
    ).toBe(51);
  });

  it("기본 전투 표본은 경고선 근처의 승률 오탐을 줄이는 50회다", () => {
    expect(parseOptions([]).trials).toBe(50);
    expect(parseOptions(["--trials=20"]).trials).toBe(20);
    expect(parseOptions(["--trials=999"]).trials).toBe(100);
  });

  it("검사 대상은 실제 선택 가능한 2~84 짝수 단계 42개다", () => {
    const depths = huntStageDepths();
    expect(depths).toHaveLength(42);
    expect(depths[0]).toBe(2);
    expect(depths.at(-1)).toBe(84);
    expect(depths.every((depth) => depth % 2 === 0)).toBe(true);
  });

  it("성장 페이싱은 운영 에너지·EXP·드랍 설정을 한 소스에서 계산한다", () => {
    const growth = buildGrowthPacing();
    const fieldEnd = growth.rows.find((row) => row.depth === 6)!;
    const frontierEntry = growth.rows.find((row) => row.depth === 8)!;
    const endgame = growth.rows.find((row) => row.depth === 72)!;
    const skyRift = growth.rows.find((row) => row.depth === 78)!;
    const starGrave = growth.rows.find((row) => row.depth === 84)!;

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
    // 천공 균열 1~6은 21종 방어구 전역 풀. 78단계 총 0.1%에서 특정 1종은 평균 21,000승.
    expect(skyRift.commonSpecificExpectedWins).toBe(21_000);
    expect(skyRift.signatureAnyExpectedWins).toBe(40_000);
    expect(skyRift.signatureSpecificExpectedWins).toBe(480_000);
    for (const depth of [73, 74, 75, 76, 77, 78]) {
      const pool = bandUniquePoolForDepth(depth)!;
      expect(1 / pool.chance).toBeCloseTo(40_000);
      expect(pool.ids.length / pool.chance).toBeCloseTo(480_000);
    }
    expect(starGrave.avgVeteranExpPerWin).toBe(skyRift.avgVeteranExpPerWin);
    expect(starGrave.commonAnyExpectedWins).toBe(1_000);
    expect(starGrave.commonSpecificExpectedWins).toBe(21_000);
    expect(starGrave.signatureAnyExpectedWins).toBeCloseTo(1 / 0.000035);
    expect(starGrave.signatureSpecificExpectedWins).toBeCloseTo(
      12 / 0.000035,
    );
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

  it("수행 0회 캐릭터는 심해 폐허 최심부를 안정적으로 우회하지 못한다", () => {
    const builds = auditFixedProgressionCombat({
      depth: 72,
      careerWins: 500_000,
      cultivate: false,
      trials: 50,
    });

    expect(builds.every((build) => build.cultivations === 0)).toBe(true);
    expect(Math.max(...builds.map((build) => build.winRatePct))).toBeLessThan(20);
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
    // 주스탯 공격력 0.7 전역 적용으로 32까지는 쉬워졌지만, 44부터 다시 막히며 최종 지역은 통과할 수 없다.
    expect(averageWinRate(32)).toBeGreaterThan(90);
    expect(averageWinRate(44)).toBeLessThan(90);
    expect(averageWinRate(72)).toBeLessThan(20);
  }, SIMULATION_TEST_TIMEOUT_MS);

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

    // 장착 패시브를 소비하는 성장 시뮬레이터도 신규 방어 감소를 실제 전투 캐릭터에 전달한다.
    expect(results[0].player.enemyPhysicalDefReductionPct).toBeGreaterThan(0);
    // 예전 상위권 중앙 보정치에 가까운 공통 난도에서는 절대 승률보다 교체 중 급락 여부가 핵심이다.
    expect(Math.min(...winRates)).toBeGreaterThanOrEqual(30);
    // 새 전투력 산식은 이미 ATB 상한에 도달한 SPD를 더 계산하지 않는다. 방어 감소처럼
    // 표시 점수에 직접 환산되지 않는 고비용 패시브도 기존 능력치 패시브와 장착 경쟁을 한다.
    // 따라서 장비 교체 구간의 표시 점수 차이는 커질 수 있지만 실제 승률 급락 가드는 유지한다.
    expect(Math.max(...powers) - Math.min(...powers)).toBeLessThan(225);
    for (let i = 1; i < winRates.length; i++) {
      expect(winRates[i - 1] - winRates[i]).toBeLessThan(20);
    }
    expect(results[0].player.spd).toBeGreaterThan(900);
    expect(results[0].player.spd).toBeLessThan(1_100);
  }, SIMULATION_TEST_TIMEOUT_MS);

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
  }, SIMULATION_TEST_TIMEOUT_MS);
});
