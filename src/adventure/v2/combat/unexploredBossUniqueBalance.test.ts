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

import { buildBossUniqueBalanceReport } from "../../../../scripts/sim-v2-unexplored-boss-uniques";

// 봉인 결계환은 지속 피해를 거는 적 상대용이라 고정 시나리오에서 효과가 발동하지 않는다.
const SITUATIONAL = new Set(["v2_unexplored_sealing_barrier_ring"]);

describe("미개척지 보스 고유 장비 효과 결정적 밸런스", () => {
  const report = buildBossUniqueBalanceReport({ trials: 15, seed: 20261024 });

  it("보스 고유 18종을 모두 비교한다", () => {
    expect(report).toHaveLength(18);
  });

  it("0.5% 초희귀는 같은 슬롯 개척자 장비보다 확실히 앞서고 효과 자체가 크게 기여한다", () => {
    const rare = report.filter((row) => row.chancePct === 0.5);
    expect(rare).toHaveLength(6);
    for (const row of rare) {
      expect(row.ratioVsBaseline, row.name).toBeGreaterThanOrEqual(1.12);
      expect(row.effectGain, row.name).toBeGreaterThanOrEqual(1.04);
    }
  });

  it("30%·10% 고유는 지배하지 않으면서 효과가 손해가 되지 않는다", () => {
    const common = report.filter((row) => row.chancePct !== 0.5);
    expect(common).toHaveLength(12);
    for (const row of common) {
      expect(row.ratioVsBaseline, row.name).toBeLessThanOrEqual(1.16);
      if (SITUATIONAL.has(row.itemId)) {
        expect(row.effectGain, row.name).toBeCloseTo(1, 6);
      } else {
        expect(row.effectGain, row.name).toBeGreaterThan(1);
      }
    }
  });
}, 120_000);
