import { describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return { ...actual, V2_CORE_LOOP_V2: true, V2_ATB_SKILLS: true };
});

import { buildCoopBossBalanceReport } from "../../../../scripts/sim-v2-coop-boss";
import { immortalBerserkerLifeFloors } from "./immortalBerserkerMechanic";

describe("불괴의 성채 고정 시드 밸런스", () => {
  it("순간 화력 계보가 방벽을 약화하고 유지형 계보는 강한 광폭을 감수한다", () => {
    const [report] = buildCoopBossBalanceReport({
      bossIds: ["invincible_fortress"],
      seed: 20260901,
      trials: 5,
    });
    const builds = new Map(report.builds.map((build) => [build.arch, build]));

    for (const arch of ["DEX", "LUK"] as const) {
      expect(builds.get(arch)?.medianFortressEnrageTier).toBeLessThanOrEqual(1);
    }
    for (const arch of ["BAL"] as const) {
      expect(builds.get(arch)?.medianFortressEnrageTier).toBeGreaterThanOrEqual(1);
      expect(builds.get(arch)?.medianFortressEnrageTier).toBeLessThanOrEqual(3);
    }
    for (const arch of ["STR", "VIT", "INT", "SPI"] as const) {
      expect(builds.get(arch)?.medianFortressEnrageTier).toBeGreaterThanOrEqual(3);
      expect(builds.get(arch)?.medianFortressEnrageTier).toBeLessThanOrEqual(4);
    }
    expect(report.maxFortressFirstNormalHitRatio).toBeLessThan(1);
    expect(report.builds.every((build) =>
      Number.isFinite(build.medianFortressBarrierDamageRatio)
    )).toBe(true);
  });
});

describe("불멸의 광전왕 고정 시드 밸런스", () => {
  it("두 부활·재생·본체 피해·회복·순진행량을 유한한 지표로 집계한다", () => {
    const [report] = buildCoopBossBalanceReport({
      bossIds: ["immortal_berserker"],
      seed: 20260901,
      trials: 2,
    });

    expect(immortalBerserkerLifeFloors(10_800_000)).toEqual([
      7_236_000,
      3_672_000,
      0,
    ]);
    for (const value of [
      report.medianRevivalCount,
      report.medianRegenerationCount,
      report.medianBodyDamage,
      report.medianHealing,
      report.medianNetProgress,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(report.medianNetProgress).toBeLessThanOrEqual(
      report.medianBodyDamage,
    );
    expect(
      report.builds.every((build) =>
        [
          build.medianRevivalCount,
          build.medianRegenerationCount,
          build.medianBodyDamage,
          build.medianHealing,
          build.medianNetProgress,
        ].every(Number.isFinite),
      ),
    ).toBe(true);
  });
});
