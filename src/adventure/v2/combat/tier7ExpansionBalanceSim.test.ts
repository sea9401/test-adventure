import { describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/adventure/data/v2/coreLoopConfig")>(),
  V2_CORE_LOOP_V2: true,
  V2_ATB_SKILLS: true,
  V2_SKILL_PROC_IN_PATTERN: true,
}));

import { runTier7ExpansionRatios } from "../../../../scripts/sim-v2-tier7-expansion";

describe("7차 두 번째 확장 5종 결정적 밸런스 시뮬레이션", () => {
  it("고유 세트가 선행 6차 고유 세트보다 장기전 10~15%, PvP 5~10% 강하다", () => {
    const ratios = runTier7ExpansionRatios(200);
    expect(ratios.map((entry) => entry.job)).toEqual([
      "tempest",
      "titan",
      "runelord",
      "bloodheaven",
      "behemoth",
    ]);
    for (const entry of ratios) {
      expect(entry.pveLongRatio, entry.job).toBeGreaterThanOrEqual(1.1);
      expect(entry.pveLongRatio, entry.job).toBeLessThanOrEqual(1.15);
      expect(entry.pvpRatio, entry.job).toBeGreaterThanOrEqual(1.05);
      expect(entry.pvpRatio, entry.job).toBeLessThanOrEqual(1.1);
    }
  }, 600_000);
});
