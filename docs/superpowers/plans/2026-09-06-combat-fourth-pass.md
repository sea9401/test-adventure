# Combat Fourth Pass Implementation Plan

> Execute inline with superpowers:executing-plans, TDD and completion verification.

**Goal:** Complete the enumerated telemetry gaps, detect accounting discrepancies,
and measure gear sensitivity across controlled scenarios.
**Architecture:** Existing calculation-site hooks plus pure HP ledger and a local
matrix builder. No runtime mutation pipeline redesign.
**Tech Stack:** TypeScript, Vitest, tsx, existing pure catalog progression builder.

## Global constraints

No gameplay/balance/RNG/replay changes, DB reads, deployment, push or subagents.
Preserve existing work and golden snapshots. Use current isolated worktree.

## 1. Remaining numeric hooks

Files: `src/adventure/v2/combat/engine.pvpOperations.ts`, `engine.pveOperations.ts`,
`engineSupport.ts`, `engine.enemyPhase.ts`, `engine.enemySkills.ts`,
`engine.playerPhase.ts`, `engine.pvpPhase.ts`, `engine.pvpSkills.ts`, `engine.atb.ts`,
`engine.ts`; tests in `combatRemainingDiagnostics.test.ts` and existing fixtures.

- [x] Write literal fixtures for rune/martial/dodge counter HP damage, capped
  potion/evasion/extra-hit/regen recovery and manual endurance. For example a
  100-HP actor at HP 95 consuming an HP potion must record healing 5, not its
  uncapped heal value; a lethal endurance rescue records restoration 1 once.
- [x] Run focused tests and observe missing rows (RED).
- [x] Add `recordCombatDamage(source, target, beforeHp, hpBound, absorbed)` and
  `recordCombatMetric("healing", source, target, actual)` at the numeric sites.
  At manual endurance's first HP=1 assignment record restoration 1; not its log.
- [x] Run GREEN with existing effect/golden tests. Review nearby HP mutations and
  document any uninstrumented special paths rather than claiming total coverage.

## 2. HP reconciliation

Create `combatHpLedger.ts` and `combatHpLedger.test.ts`; modify `combatComparison.ts`.
Interface: `reconcileCombatHp(rows, [{target, initialHp, finalHp}])` returns each
target's damage/healing/restoration, expectedHp, residual and balanced boolean.

- [x] Tests: initial 100, damage 40, healing 5, rescue 1, final 66 => residual 0;
  remove healing => residual +5; duplicate damage => residual +40. Ignore unrelated
  targets and non-HP metrics. Reject NaN/negative HP and malformed HP metric totals.
- [x] Observe integration RED; implement a pure summation with epsilon 1e-7, no HP clamping.
- [x] Attach ledger only when diagnostics are enabled. Preserve normal runs.
  PvE targets use player/enemy; PvP p1/p2. Input HP is the stated start baseline.
- [x] Test zero residual on seeded simple covered real-engine scenarios and
  helper fixtures; deliberately missing/duplicate records must fail reconciliation.
  Keep coverage false and list baseline-transform/reset/cost limitations.

## 3. Comparison matrix

Create `scripts/compare-venom-matrix.ts` and `venomComparisonMatrix.test.ts`.
Reuse `buildVenomComparisonCases` and `compareCombatBuilds`.

- [x] Test 12 scenarios: three patterns (auto, basic-only, skill-until-5-poison
  then basic), two target physical defenses (0/1000), two maxTurns (20/120).
  Both actors in each pair share the exact pattern, progression and target;
  only the catalog weapon differs. All pattern skills must be learned.
- [x] Implement builder and guarded local CLI without env-file loading; verify
  structural/replay tests and active-flag fixtures (not a separate builder RED).
  Synthetic high-HP target retains catalog properties except explicit HP/ATK/DEF.
- [x] Run paired 100-seed matrix (2,400 battles), record clean revision, flags,
  scenario definitions, HP-loss means and ledger residual counts. Run existing
  three-case probe to check continuity; don't infer universal class balance.

## 4. Finish

- [x] Update `docs/combat-comparison.md`, coverage metadata and audited budgets.
- [x] Manual review; full suite, active-flag focused tests, lint, tsc, build,
  budgets and diff check. Fix causes, never regenerate goldens to hide drift.
- [x] Commit code on current branch; rerun clean-revision CLI, document actual
  measurements in `docs/combat-fourth-pass-results.md`, commit docs and hand off.

## Audit notes

- AP adapters receive empty fired-skill lists in both phase implementations;
  there is no active AP catalog. Omitted inactive hooks instead of restoring behavior.
- Standard numeric hooks only; boss-specific damage/reset, PvP freeze burst,
  HP costs and maximum-HP transforms remain explicitly outside complete coverage.
- Engine budget ceilings increased only by 6/1 lines for instrumentation in
  `engine.ts`/`engine.enemySkills.ts`; no unrelated extraction or line compression.
- Initial fixture failures also exposed too-short ATB windows, an obsolete bleed
  field and a missing potion payload. Fixed tests to exercise real supported
  actions; no production behavior changed to accommodate those fixture errors.
- Manual review follows the requesting-code-review checklist without subagents,
  as required by AGENTS.md. Keep branch/worktree; no integration menu or deployment.
- Final code validation: 9,572 tests passed, 23 existing skips; active-flag focused
  suite 31 passed; lint, independent tsc, local build, 64 module budgets and diff
  whitespace checks passed. Golden snapshots were not regenerated.
