import { describe, expect, it, vi } from "vitest";
import { emptyProficiency, parseProficiency, resetLevelGrowth, addCumLevel, addJobCumLevel } from "./proficiency";
import { computeStatFloors, masteryGrowthBonus, statGrowthRanges, rollLevelGrowth, lifeResourceRangesForProficiency } from "./statGrowth";
import { masteryResourceRange, rollInitialLifeResourceGrowth, rollLifeResourceLevels } from "./lifeResourceGrowth";
import { V2_STAT_KEYS } from "./v2StatKeys";

const profAt = (mastery: number) => ({ ...emptyProficiency(), groups: { warrior: { tier: 1, cultivations: 0, cumLevel: mastery } }, jobCumLevel: { warrior: mastery }, caps: Object.fromEntries(V2_STAT_KEYS.map(k => [k, 10_000])) });
const seq = (...values: number[]) => () => values.shift() ?? 0;

describe("continuous mastery growth", () => {
  it("retains fractional mastery and distinguishes mastery inside the same integer range", () => {
    expect(masteryGrowthBonus(2500.5)).toBeCloseTo(Math.log2(1.5001), 12);
    const a = statGrowthRanges(profAt(100_000)).str;
    const b = statGrowthRanges(profAt(110_000)).str;
    expect(a.max).toBe(b.max);
    expect(b.expected).toBeGreaterThan(a.expected!);
    expect(b.upperProbability).toBeGreaterThan(a.upperProbability!);
  });
  it("chooses 0..4 or 0..5 with 30% wider range, then rolls independently", () => {
    const p = profAt(5000 * (2 ** 3.3 - 1));
    // Integer stored mastery approximates U=4.3.
    p.groups.warrior.cumLevel = 44_246;
    p.jobCumLevel.warrior = 44_246;
    expect(statGrowthRanges(p).str.upperProbability).toBeCloseTo(0.3, 4);
    expect(rollLevelGrowth({}, "warrior", p, seq(0.29, 0.999)).str).toBe(5);
    expect(rollLevelGrowth({}, "warrior", p, seq(0.31, 0.999)).str).toBe(4);
    expect(rollLevelGrowth({}, "warrior", p, seq(0.29, 0)).str).toBeUndefined();
  });
  it("can grow all six stats by two in one level and consumes two draws even at caps", () => {
    const p = { ...profAt(15_000), jobCumLevel: { warrior: 15_000, mage: 15_000, rogue: 15_000 }, groups: Object.fromEntries(["warrior", "mage", "rogue"].map(k => [k, { tier: 1, cultivations: 0, cumLevel: 15_000 }])) };
    const ranges = statGrowthRanges(p);
    const values = V2_STAT_KEYS.flatMap(k => [0.999, 2.5 / (ranges[k].lowerMax! + 1)]);
    expect(rollLevelGrowth({}, "warrior", p, seq(...values))).toEqual(Object.fromEntries(V2_STAT_KEYS.map(k => [k, 2])));
    const rng = vi.fn(() => 0.5);
    rollLevelGrowth({ str: 100_000 }, "warrior", p, rng);
    expect(rng).toHaveBeenCalledTimes(12);
  });
  it("freezes legacy floors once, preserves growth, and refreshes only on rejob", () => {
    const raw = { ...profAt(100_000), statFloorLevels: { warrior: 10_000 }, grown: { str: 22 } };
    const before = computeStatFloors(raw);
    const parsed = parseProficiency(raw);
    expect(computeStatFloors(parsed)).toEqual(before);
    expect(parsed.grown).toEqual(raw.grown);
    const trained = addJobCumLevel(addCumLevel(parsed, "warrior", 9_900_000), "warrior", 9_900_000);
    expect(computeStatFloors(parseProficiency(trained))).toEqual(before);
    const reset = resetLevelGrowth(trained);
    expect(computeStatFloors(reset).str).toBe(256);
    expect(reset.grown).toEqual({});
    expect(computeStatFloors(parseProficiency(reset))).toEqual(computeStatFloors(reset));
    expect(computeStatFloors(resetLevelGrowth({ ...trained, statFloorLevels: {} }))).toEqual(computeStatFloors(reset));
  });
  it("provides generous initial resources, exact resource means, and retains previous rolls", () => {
    const base = lifeResourceRangesForProficiency(emptyProficiency());
    expect(base.baseHp).toMatchObject({ min: 250, max: 350 });
    expect(base.baseMp).toMatchObject({ min: 120, max: 180 });
    const ranges = lifeResourceRangesForProficiency(profAt(100_000));
    const strB = Math.log2(21), vitB = Math.log2(11);
    expect(ranges.hpPerLevel.expected).toBeCloseTo(10 + 1000 / 2 + 3 * strB + 1.5 * vitB, 10);
    const record = { ...rollInitialLifeResourceGrowth(base, () => 0), baseHp: 170, baseMp: 80, gainedHp: 90, gainedMp: 40, rolledLevel: 10 };
    const rolled = rollLifeResourceLevels(record, 10, 1, ranges, () => 0);
    expect(rolled.record.baseHp).toBe(170);
    expect(rolled.record.baseMp).toBe(80);
    expect(rolled.record.gainedHp).toBe(90 + rolled.hpGain);
    expect(record.gainedHp).toBe(90);
  });
});


