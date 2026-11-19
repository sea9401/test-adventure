import { describe, expect, it } from "vitest";
import {
  RANCH_LINEAGE_RARE_CHANCE_PCT,
  RANCH_LINEAGE_YIELD_BONUS_PCT,
  normalizeRanchLineage,
  ranchLineageRareChancePct,
  ranchLineageYieldBonusPct,
} from "./ranchLineageRules";

describe("목장 혈통 규칙", () => {
  it("등급별 희귀 산물 확률", () => {
    expect([...RANCH_LINEAGE_RARE_CHANCE_PCT]).toEqual([0, 10, 20, 35, 50]);
    expect(ranchLineageRareChancePct(3)).toBe(35);
    expect(ranchLineageRareChancePct(99)).toBe(50);
    expect(ranchLineageRareChancePct(-1)).toBe(0);
  });

  it("등급별 산물 수량 증가", () => {
    expect([...RANCH_LINEAGE_YIELD_BONUS_PCT]).toEqual([0, 25, 50, 75, 100]);
    expect([0, 1, 2, 3, 4].map(ranchLineageYieldBonusPct)).toEqual([0, 25, 50, 75, 100]);
    expect(ranchLineageYieldBonusPct(99)).toBe(100);
    expect(ranchLineageYieldBonusPct(Number.NaN)).toBe(0);
  });

  it("남겨 둔 산물 몫은 1~99만 싣는다", () => {
    expect(normalizeRanchLineage({ grade: 2, fails: 1, yieldCarryPct: 40 })).toEqual({
      grade: 2,
      fails: 1,
      yieldCarryPct: 40,
    });
    for (const yieldCarryPct of [0, 100, -5, 12.5, "30", Number.NaN]) {
      expect(normalizeRanchLineage({ grade: 2, fails: 1, yieldCarryPct })).toEqual({ grade: 2, fails: 1 });
    }
    expect(normalizeRanchLineage(null)).toEqual({ grade: 0, fails: 0 });
  });
});
