# Continuous mastery growth implementation plan

> Execute locally in this session, as authorized by the user. No deployment, external writes, or subagents.

**Goal:** Independent continuous mastery growth for all six stats and HP/MP, with current-life preservation and mastery-based rejob starting stats.

**Architecture:** Pure mastery math/profile aggregation module; proficiency owns a persisted current-life floor snapshot and legacy migration. Resource ranges carry the distribution and expected value so preview and rolls share one definition. Existing level grant paths retain their common helpers.

**Authoritative constants:** B=log2(1+M/5000), stat upper expectation=1+B, rejob floor=15+floor(22B), HP/MP mastery modifier=3B, new initial HP=250..350 and MP=120..180 before existing step contributions. No total growth budget or historical rerolls.

1. Add failing regression tests for fractional range selection, six simultaneous gains, cap/RNG independence, snapshot migration/reset, and resource distributions and preserved records. Run Vitest to confirm failures.
2. Extract shared mastery math and cultivation profiles; implement fixed two draws per stat. Add validated lifeStartStats snapshot to proficiency parsing; freeze legacy floors once and refresh only on level reset. Stop accumulating statFloorLevels in all level grant paths.
3. Implement independently rounded resource mastery modifiers, exact means and possible bounds. Increase initial resource baselines while preserving versions 1/2 and stored records. Verify rejob and new-character call sites.
4. Expose stat probabilities/means and current/next rejob resource previews in state and character UI. Update player guidance/simulator as applicable. Read local Next guidance before UI changes.
5. Update obsolete assertions; run growth, proficiency, resource, hunt, EXP, target, rejob, derive, character creation, and state tests. Run TypeScript, targeted ESLint, diff checks and deterministic distribution simulation.
6. Review own diff and current-life compatibility. Commit only task files on current branch; report validation and deployment status.

## Implementation validation

- Implemented shared mastery math, current-life snapshots, continuous stat/resource distributions, all level grant paths, and character/manual previews.
- Initial regression run: all five new behavior tests failed against the previous implementation. Final coverage also includes distribution enumeration, legacy migration, rejob route persistence, and RNG-free rendering.
- Related Vitest run: 175 files / 2,380 tests passed (includes the current shared workspace's additional catalog tests).
- Fixed-seed simulation: 500 careers × 99 levels at each of ten mastery values. Six-stat growth totals, constant warrior mastery and ample caps:

| Related warrior mastery | Analytic mean total | Sample mean total |
| --- | ---: | ---: |
| 0 | 297.00 | 297.01 |
| 100,000 | 856.90 | 856.44 |
| 1,000,000 | 1,334.89 | 1,334.03 |
| 10,000,000 | 1,826.60 | 1,825.03 |

The zero-mastery 297 is an average, not a maximum. Each stat still rolls independently; actual caps may reduce gains. Resource means were also checked against exact enumeration of rounding outcomes. Existing recorded HP/MP are not rerolled. Existing level-design combat fixtures intentionally retain legacy life floors; their higher SPD under continuous future growth required updating the expected band from 900–1,100 to 900–1,200 (observed 1,150.55), while preserving equipment-transition win-rate assertions.

TypeScript (`tsc --noEmit`, 4 GB heap), ESLint on changed/new TypeScript files, and `git diff --check` passed. Review followed the repository's no-subagent rule. Deployment and external writes were not performed.
