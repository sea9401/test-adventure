# Combat Third Pass Implementation Plan

> Execute inline with executing-plans, TDD and verification-before-completion.

**Goal:** Expand missing telemetry, count committed casts and measure catalog builds.
**Architecture:** Existing synchronous collector; numeric hooks; derived paired fixtures.
**Tech Stack:** TypeScript, Vitest, tsx, existing pure progression/engine helpers.

## Constraints

No balance, snapshots, DB, deployment, push or subagents. Reuse isolated worktree.
Normal engine output and random draw order must remain unchanged.

- [x] Cast counts: test that repeated resolver evaluations plus one committed
  `appendSkillCastLog` yield one `skill_cast` row, even with log retention off.
  Add metric at that existing boundary, deriving actor from side/turn metadata.
  Test real PvE/PvP casts and no-cast cases against unchanged engine output.
- [x] Missing metrics: extend fixed fixtures for delayed sword shadow,
  reflection/counters, unique damage/healing and capped recovery. Run RED before
  hooks, then GREEN with existing effect tests. Keep HP-bound damage, shield
  absorption, actual recovery and survival restoration distinct. Do not double
  count helper calls that already record damage.
- [x] Representative comparison: create a local script/fixture builder using
  `buildLevelDesignProgressionSnapshot` with fixed careerWins, depth, seed and
  enhancement. Supply the same venom skills to both builds. Test exact equipment
  differences and identical shared progression/skills; run paired seeded PvE/PvP
  comparisons and document actual results, not guesses.
- [x] Review coverage and verification: record uncovered paths explicitly;
  focused tests in both flag modes, full suite, lint, standalone typecheck,
  local build and module budgets. No golden regeneration. Commit verified work,
  report measured results and leave current branch/worktree in place.

## Implementation notes

- Added committed cast counts independently from resolver gate evaluations.
  Fixtures cover real PvE/PvP casts, rejected selection and disabled log retention.
- Added tier6 unique fixed/magic damage and capped recovery, sword shadow,
  on-hit reflection, PvE rune/martial counters, PvP extra attacks, selected
  recovery and survival restoration. Coverage remains explicitly partial;
  omitted paths are listed in `docs/combat-comparison.md` and report metadata.
- Extracted PvE periodic recovery (115 lines) and PvP sword shadow (95 lines),
  preserving old exports and existing size ceilings. No balance/RNG/log changes.
- Catalog probe uses identical LUK progression and auto-selected skills, not a
  live user's unavailable pattern. Added a clearly labeled synthetic sustained
  target because both builds die early against the unchanged depth-84 monster.
- Manual review per AGENTS (no subagents): checked mutation/RNG invariance,
  overkill/overheal bounds, target attribution, preserved exports and replayability.
- An exploratory all-flags-on golden run had three snapshot mismatches: those
  snapshots belong to the default flag configuration. They were not regenerated.
  Default goldens passed; all-on numeric/replay invariance tests passed separately.

## Final verification (2026-09-06)

- `npm test`: 1,209 files passed, 5 skipped; 9,536 tests passed, 23 skipped.
- All-on focused numeric/replay tests: 4 files, 24 tests passed.
- `npm run lint`, standalone `tsc --noEmit --incremental false` (4 GB heap),
  `npm run build`, `npm run check-module-budgets` (62 files), and
  `git diff --check`: passed. Build ran locally, not deployment.
- Main checkout remained clean; work stays on the existing isolated branch.
