# Codex Mastery Batch Write Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-entry codex-mastery database round trips in one gameplay action with one deterministic batch lock and batch save.

**Architecture:** A batch service validates and applies multiple mastery mutations against one locked summary and a keyed set of locked progress rows. A Drizzle batch store performs multi-row ensure, deterministic lock, one summary update, and one progress upsert; gameplay aggregation calls that service once.

**Tech Stack:** TypeScript, Drizzle ORM 0.45, PostgreSQL, Vitest

## Global Constraints

- Preserve mastery thresholds, scores, seals, trophies, ranking order, monthly research behavior, and transaction boundaries.
- Validate every event before creating or locking database rows.
- Lock summary first and progress identities in category/entry order.
- Do not deploy or mutate production data.
- Follow test-first red-green-refactor for every behavior change.

---

### Task 1: In-memory batch mastery transitions

**Files:**
- Modify: `src/lib/server/codexMasteryRepository.ts`
- Modify: `src/lib/server/codexMasteryService.ts`
- Modify: `src/lib/server/codexMasteryService.test.ts`

**Interfaces:**
- Produces: `CodexMasteryBatchStore`, `createCodexMasteryBatchRecorder`, and `recordCodexMasteryBatch`.
- `recordBatch(inputs, settings, now)` returns one `CodexMasteryRecordResult` per input.

- [ ] **Step 1: Add a failing multi-entry service test**

Add a memory batch store with `lockBatchCalls`, `saveBatchCalls`, keyed progress,
and `reconcileCalls`. Record fish and monster inputs and assert:

```ts
expect(store.lockBatchCalls).toBe(1);
expect(store.saveBatchCalls).toBe(1);
expect(store.savedProgress.map((row) => `${row.category}:${row.entryId}`))
  .toEqual(["fish:fish:test-carp", "monster:monster:test-entry"]);
expect(store.summary.totalScoreMilli).toBe(2_000);
```

The expected values are literal catalog results, not computed with production
helpers.

- [ ] **Step 2: Run the service test and verify RED**

Run: `npx vitest run src/lib/server/codexMasteryService.test.ts`

Expected: FAIL because the batch store and recorder exports do not exist.

- [ ] **Step 3: Implement the minimal batch store contract and recorder**

Add `CodexMasteryBatchStore` beside the existing single-entry store. In the
service, validate the entire input list, lock unique identities once, apply each
mutation to its current keyed progress and the evolving summary, collect dirty
progress identities, save once, and reconcile trophies once when required.

- [ ] **Step 4: Add failing edge-case tests**

Cover repeated identity with two valid sources, an all-unchanged batch with no
save, wrong user or invalid source before lock, corrupt locked progress before
save, and two tier crossings with one trophy reconciliation.

- [ ] **Step 5: Run the service test and verify the new tests fail for their intended missing branches**

Run: `npx vitest run src/lib/server/codexMasteryService.test.ts`

Expected: the new edge tests fail with incorrect call counts or missing errors.

- [ ] **Step 6: Complete the batch behavior and verify GREEN**

Run: `npx vitest run src/lib/server/codexMasteryService.test.ts`

Expected: all service tests PASS.

- [ ] **Step 7: Commit the batch service**

```bash
git add src/lib/server/codexMasteryRepository.ts \
  src/lib/server/codexMasteryService.ts \
  src/lib/server/codexMasteryService.test.ts
git commit -m "perf: batch codex mastery transitions"
```

### Task 2: Deterministic Drizzle batch persistence

**Files:**
- Modify: `src/lib/server/codexMasteryRepository.ts`
- Modify: `src/lib/server/codexMasteryRepository.test.ts`
- Modify: `src/lib/server/codexMasteryPostgres.test.ts`

**Interfaces:**
- Produces: `lockCodexMasteryBatchState`, `saveCodexMasteryBatchState`, and `createDrizzleCodexMasteryBatchStore`.
- Consumes: the batch-store contract introduced in Task 1.

- [ ] **Step 1: Add a failing repository lock-boundary test**

