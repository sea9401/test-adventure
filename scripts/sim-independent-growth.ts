// Run: npx tsx scripts/sim-independent-growth.ts
// Fixed career snapshots isolate mastery effects; wide caps isolate roll totals.
import { emptyProficiency } from "../src/adventure/data/v2/proficiency";
import { rollLevelGrowth, statGrowthRanges, lifeResourceRangesForProficiency } from "../src/adventure/data/v2/statGrowth";
import { V2_STAT_KEYS } from "../src/adventure/data/v2/v2StatKeys";

const samples = 500;
for (const mastery of [0, 10_000, 100_000, 1_000_000, 20_000_000]) {
  const prof = { ...emptyProficiency(),
    caps: Object.fromEntries(V2_STAT_KEYS.map((s) => [s, 100_000])),
    groups: { warrior: { tier: 1, cumLevel: mastery, cultivations: 0 } } };
  const totals: number[] = [];
  for (let seed = 1; seed <= samples; seed++) {
    let state = seed;
    const rng = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
    const grown = rollLevelGrowth({}, "warrior", prof, rng, { levels: 99 });
    totals.push(Object.values(grown).reduce((sum, n) => sum + n, 0));
  }
  const ranges = statGrowthRanges(prof);
  // Resource illustration keeps baseline cultivation caps (60) for comparability.
  const resources = lifeResourceRangesForProficiency({ ...prof, caps: {} });
  console.log(JSON.stringify({ mastery, samples, ranges,
    expected: 99 * V2_STAT_KEYS.reduce((sum, s) => sum + ranges[s].max / 2, 0),
    mean: totals.reduce((a, b) => a + b, 0) / samples,
    min: Math.min(...totals), max: Math.max(...totals),
    hp: resources.hpPerLevel, mp: resources.mpPerLevel }));
}
