import { describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/adventure/data/v2/coreLoopConfig")>(),
  V2_CORE_LOOP_V2: true,
  V2_ATB_SKILLS: true,
  V2_SKILL_PROC_IN_PATTERN: true,
}));

import { runSkyAscendantActiveComparison } from "../../../../scripts/sim-v2-tier7-sword-line";

describe("#683 비천무신 액티브 장착 가치", () => {
  it("같은 42 SP 한도에서 7차 조합이 교차를 포함한 6차 조합보다 장기전 10~15% 강하다", () => {
    const [inherited, core] = runSkyAscendantActiveComparison({ seeds: 200, targetDef: 60 });
    expect(inherited.sp).toBeLessThanOrEqual(42);
    expect(core.sp).toBeLessThanOrEqual(42);
    const pveRatio = core.pveLong.mean / inherited.pveLong.mean;
    expect(pveRatio).toBeGreaterThanOrEqual(1.1);
    expect(pveRatio).toBeLessThanOrEqual(1.15);
    expect(core.pveShort.mean).toBeGreaterThan(inherited.pveShort.mean);
    expect(core.pvp.firstActionMean! / inherited.pvp.firstActionMean!).toBeLessThanOrEqual(1.3);
    const pvpRatio = core.pvp.mean / inherited.pvp.mean;
    expect(pvpRatio).toBeGreaterThanOrEqual(1.1);
    expect(pvpRatio).toBeLessThanOrEqual(1.15);
    expect(core.pvp.firstActionKoRate).toBeLessThanOrEqual(
      inherited.pvp.firstActionKoRate! + 0.02,
    );
  }, 120_000);

  it("고방어 상대에게도 7차 조합의 피해 우위를 유지한다", () => {
    const [inherited, core] = runSkyAscendantActiveComparison({ seeds: 200, targetDef: 600 });
    expect(core.pveLong.mean).toBeGreaterThan(inherited.pveLong.mean);
    expect(core.pvp.mean).toBeGreaterThan(inherited.pvp.mean);
    expect(core.pveLong.mean / inherited.pveLong.mean).toBeLessThanOrEqual(1.3);
    expect(core.pvp.mean / inherited.pvp.mean).toBeLessThanOrEqual(1.3);
    expect(core.pvp.firstActionMean! / inherited.pvp.firstActionMean!).toBeLessThanOrEqual(1.3);
    expect(core.pvp.firstActionKoRate).toBeLessThanOrEqual(
      inherited.pvp.firstActionKoRate! + 0.02,
    );
  }, 120_000);
});
