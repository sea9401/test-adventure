# Independent mastery-based level growth

**Goal:** Roll all six primary stats independently per level, with mastery increasing each range and no shared point budget; expand HP/MP ranges with related mastery.

**Architecture:** Keep the existing related mastery aggregation (weighted class and concrete job career profiles). Replace weighted selection with six independent uniform integer rolls. Per-stat range is `0..1+floor(log2(1+relatedMastery/10000))`. No hard maximum; each roll is clipped only by that stat's remaining cultivation cap. No transfer of unused rolls. Current class/focus does not grant free growth without mastery. HP/MP retain their existing resource baseline and floor/cap contributions; add the STR/SPI mastery step to their minimum and the STR+VIT/SPI+INT steps to their maximum respectively.

**Tech Stack:** TypeScript, Vitest.

## Constraints

- Preserve existing grown stats and accumulated HP/MP; do not reroll past levels or compress saves.
- Legacy resource records retain their existing conversion until rejob, as the current compatibility contract requires; rolled records use mastery ranges on future rolls.
- Retain resource version 1/2 differences, cultivation caps and reset rules.
- No deployment or external data writes. No subagents. Work on the current branch.
- The 20-million mastery / 8 growth example is not a calibration requirement.

## Execution

- [x] Add failing tests: zero and maximum rolls for all six stats, independent mixed rolls, high mastery exceeding three, per-stat caps without redistribution, level-100 growth exceeding 297, future HP/MP mastery growth preserving records.
- [x] Implement `statGrowthRanges(prof)` and replace `rollLevelGrowth`; retain its class argument for call-site compatibility, replace simulation point budget with an explicit level count.
- [x] Add mastery terms to `lifeResourceRangesForProficiency` and test both resource versions.
- [x] Update obsolete allocation tests and simulator callers; verify hunt and both consumable level-up paths.
- [x] Update current manual and growth design documentation. Publish calibration examples and simulation results here.
- [x] Run growth/data/server regression suites, lint, TypeScript and diff checks; review and commit the completed change.

## Calibration

Related mastery 0 / 10,000 / 100,000 / 1,000,000 / 20,000,000 yields primary ranges 0–1 / 0–2 / 0–4 / 0–7 / 0–11. At zero mastery expected total remains 3 per level, but individual totals range from 0 to 6. Caps still determine realizable growth.

Deterministic simulation: `npx tsx scripts/sim-independent-growth.ts`, 500 seeds per fixed warrior career snapshot, 99 level rolls, ample stat caps. These measure growth, not combat balance or actual cultivation availability.

| Warrior group mastery | Expected total | Observed mean | Observed min–max |
| --- | --- | --- | --- |
| 0 | 297 | 296.562 | 250–336 |
| 10,000 | 346.5 | 346.040 | 296–385 |
| 100,000 | 643.5 | 643.692 | 554–710 |
| 1,000,000 | 1,089 | 1,090.036 | 961–1,197 |
| 20,000,000 | 1,683 | 1,684.510 | 1,500–1,863 |

Career aggregation retains the previous additive group + specific-job contributions; these rows have group mastery only. Actual characters may have both, and different job profiles give different stat ranges. Resource samples keep cultivation caps at 60 to isolate mastery.

Validation: 163 files / 2,238 tests passed across v2 data, growth grants, character creation, combat derivation, rejob and the level-100 item route. Additional hunt/state/manual checks: 13 files / 160 tests passed (some overlap). TypeScript, changed-file ESLint and diff whitespace checks passed. Inline review verified independent draws, per-stat clipping, preservation of stored growth and the documented legacy resource exception. No production deployment.