describe("distribution and migration invariants", () => {
  it("HP rounds shift and spread independently and its preview mean matches the full distribution", () => {
    const base = lifeResourceRangesForProficiency(emptyProficiency());
    const hp = masteryResourceRange({ min: 8, max: 12 }, 1.25, 2.5);
    const ranges = { ...base, hpPerLevel: hp };
    const record = rollInitialLifeResourceGrowth(base, () => 0);
    const values: number[] = [];
    // Four equally likely shift draws, two spread draws, and 56 quantiles exactly cover
    // uniform ranges with 7 or 8 possible values (LCM=56).
    for (let a = 0; a < 4; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 56; c++) {
      values.push(rollLifeResourceLevels(record, 1, 1, ranges,
        seq((a + 0.5) / 4, (b + 0.5) / 2, (c + 0.5) / 56)).hpGain);
    }
    expect(Math.min(...values)).toBe(hp.min);
    expect(Math.max(...values)).toBe(hp.max);
    expect(values.reduce((sum, n) => sum + n, 0) / values.length).toBe(hp.expected);
    expect(hp.expected).toBe(12.5);
  });
  it("missing or damaged snapshots recover the old life once, including pre-floor records", () => {
    const raw = { groups: { warrior: { tier: 3, cultivations: 0, cumLevel: 900_000 } }, grown: { str: 10 }, growthScaleVersion: 1 };
    const parsed = parseProficiency(raw);
    const floors = computeStatFloors(parsed);
    expect(floors.str).toBeGreaterThan(15);
    for (const lifeStartStats of [{ str: 999 }, [], { ...floors, str: -1 }]) {
      expect(parseProficiency({ ...raw, lifeStartStats }).lifeStartStats).toEqual(floors);
    }
    const changed = { ...parsed, statFloorLevels: {}, groups: {} };
    expect(computeStatFloors(parseProficiency(changed))).toEqual(floors);
    expect(computeStatFloors(resetLevelGrowth(changed)).str).toBe(15);
  });
  it("a capped stat never shifts other stat dice", () => {
    const p = profAt(100_000);
    const dice = [0.1, 0.9, 0.4, 0.8, 0.7, 0.3, 0.2, 0.6, 0.9, 0.5, 0.3, 0.7];
    const free = rollLevelGrowth({}, "warrior", p, seq(...dice));
    const capped = rollLevelGrowth({ str: 100_000 }, "warrior", p, seq(...dice));
    for (const stat of V2_STAT_KEYS.filter(k => k !== "str")) expect(capped[stat]).toBe(free[stat]);
  });
});
