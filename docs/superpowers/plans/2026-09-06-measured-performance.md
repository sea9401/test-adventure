# Measured Performance Implementation Plan

> Execute sequentially with executing-plans. No subagents, deployment, push, or operational configuration changes.

**Goal:** Clarify measured failures and safely address the next measured bottlenecks.

**Architecture:** Extend existing request-local profiling, keep state caching short-lived and instance-local, reuse locked gathering snapshots rather than weakening transactional protection.

**Tech Stack:** TypeScript, Next.js 16, React, Drizzle/PostgreSQL, Vitest.

## Tasks

- [x] 1. Add profiler tests where HTTP 500, aborted 200, aborted 500, and successful 200 preserve the legacy combined counter while exposing distinct counts. Modify `runtimeProfiler/types.ts` and `aggregate.ts`, verify tests, commit.
- [x] 2. Add deterministic request phase tests for elapsed time, DB deltas, exceptions, no active profile, and isolated concurrent contexts. Extend `requestContext.ts`, `types.ts`, `aggregate.ts`, `httpInstrumentation.ts`; instrument `huntExecution.ts` with preparation/battle/settlement boundaries. Run hunt and profiler regressions, commit.
- [x] 3. Inspect `GameStateProvider.tsx` refresh and `fetchGameState.ts` consumers. Test concurrent refreshes and refresh-after-mutation races; implement a bounded core refresh coordinator without stale balance overwrites. Run provider/client tests and typecheck, commit.
- [x] 4. Trace fishing reel and woodcutting chop read/write order and their bonus helpers. Add regression assertions for reduced actual DB-access boundary calls with unchanged rewards/version behavior before changing production code. Apply only proven safe reuse/batching. Run route and persistence tests, commit.
- [x] Final: complete tests, lint, typecheck, build, budgets and diff check; record local measurements and limitations. Keep all work on the current branch.

## Validation approach

For each behavior change write and run a failing test first. Existing no-change refactors use current deterministic regressions. Review source/lock ordering before and after each database change. Full suite must pass without updating battle golden outputs. No live performance improvement claim until separately authorized deployment and remeasurement.
