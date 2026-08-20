# Database Query Batching Implementation Plan

**Goal:** Reduce PostgreSQL round trips in the hunt hot path and expose endpoint-level save/life query attribution without changing game behavior.

**Tech Stack:** Next.js 16.2.11 Route Handlers, Drizzle ORM, PostgreSQL, TypeScript, Vitest.

## Constraints

- Do not deploy or change maintenance mode.
- Do not change the pool size or RDS settings.
- Preserve hunt transaction and lock ordering.
- Write and observe a failing regression test before behavior changes.

### Task 1: Multi-key save primitives

**Files:**
- Create: `src/lib/server/savesKv.test.ts`
- Modify: `src/lib/server/savesKv.ts`

- [ ] Add failing tests for one-query multi-key reads with fallbacks, deterministic locked reads, empty input, and one-statement multi-row upsert.
- [ ] Run the focused test and confirm the missing-export failure.
- [ ] Implement `readSaves`, `lockSavesForUpdate`, and `upsertSaves`.
- [ ] Run the focused test and TypeScript.
- [ ] Commit the task.

### Task 2: Hunt save preload and single flush

**Files:**
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Modify: `src/lib/server/huntRoute.test.ts`
- Modify: `src/lib/server/v2BattlePrep.ts`
- Modify: `src/lib/server/guildDining.ts`

- [ ] Add failing hunt tests for one remaining-save lock preload, one read-only preload, one save flush, and persisted low-HP potion recovery.
- [ ] Run the focused tests and confirm the expected query-boundary failures.
- [ ] Preload request-scoped mutable/read-only save values after the character lock.
- [ ] Use the preloaded actor and dining values without additional save queries.
- [ ] Flush dirty values once for both single and multi-hunt paths, including the recovery error branch.
- [ ] Run hunt, battle-prep, dining, and save-helper tests plus TypeScript.
- [ ] Commit the task.

### Task 3: Shared read batching

**Files:**
- Modify: `src/lib/server/codexSpBonus.ts`
- Modify: `src/lib/server/codexSpBonus.test.ts`
- Modify: `src/lib/server/jobUnlockContext.ts`
- Modify: corresponding job-unlock tests if current catalog conditions exercise multiple save keys

- [ ] Add a failing test that proves codex inputs are fetched through one multi-key read.
- [ ] Change codex bonus loading to `readSaves` while preserving pure parsing.
- [ ] Batch conditional job-unlock save inputs when at least one condition is active; keep the ops setting read separate.
- [ ] Run focused tests and TypeScript.
- [ ] Commit the task.

### Task 4: Save/life endpoint attribution and operations guidance

**Files:**
- Modify: `src/lib/server/runtimeProfiler/routeClassifier.ts`
- Modify: `src/lib/server/runtimeProfiler/routeClassifier.test.ts`
- Modify: `docs/ops-runbook.md`

- [ ] Add failing classifier tests for normalized static save/life endpoints and privacy fallbacks.
- [ ] Add static endpoint labels without retaining query strings or dynamic identifiers.
- [ ] Document the query-amplification triage order and the approval boundary for database extensions/managed insights.
- [ ] Run profiler tests and TypeScript.
- [ ] Commit the task.

### Task 5: Full verification

- [ ] Run all focused suites touched above.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and review the complete diff against the design.
- [ ] Commit any verification-only fixes. Do not push, open a PR, deploy, or change maintenance mode.
