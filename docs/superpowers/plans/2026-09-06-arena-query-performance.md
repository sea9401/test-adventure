# Arena query performance implementation plan

> Use superpowers:executing-plans inline; AGENTS.md prohibits subagents and repeated approval gates.

**Goal:** Reduce repeated arena database work while preserving self-healing and combat behavior.
**Architecture:** Request-local season reuse and persisted terminal-bracket fast return; mutation paths retain locked recheck.
**Tech Stack:** Next.js route handlers, TypeScript, Drizzle, Vitest.

## Constraints
No cross-request cache, combat balance changes, response trimming, deployment, merge, or push. Reuse /tmp/adventure-performance-20260906.

## Task 1: Tournament service
- [ ] Add src/lib/server/pvp/arenaTournamentService.test.ts with DB-boundary doubles. For completed/not_enough_players expect unchanged bracket and no transaction; active/missing must enter transaction. Test failed read propagation and a completion occurring before locked recheck.
- [ ] Run npm test -- src/lib/server/pvp/arenaTournamentService.test.ts and confirm regression assertions fail.
- [ ] Modify ensureArenaTournament(now, resolvedSeason?) with season = resolvedSeason ?? await getOrCreateCurrentSeason(now). Read only bracket and return terminal results. Preserve existing locked fallback unchanged.
- [ ] Run service and existing tournament tests.

## Task 2: Callers and verification
- [ ] Test state/tournament routes supply their resolved season to ensureArenaTournament, preserving response phase and auth behavior.
- [ ] Change both calls to ensureArenaTournament(now, season).
- [ ] Run affected arena and existing performance regression suites, touched-file ESLint, TypeScript, module budgets. Review full diff for lock/error/response compatibility.
- [ ] Record results and commit locally on current performance branch.
