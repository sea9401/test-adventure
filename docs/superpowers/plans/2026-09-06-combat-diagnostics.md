# Combat Diagnostics Implementation Plan

> Execute inline with executing-plans; no subagents per AGENTS.md.

**Goal:** Explain skill eligibility and resolved combat quantities in local reports.
**Architecture:** Opt-in synchronous aggregate collector, calculation-site hooks,
and comparison report integration. No replay-string parsing.
**Tech Stack:** TypeScript, Vitest, tsx; existing engine and fixture data.

## Constraints

No balance, deployment, push, DB, production settings or snapshot regeneration.
Preserve default output and RNG ordering. Reuse the existing isolated worktree.

- [x] Collector: create `combatDiagnostics.ts` and tests. Test independent
  metric accumulation and nested exception restoration before implementation.
  API: `withCombatDiagnostics(collector, run)`,
  `createCombatDiagnostics()`, `recordCombatMetric(metric, source, target, value)`.
  Counts accumulate only finite positive values; collector snapshots are copies.
- [x] Selector reasons: instrument `combatShared.ts` / `combatPattern.ts` with
  observed gates, deduplicated within each resolver evaluation. Test a known
  active skill with MP=0, cooldown=3, failed proc and successful selection;
  assert untouched full resolver output and no extra random calls.
- [x] Resolved metrics (primary paths, partial coverage): add explicit hooks at combat calculation sites for
  direct attacks/skills, poison/bleed ticks, healing and shields. Each hook has
  an independent literal fixture; distinguish effective HP from resolved damage.
  Record coverage boundaries instead of inventing unavailable attribution.
- [x] Comparison: opt-in `diagnostics` input, per-trial aggregate snapshots,
  effective coverage metadata; identical seeded builds retain equal reports.
  Test the CLI with a diagnostic fixture and diagnostics-disabled compatibility.
- [x] Verify: focused tests, seeded golden regression, both engine flag modes,
  full suite, lint, typecheck, module budgets and build. Manually review diff,
  document commands/counts/limitations, commit locally and leave worktree clean.

For each implementation task, run its new tests to observe RED, implement, run
GREEN plus existing adjacent tests, and commit verified changes. No tests may
derive expected aggregate values using the production aggregation helper.

## Execution and verification — 2026-09-06

Baseline: 3 files / 15 tests passed. Observed RED for missing collector module,
five missing gate reasons, actor separation, overkill/overheal metrics, separate
DoT totals, skill attribution and comparison output. All then passed.

Full suite: 1,206 files passed, 5 skipped; 9,517 tests passed, 23 skipped;
310.95 seconds. Final focused default-mode run (including added CLI/PvP checks):
6 files / 30 tests passed. Final enabled core/ATB/proc flag run after the PvP
input refactor: 4 files / 19 tests passed. This focused verification covers the
late test addition and forwarding-only refactor after the full run started.

Full lint passed; focused lint of the final edited files passed. Standalone
TypeScript check passed after all code/test changes. Final production build
passed (16.6-second compilation; 612 generated pages). All 59 module budgets
passed without raising an existing limit. Golden expectations were unchanged.
No production or external state was changed.

Manual review used the code-review checklist inline (AGENTS forbids subagents).
Checked unchanged gate short-circuit order, RNG consumption, capped vs net HP
semantics, disabled collector behavior, scope restoration, and replay independence.
PvP actor metadata is supplied when constructing its input, not mutated afterward.
Runtime and comparison changes share the new collector and are committed together.

## Remaining coverage (not claimed complete)

- [ ] All reflection, delayed damage and special-equipment events.
- [ ] Remaining recovery/extra-hit paths and survival guard/restoration accounting.
- [ ] Final cast counting across recalculations; unvisited candidate explanations.

These require additional calculation-site fixtures. The report sets
`diagnosticCoverage.complete: false`; see `docs/combat-comparison.md` for exact
metric semantics and the covered paths. Do not use these partial sums as a
complete balance verdict. No real-player build tuning or deployment performed.
