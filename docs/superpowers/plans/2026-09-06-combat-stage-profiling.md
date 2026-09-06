# Combat stage profiling implementation plan

> Execute inline with superpowers:executing-plans. User instructions prohibit subagents and authorize local implementation, verification and commit without repeated design approval.

**Goal:** Remove unused combat SP calculations and identify hunt/ranking latency stages.

**Architecture:** Split pure combat loadout resolution from SP costing; carry bounded stage measurements through the existing request profiler and instrument the two server routes.

**Tech Stack:** TypeScript, Next.js 16.2.11 Node route handlers, AsyncLocalStorage, Vitest.

## Global constraints

- Preserve combat and SP behavior; no global cache or deployment.
- Stage/counter names must be fixed; no player data or raw query strings.
- Optional profiler fields preserve existing snapshots without stages; measurement failure cannot alter game results.
- Isolated worktree under /tmp; leave unrelated working changes intact.

## Tasks

- [x] 1. Add failing combat regression: SP-cost access must not occur while resolving combat candidates; literal expected candidates cover elemental, primordial catalyst, incomplete and empty loadouts. Extract `resolveElementalResonanceCombat`, make the existing SP resolver reuse it, and switch `resolveV2SkillCast`. Run elemental and combat cast tests.
- [x] 2. Add failing stage-profiler tests: deterministic times, concurrent request separation, unchanged values/errors, no-context and invalid-name no-op, cumulative counters. Implement `profileSyncStage`, `profileAsyncStage`, `profileAsyncSequence`, `recordProfileCounter` using the current request context. Use `{count, errors, totalMs, maxMs}` per fixed stage.
- [x] 3. Add failing HTTP/aggregate tests for propagation, slow-request details, summation, rotation and snapshot independence. Add optional `stages`/`counters` to record/context/feature/slow-request types; merge and clone at existing boundaries.
- [x] 4. Wire hunt intent/transaction, sequential prepare/battle/rewards, saves/replay/broadcast and requested/resolved/turn counters. Wire ranking refresh/cache outcomes by metric and database/compute for combatPower and achievementScore. Add route-level assertions using real request profiles around existing mocked-DB route tests; verify errors and cache behavior retain their semantics.
- [x] 5. Update ops runbook with keys, units, nested timing and interrupted/shared request limitations. Run relevant combat/profiler/hunt/ranking regression suites, TypeScript and touched-file lint. Review final diff and commit only task files on the isolated branch.

## Review and verification notes

- Baseline: 76 elemental/profiler/ranking tests passed before changes.
- Red: combat test failed on SP-cost access; stage propagation tests failed on missing metrics; route tests failed on missing hunt/ranking measurements.
- Green: lightweight combat resolver preserves existing SP tests; route error and shared-cache tests exercise real request scopes around the existing DB boundary doubles.
- Self-review (no subagents per AGENTS.md): no global combat cache, fixed metric cardinality, copied aggregate snapshots, unchanged errors/returns, no operational writes. `hunt.rewards` includes DB work; parent timings overlap children. These interpretation limits are documented in the ops runbook.
- The baseline TypeScript target is ES2017, so test fixtures use `BigInt(0)` rather than bigint literals. Typechecking uses the CI heap setting (`NODE_OPTIONS=--max-old-space-size=4096`); the default 2GB process exhausted its heap.

## Final validation

- `npm test -- src/adventure/v2/combat src/adventure/data/v2/elementalResonance.test.ts src/adventure/data/v2/v2Skills.test.ts src/lib/server/runtimeProfiler src/lib/server/huntRoute.test.ts src/app/api/rankings/route.test.ts src/app/api/admin/runtime-profiler/route.test.ts`: 89 files, 976 tests passed.
- `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`: passed.
- ESLint on changed TypeScript files and runtimeProfiler directory: passed without output.
- `npm run check-module-budgets`: passed (12 budgeted files).
- `git diff --check`: passed.
- No production build, browser E2E, push, merge or deployment was performed. Remaining operational latency attribution requires these diagnostics in an explicitly authorized future deployment; the earlier ~20% result was a local prototype measurement, not a live API improvement claim.

## Deployment integration validation (2026-09-06)

- User explicitly requested deployment of source commit `90d1bf4072aa51bbff1cdcad4d7193139a5e9a86`.
- Ported hunt instrumentation into the deployed split `huntExecution` / `huntRequest` modules; kept existing DB phase tracking and newer hunt behavior. Retained both sides' independent regression tests and both profiler field families.
- Integrated against the evening release merged as `e20d98553ae4711e4dcda2479b9f9a3625b2ccd9`.
- Focused combat, elemental/SP, profiler, hunt, rankings and admin profiler tests: 123 files, 1,267 tests passed.
- TypeScript (`NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit`), touched-file ESLint, 64 module budgets and `git diff --check`: passed.
- Deployment still requires the exact merged main SHA's full CI and production artifact; maintenance remains enabled after deployment until the user requests release.
