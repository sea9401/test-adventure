import { describe, expect, it } from "vitest";

import {
  buildReport,
  classifyStage,
  huntStageDepths,
  parseOptions,
} from "../../../../scripts/sim-v2-level-design";

describe("sim-v2-level-design", () => {
  it("기본 전투 표본은 경고선 근처의 승률 오탐을 줄이는 50회다", () => {
    expect(parseOptions([]).trials).toBe(50);
    expect(parseOptions(["--trials=20"]).trials).toBe(20);
    expect(parseOptions(["--trials=999"]).trials).toBe(100);
  });

  it("검사 대상은 실제 선택 가능한 2~72 짝수 단계 36개다", () => {
    const depths = huntStageDepths();
    expect(depths).toHaveLength(36);
    expect(depths[0]).toBe(2);
    expect(depths.at(-1)).toBe(72);
    expect(depths.every((depth) => depth % 2 === 0)).toBe(true);
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

  it("깊이·빌드별 전투 난수는 전체 실행 순서와 무관하다", () => {
    const full = buildReport(parseOptions(["--trials=1"]));
    const single = buildReport(parseOptions(["--depth=62", "--trials=1"]));
    const fromFull = full.stages.find((stage) => stage.depth === 62);

    expect(fromFull).toBeDefined();
    expect(full.warningCounts.READINESS_RECOVERY).toBe(0);
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
  }, 15_000);
});
