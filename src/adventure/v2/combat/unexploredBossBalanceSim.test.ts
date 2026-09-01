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

    expect(single.crystalEyeArtilleryPowerPcts).toHaveLength(3);
    expect(critical.crystalEyeArtilleryPowerPcts).toHaveLength(3);
    expect(multi.crystalEyeArtilleryPowerPcts).toEqual([25, 25, 25]);
    expect(multi.crystalEyeArtilleryStacks).toEqual([24, 24, 24]);
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
