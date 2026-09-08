import { describe, expect, it } from "vitest";
import { emptyProficiency } from "./proficiency";
import { lifeResourceRangesForProficiency, rollLevelGrowth, statGrowthRanges, statGrowthMasteryTotals } from "./statGrowth";
import { V2_STAT_KEYS } from "./v2StatKeys";
import { rollInitialLifeResourceGrowth, rollLifeResourceLevels } from "./lifeResourceGrowth";

const high = () => 1 - Number.EPSILON;
const wideCaps = Object.fromEntries(V2_STAT_KEYS.map((s) => [s, 10_000]));

describe("independent mastery growth", () => {
  it("growth ranges keep increasing beyond the former mastery soft cap", () => {
    const max = (mastery: number) => statGrowthRanges({ ...emptyProficiency(),
      jobCumLevel: { warrior: mastery },
      groups: { warrior: { tier: 1, cultivations: 0, cumLevel: mastery } },
    }).str.max;
    expect([0, 10_000, 100_000, 1_000_000, 20_000_000].map(max)).toEqual([1, 3, 6, 9, 13]);
    expect(max(200_000_000)).toBeGreaterThan(max(20_000_000));
  });

  it("concrete job career contributes to the corresponding stat ranges", () => {
    const prof = { ...emptyProficiency(), jobCumLevel: { archer: 100_000 } };
    const totals = statGrowthMasteryTotals(prof);
    expect(totals.dex).toBeGreaterThan(totals.str);
    expect(statGrowthRanges(prof).dex.max).toBeGreaterThan(1);
  });

  it("batch levels match repeated rolls and accept zero levels", () => {
    const prof = { ...emptyProficiency(), caps: wideCaps };
    const first = rollLevelGrowth({}, "none", prof, high);
    const second = rollLevelGrowth(first, "none", prof, high);
    expect(rollLevelGrowth({}, "none", prof, high, { levels: 2 })).toEqual(second);
    expect(rollLevelGrowth(first, "none", prof, high, { levels: 0 })).toEqual(first);
  });

  it("clamps invalid RNG values and clips multi-point growth to remaining cap", () => {
    const prof = { ...emptyProficiency(),
      jobCumLevel: { warrior: 100_000 },
      groups: { warrior: { tier: 1, cumLevel: 100_000, cultivations: 0 } } };
    expect(rollLevelGrowth({ str: 44 }, "warrior", prof, high).str).toBe(45);
    expect(rollLevelGrowth({}, "warrior", prof, () => Number.NaN)).toEqual({});
    expect(rollLevelGrowth({}, "warrior", prof, () => 1)).toEqual(rollLevelGrowth({}, "warrior", prof, high));
  });

  it("zero mastery rolls every stat independently in 0..1", () => {
    const prof = emptyProficiency();
    expect(rollLevelGrowth({}, "warrior", prof, () => 0)).toEqual({});
    expect(rollLevelGrowth({}, "warrior", prof, high)).toEqual({
      str: 1, dex: 1, vit: 1, int: 1, spi: 1, luk: 1,
    });
    const rolls = [0, 0, 0, 0.9, 0, 0, 0, 0.9, 0, 0, 0, 0.9];
    expect(rollLevelGrowth({}, "warrior", prof, () => rolls.shift()!)).toEqual({
      dex: 1, int: 1, luk: 1,
    });
  });

  it("mastery increases related amounts without suppressing other stats", () => {
    const prof = { ...emptyProficiency(), caps: wideCaps,
      jobCumLevel: { warrior: 100_000 },
      groups: { warrior: { tier: 1, cumLevel: 100_000, cultivations: 0 } } };
    expect(rollLevelGrowth({}, "mage", prof, high)).toEqual({
      str: 5, dex: 4, vit: 4, int: 1, spi: 1, luk: 1,
    });
  });

  it("caps clip only the affected roll, never redistribute or reduce existing growth", () => {
    const prof = emptyProficiency();
    const grown = { str: 45, dex: 44, vit: 90 };
    expect(rollLevelGrowth(grown, "warrior", prof, high)).toEqual({
      str: 45, dex: 45, vit: 90, int: 1, spi: 1, luk: 1,
    });
    expect(grown).toEqual({ str: 45, dex: 44, vit: 90 });
  });

  it("99 level rolls are not capped at 297 points", () => {
    const prof = { ...emptyProficiency(), caps: wideCaps };
    let grown = prof.grown;
    for (let i = 0; i < 99; i++) grown = rollLevelGrowth(grown, "none", prof, high);
    expect(Object.values(grown).reduce((a, b) => a + b, 0)).toBe(594);
  });

  it("career mastery expands future HP and MP rolls while retaining earlier records", () => {
    const base = emptyProficiency();
    const trained = { ...base, jobCumLevel: { warrior: 100_000, mage: 100_000 }, groups: {
      warrior: { tier: 1, cumLevel: 100_000, cultivations: 0 },
      mage: { tier: 1, cumLevel: 100_000, cultivations: 0 },
    } };
    for (const version of [1, 2] as const) {
      const before = lifeResourceRangesForProficiency(base, version);
      const after = lifeResourceRangesForProficiency(trained, version);
      expect(after.hpPerLevel.min).toBeGreaterThan(before.hpPerLevel.min);
      expect(after.hpPerLevel.max).toBeGreaterThan(before.hpPerLevel.max);
      expect(after.mpPerLevel.min).toBeGreaterThanOrEqual(before.mpPerLevel.min);
      expect(after.mpPerLevel.expected).toBeGreaterThan(before.mpPerLevel.expected!);
      expect(after.mpPerLevel.max).toBeGreaterThan(before.mpPerLevel.max);
      const initial = { ...rollInitialLifeResourceGrowth(before, high), version };
      const first = rollLifeResourceLevels(initial, 1, 1, before, high).record;
      const next = rollLifeResourceLevels(first, 2, 1, after, (() => {
        let draw = 0;
        return () => ++draw % 3 === 0 ? high() : 0;
      })());
      expect(next.record.gainedHp).toBe(first.gainedHp + after.hpPerLevel.max);
      expect(next.record.gainedMp).toBe(first.gainedMp + after.mpPerLevel.max);
      expect(next.record.baseHp).toBe(first.baseHp);
      expect(next.record.baseMp).toBe(first.baseMp);
    }
  });
});