Use a recording executor with unsorted and duplicate identities. Assert one
summary ensure, one multi-row progress ensure containing unique sorted entries,
one summary lock, and one progress lock. Assert returned progress is keyed to all
requested identities.

- [ ] **Step 2: Run the repository test and verify RED**

Run: `npx vitest run src/lib/server/codexMasteryRepository.test.ts`

Expected: FAIL because batch repository exports do not exist.

- [ ] **Step 3: Implement batch ensure and deterministic locking**

Use one summary `onConflictDoNothing`, one multi-value progress
`onConflictDoNothing`, and an `OR` of exact category/entry predicates under the
same user. Apply `FOR UPDATE` and `ORDER BY category, entry_id`. Reject missing or
duplicate returned identities.

- [ ] **Step 4: Add a failing batch-save test**

Assert the executor records one summary update and one multi-row progress
`onConflictDoUpdate`, with mutable values from two literal progress fixtures and
no replacement of `firstRecordedAt`.

- [ ] **Step 5: Implement the one-summary/one-progress save**

Bulk insert final progress rows and update conflict columns from `excluded` for
`count`, `best_value`, `current_tier`, `seal_ids`, `tier_achieved_at`,
`score_milli`, and `updated_at`. Check the returned identity count.

- [ ] **Step 6: Verify repository tests GREEN**

Run: `npx vitest run src/lib/server/codexMasteryRepository.test.ts`

Expected: all repository tests PASS.

- [ ] **Step 7: Add and run the optional PostgreSQL batch integration case**

Extend the existing gated suite to record two entries in one transaction and
assert two progress rows plus one exact summary. Run:

`npx vitest run src/lib/server/codexMasteryPostgres.test.ts`

Expected locally without `CODEX_MASTERY_POSTGRES_TEST_DATABASE_URL`: suite SKIP,
with no failures. The full repository contract remains covered by unit tests.

- [ ] **Step 8: Commit the repository implementation**

```bash
git add src/lib/server/codexMasteryRepository.ts \
  src/lib/server/codexMasteryRepository.test.ts \
  src/lib/server/codexMasteryPostgres.test.ts
git commit -m "perf: persist codex mastery rows in one batch"
```

### Task 3: One permanent mastery call per gameplay action

**Files:**
- Modify: `src/lib/server/codexMasteryGameplay.ts`
- Modify: `src/lib/server/codexMasteryGameplay.test.ts`

**Interfaces:**
- Changes `CodexMasteryGameplayRecorderRuntime.record` to
  `recordBatch(executor, inputs, settings, now)`.
- Keeps `recordCodexMasteryGameplayBatch(executor, userId, events, now)` public
  signature unchanged.

- [ ] **Step 1: Change the gameplay test fake to expect one batch and verify RED**

For the existing mixed fish/job/monster fixture, assert one batch whose inputs
equal the current sorted aggregate. The old sequential runtime must fail this
test because it has no `recordBatch` method.

- [ ] **Step 2: Run the gameplay tests and verify RED**

Run: `npx vitest run src/lib/server/codexMasteryGameplay.test.ts`

Expected: FAIL on the one-batch runtime contract.

- [ ] **Step 3: Route the sorted permanent aggregate through one batch call**

Build all `CodexMasteryRecordInput` values first. If permanent recording is
enabled and the list is non-empty, call `runtime.recordBatch` exactly once.
Monthly recording continues to receive the existing sorted gameplay events once.

- [ ] **Step 4: Verify focused codex tests GREEN**

Run: `npx vitest run src/lib/server/codexMasteryGameplay.test.ts src/lib/server/codexMasteryService.test.ts src/lib/server/codexMasteryRepository.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 5: Run phase verification**

Run: `npx tsc --noEmit`

Run: `npx eslint src/lib/server/codexMasteryGameplay.ts src/lib/server/codexMasteryService.ts src/lib/server/codexMasteryRepository.ts`

Run: `git diff --check`

Expected: every command exits 0.

- [ ] **Step 6: Commit gameplay integration**

```bash
git add src/lib/server/codexMasteryGameplay.ts src/lib/server/codexMasteryGameplay.test.ts
git commit -m "perf: record gameplay mastery in one batch"
```
