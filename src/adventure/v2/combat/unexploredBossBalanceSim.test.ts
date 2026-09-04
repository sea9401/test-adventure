import { describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return { ...actual, V2_CORE_LOOP_V2: true, V2_ATB_SKILLS: true };
});

import {
  auditCoopBossForPlayer,
  buildCoopBossBalanceReport,
} from "../../../../scripts/sim-v2-coop-boss";
import type { PlayerCombat } from "./engine";
import { immortalBerserkerLifeFloors } from "./immortalBerserkerMechanic";

describe("불괴의 성채 고정 시드 밸런스", () => {
  it("150만 방벽의 계보별 광폭·달성률 지표를 유효 범위로 집계한다", () => {
    const [report] = buildCoopBossBalanceReport({
      bossIds: ["invincible_fortress"],
      seed: 20260901,
      trials: 5,
    });
    const builds = new Map(report.builds.map((build) => [build.arch, build]));

    for (const arch of ["STR", "DEX", "VIT", "INT", "SPI", "LUK", "BAL"] as const) {
      const build = builds.get(arch);
      expect(build?.medianFortressEnrageTier).toBeGreaterThanOrEqual(0);
      expect(build?.medianFortressEnrageTier).toBeLessThanOrEqual(7);
      expect(build?.medianFortressBarrierDamageRatio).toBeGreaterThanOrEqual(0);
      expect(build?.medianFortressBarrierDamageRatio).toBeLessThanOrEqual(1);
    }
    expect(report.maxFortressFirstNormalHitRatio).toBeGreaterThan(2.4);
    expect(report.maxFortressFirstNormalHitRatio).toBeLessThan(2.7);
    expect(report.builds.every((build) =>
      Number.isFinite(build.medianFortressBarrierDamageRatio)
    )).toBe(true);
  });
});

describe("천공의 수정안 고정 시드 밸런스", () => {
  it("연타·치명 계보가 단타 계보보다 세 차례 포격을 일관되게 약화한다", () => {
    const base: PlayerCombat = {
      hp: 1_000_000_000,
      maxHp: 1_000_000_000,
      atk: 1,
      def: 100_000,
      magicDef: 100_000,
      spd: 50,
      evasionPct: 0,
      attackCount: 1,
      accuracyPct: 100,
      critChancePct: 0,
    };
    const audit = (player: PlayerCombat) =>
      auditCoopBossForPlayer({
        bossId: "skyward_crystal_eye",
        player,
        skills: { learned: [], equipped: [] },
        trials: 1,
        seed: 20260901,
      })[0];
    const single = audit(base);
    const critical = audit({ ...base, critChancePct: 100 });
    const multi = audit({ ...base, attackCount: 3 });
    const specializedMulti = audit({ ...base, attackCount: 5 });

    expect(single.crystalEyeArtilleryPowerPcts).toHaveLength(3);
    expect(critical.crystalEyeArtilleryPowerPcts).toHaveLength(3);
    expect(multi.crystalEyeArtilleryPowerPcts).toEqual([70, 70, 70]);
    expect(multi.crystalEyeArtilleryStacks).toEqual([24, 24, 24]);
    expect(specializedMulti.crystalEyeArtilleryPowerPcts).toEqual([50, 50, 50]);
    expect(specializedMulti.crystalEyeArtilleryStacks).toEqual([40, 40, 40]);
    expect(critical.crystalEyeArtilleryStacks[0]).toBeGreaterThan(
      single.crystalEyeArtilleryStacks[0],
    );
    expect(critical.crystalEyeArtilleryPowerPcts[0]).toBeLessThan(
      single.crystalEyeArtilleryPowerPcts[0],
    );
    expect(multi.crystalEyeArtilleryDamageRatios[0]).toBeLessThan(
      critical.crystalEyeArtilleryDamageRatios[0],
    );
    expect(critical.crystalEyeArtilleryDamageRatios[0]).toBeLessThan(
      single.crystalEyeArtilleryDamageRatios[0],
    );
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
