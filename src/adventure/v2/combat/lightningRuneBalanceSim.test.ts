import { describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/adventure/data/v2/coreLoopConfig")>(),
  V2_CORE_LOOP_V2: true,
  V2_ATB_SKILLS: true,
  V2_SKILL_PROC_IN_PATTERN: true,
}));

import { runLightningRunePositions } from "../../../../scripts/sim-lightning-rune-advancement";

describe("전격·룬 기사 5·6차 결정적 밸런스 시뮬레이션", () => {
  it("계보 세트 피해가 같은 차수 기존 계보 중앙값의 0.95~1.3배 안에 있다", () => {
    const positions = runLightningRunePositions(60);
    expect(positions.map((entry) => entry.title)).toEqual([
      "마법 5차 계보 세트",
      "마법 6차 계보 세트",
      "전사 5차 계보 세트",
      "전사 6차 계보 세트",
    ]);
    for (const entry of positions) {
      expect(entry.pveRatio, `${entry.title} 사냥`).toBeGreaterThanOrEqual(0.95);
      expect(entry.pveRatio, `${entry.title} 사냥`).toBeLessThanOrEqual(1.3);
      expect(entry.pvpRatio, `${entry.title} PvP`).toBeGreaterThanOrEqual(0.95);
      expect(entry.pvpRatio, `${entry.title} PvP`).toBeLessThanOrEqual(1.3);
    }
  }, 600_000);
});
