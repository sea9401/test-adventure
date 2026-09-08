import { describe, expect, it } from "vitest";
import { addCumLevel, addJobCumLevel, emptyProficiency, parseProficiency } from "./proficiency";
import { computeStatFloors, lifeResourceRangesForProficiency, masteryStartingStats, statGrowthMasteryTotals, statGrowthRanges } from "./statGrowth";
import { V2_JOB_CATALOG } from "./v2JobCatalog";
import { V2_STAT_KEYS } from "./v2StatKeys";

describe("growth counts direct job mastery once", () => {
  it.each(["warrior", "shieldman", "squire", "paladin"])("%s wins count only its own profile, not the group total", jobId => {
    const job = V2_JOB_CATALOG[jobId];
    expect(job).toBeDefined();
    const p = addJobCumLevel(addCumLevel(emptyProficiency(), "warrior", 100), jobId, 100);
    const maxWeight = Math.max(...Object.values(job.cultivateProfile));
    const totals = statGrowthMasteryTotals(p);
    for (const stat of V2_STAT_KEYS) expect(totals[stat]).toBeCloseTo(100 * (job.cultivateProfile[stat] ?? 0) / maxWeight, 10);
  });
  it("group totals never change stat, next-life or resource growth", () => {
    const direct = { ...emptyProficiency(), jobCumLevel: { warrior: 1000, shieldman: 2000, paladin: 3000, mage: 9000 } };
    const aggregate = addCumLevel(addCumLevel(direct, "warrior", 6000), "mage", 9000);
    expect(statGrowthMasteryTotals(aggregate)).toEqual(statGrowthMasteryTotals(direct));
    expect(statGrowthRanges(aggregate)).toEqual(statGrowthRanges(direct));
    expect(masteryStartingStats(aggregate)).toEqual(masteryStartingStats(direct));
    expect(lifeResourceRangesForProficiency(aggregate)).toEqual(lifeResourceRangesForProficiency(direct));
  });
  it("never invents direct beginner mastery from an old group-only record", () => {
    const p = parseProficiency({ groups: { warrior: { cumLevel: 100_000 } } });
    expect(statGrowthMasteryTotals(p)).toEqual(Object.fromEntries(V2_STAT_KEYS.map(stat => [stat, 0])));
    expect(p.groups.warrior.cumLevel).toBe(100_000);
  });
  it("preserves existing life floors, gains and HP/MP when group totals increase", () => {
    const p = parseProficiency({ ...emptyProficiency(),
      lifeStartStats: { str: 111, dex: 91, vit: 91, int: 15, spi: 15, luk: 15 },
      grown: { str: 50 }, jobCumLevel: { warrior: 100_000 },
      lifeResourceGrowth: { version: 2, rolledLevel: 50, baseHp: 300, baseMp: 150, gainedHp: 700, gainedMp: 200 },
    });
    const next = parseProficiency(addCumLevel(p, "warrior", 1_000_000));
    expect(computeStatFloors(next)).toEqual(computeStatFloors(p));
    expect(next.grown).toEqual(p.grown);
    expect(next.lifeResourceGrowth).toEqual(p.lifeResourceGrowth);
  });
});
