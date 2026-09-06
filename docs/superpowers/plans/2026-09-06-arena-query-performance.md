# Arena query performance implementation plan

> Use superpowers:executing-plans inline; AGENTS.md prohibits subagents and repeated approval gates.

**Goal:** Reduce repeated arena database work while preserving self-healing and combat behavior.
**Architecture:** Request-local season reuse and persisted terminal-bracket fast return; mutation paths retain locked recheck.
**Tech Stack:** Next.js route handlers, TypeScript, Drizzle, Vitest.

## Constraints
No cross-request cache, combat balance changes, response trimming, deployment, merge, or push. Reuse /tmp/adventure-performance-20260906.

## Task 1: Tournament service
- [x] Add src/lib/server/pvp/arenaTournamentService.test.ts with DB-boundary doubles. For completed/not_enough_players expect unchanged bracket and no transaction; active/missing must enter transaction. Test failed read propagation and a completion occurring before locked recheck.
- [x] Run npm test -- src/lib/server/pvp/arenaTournamentService.test.ts and confirm regression assertions fail.
- [x] Modify ensureArenaTournament(now, resolvedSeason?) with season = resolvedSeason ?? await getOrCreateCurrentSeason(now). Read only bracket and return terminal results. Preserve existing locked fallback unchanged.
- [x] Run service and existing tournament tests.

## Task 2: Callers and verification
- [x] Test state/tournament routes supply their resolved season to ensureArenaTournament, preserving response phase and auth behavior.
- [x] Change both calls to ensureArenaTournament(now, season).
- [x] Run affected arena and existing performance regression suites, touched-file ESLint, TypeScript, module budgets. Review full diff for lock/error/response compatibility.
- [x] Record results and commit locally on current performance branch.

## Verification results
- Regression tests first failed on terminal result handling and season reuse; the two route tests first failed because the resolved season was not passed.
- 95 related test files / 895 tests passed (arena, PvP, combat, hunt, runtime profiler, resonance).
- Added a final no-cross-request-cache regression and reran the 3 touched test files: 14 tests passed.
- TypeScript with a 4 GiB heap, touched-file ESLint, module budgets and diff whitespace checks passed.
- Self-review: terminal fast path matches both existing terminal early returns; all nonterminal writes still re-read under both locks; caller seasons use the same request timestamp. No new cache, API response changes, or balance changes.
- Expected completed arena state command count: 11 - 2 duplicate season commands - 4 transaction/lock commands + 1 bracket read = 6. Active requests through these routes save one net command; direct service callers incur one extra pre-read while active. Production latency remains unmeasured until authorized deployment.
- No production changes, merge, push, build, or browser E2E performed.
