# Economy Log Write Batching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every high-frequency economy event while reducing PostgreSQL write round trips and raising daily expired-event cleanup above current production inflow.

**Architecture:** Add a small reusable best-effort async batcher, use it only for `life.*` and `currency.fishing.catch`, and execute its database write outside request attribution. Keep critical event writes and marketplace follow-up checks on the existing immediate path. Give economy retention a dedicated 120,000-row daily ceiling while leaving every other retention loop unchanged.

**Tech Stack:** TypeScript, Node.js `AsyncLocalStorage`, Drizzle ORM, PostgreSQL, Vitest.

## Global Constraints

- Preserve every economy event row and the 30-day economy retention period.
- Batch only `life.*` and `currency.fishing.catch`; do not delay marketplace, reward-failure, admin, or other audit events.
- Flush after 25ms or at 100 queued entries, whichever comes first.
- Drop and report a failed best-effort batch without retrying or blocking gameplay.
- Do not modify RDS, Multi-AZ, Database Insights, deployment, or maintenance mode.
- Follow test-driven development: observe each regression test fail before production changes.

---

### Task 1: Serialized best-effort batch queue

**Files:**
- Create: `src/lib/server/bestEffortBatcher.ts`
- Create: `src/lib/server/bestEffortBatcher.test.ts`

**Interfaces:**
- Consumes: an async `writeBatch(entries)` callback and optional timing/size/error settings.
- Produces: `createBestEffortBatcher<T>(options)` returning `enqueue(entry)` and `flush()`.

- [ ] **Step 1: Write failing queue tests**

Add tests using fake timers that enqueue two values, advance 25ms, and require one ordered write; enqueue up to a size of two and require an immediate write; hold the first write promise while enqueueing another value and require a second serialized write; reject one write and require `onError` plus successful later use.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `npm test -- src/lib/server/bestEffortBatcher.test.ts`

Expected: FAIL because `./bestEffortBatcher` does not exist.

- [ ] **Step 3: Implement the minimal queue**

Implement this public contract:

```ts
type BestEffortBatcherOptions<T> = {
  writeBatch(entries: readonly T[]): Promise<void>;
  maxBatchSize: number;
  flushDelayMs: number;
  onError(error: unknown, entries: readonly T[]): void;
};

export function createBestEffortBatcher<T>(
  options: BestEffortBatcherOptions<T>,
): {
  enqueue(entry: T): void;
  flush(): Promise<void>;
};
```

Keep one pending array, one optional timeout, and one in-flight promise. `flush()` must drain at most `maxBatchSize` per write, continue until pending is empty, catch each failed batch through `onError`, and never run two writers concurrently. Call `unref()` on the timeout when Node exposes it.

- [ ] **Step 4: Run the focused test and observe GREEN**

Run: `npm test -- src/lib/server/bestEffortBatcher.test.ts`

Expected: all queue tests pass.

### Task 2: Detached background DB attribution

**Files:**
- Create: `src/lib/server/runtimeProfiler/requestContext.test.ts`
- Modify: `src/lib/server/runtimeProfiler/requestContext.ts`

**Interfaces:**
- Consumes: the existing process-global `AsyncLocalStorage<RequestProfileContext>`.
- Produces: `runOutsideRequestProfile<T>(callback: () => T): T`.

- [ ] **Step 1: Write the failing context test**

Inside `runWithRequestProfile(profile, ...)`, assert that the current profile is present, absent inside `runOutsideRequestProfile`, and restored after that callback returns.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `npm test -- src/lib/server/runtimeProfiler/requestContext.test.ts`

Expected: FAIL because `runOutsideRequestProfile` is not exported.

- [ ] **Step 3: Implement context exit**

Add:

```ts
export function runOutsideRequestProfile<T>(callback: () => T): T {
  return requestStorage().exit(callback);
}
```

- [ ] **Step 4: Run the focused test and observe GREEN**

Run: `npm test -- src/lib/server/runtimeProfiler/requestContext.test.ts`

Expected: the context test passes.

### Task 3: Batch high-frequency economy writes

**Files:**
- Modify: `src/lib/server/economyLog.ts`
- Modify: `src/lib/server/economyLog.test.ts`
- Create: `src/lib/server/economyLogBatching.test.ts`

**Interfaces:**
- Consumes: `createBestEffortBatcher`, `runOutsideRequestProfile`, `db.insert(economyEvents).values(rows)`.
- Produces: unchanged `recordEconomyEvent` and `recordEconomyEventSoon` call contracts; exports `isBatchedEconomyEvent(entry)` for the policy boundary.

- [ ] **Step 1: Write failing batching-policy tests**

Assert that `life.fishing.attempt`, `life.mining.gather`, and `currency.fishing.catch` are batchable while `marketplace.buy`, `reward.failure.quest`, and `admin.reward.grant` are not.

- [ ] **Step 2: Write the failing integration test**

Mock only the Drizzle database boundary, enable fake timers and `DATABASE_URL`, enqueue two high-frequency events through the real `recordEconomyEventSoon`, advance 25ms, and assert one `.values([...])` call containing both normalized rows. Then send a critical event and assert that its single-row `.values({...}).returning(...)` path runs without waiting for the timer.

- [ ] **Step 3: Run the economy tests and observe RED**

Run: `npm test -- src/lib/server/economyLog.test.ts src/lib/server/economyLogBatching.test.ts`

Expected: FAIL because the classifier and batching behavior are absent.

- [ ] **Step 4: Implement the batching boundary**

Extract the existing value normalization to one function used by both single and batch writes. Add:

```ts
const ECONOMY_EVENT_BATCH_SIZE = 100;
const ECONOMY_EVENT_BATCH_DELAY_MS = 25;

export function isBatchedEconomyEvent(entry: EconomyEventInput): boolean {
  return entry.eventType.startsWith("life.") ||
    entry.eventType === "currency.fishing.catch";
}
```

Create a module-level batcher whose writer calls `runOutsideRequestProfile(() => db.insert(economyEvents).values(...))`, then emits the existing economy ops signal only after a successful insert. Log only the batch size and bounded distinct event types on failure. In `recordEconomyEventSoon`, return early without `DATABASE_URL`, enqueue batchable events, and keep `void recordEconomyEvent(entry)` for every other type.

- [ ] **Step 5: Run economy and life telemetry tests and observe GREEN**

Run: `npm test -- src/lib/server/bestEffortBatcher.test.ts src/lib/server/economyLog.test.ts src/lib/server/economyLogBatching.test.ts src/lib/server/lifeGatheringTelemetry.test.ts src/app/api/admin/life-gathering-telemetry/aggregate.test.ts`

Expected: all tests pass and per-event telemetry expectations remain unchanged.

### Task 4: Economy-specific retention headroom and operations guidance

**Files:**
- Modify: `src/lib/server/retentionPolicy.ts`
- Modify: `src/lib/server/retentionPolicy.test.ts`
- Modify: `src/app/api/v2/cron/ops-retention/route.ts`
- Modify: `docs/ops-runbook.md`

**Interfaces:**
- Consumes: `deleteBatchSize = 5_000` and `drainRetentionBatches`.
- Produces: `RETENTION_POLICY.economyDeleteMaxBatches = 24`, providing 120,000 deletions per daily economy cleanup.

- [ ] **Step 1: Write the failing retention-capacity test**

Use the real policy values and a full-batch callback to assert that an economy cleanup can drain at least 100,000 rows in one run and stops exactly at its configured limit.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `npm test -- src/lib/server/retentionPolicy.test.ts`

Expected: FAIL because `economyDeleteMaxBatches` is absent or current capacity is only 30,000.

- [ ] **Step 3: Implement the dedicated economy ceiling**

Add `economyDeleteMaxBatches: 24` without changing `backlogDeleteMaxBatches: 6`. Change only the economy branch of `ops-retention` to use the new setting.

- [ ] **Step 4: Document runtime checks**

Document that high-frequency events are batched at 25ms/100 rows, critical audit events remain immediate, economy retention can delete 120,000 rows per day, and operators should compare daily inflow against that ceiling before scaling the DB.

- [ ] **Step 5: Run focused tests and TypeScript**

Run: `npm test -- src/lib/server/retentionPolicy.test.ts src/lib/server/bestEffortBatcher.test.ts src/lib/server/economyLog.test.ts src/lib/server/economyLogBatching.test.ts src/lib/server/runtimeProfiler/requestContext.test.ts`

Run: `npx tsc --noEmit`

Expected: both commands exit 0.

### Task 5: Full verification and commit

**Files:**
- Review all files changed by Tasks 1-4.

**Interfaces:**
- Consumes: the complete implementation and design constraints.
- Produces: a verified local commit; no push or deployment.

- [ ] **Step 1: Run lint**

Run: `npm run lint`

Expected: exit 0.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: exit 0 with no failed tests.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit 0. Image optimization and image-reference checks also pass through the prebuild hook.

- [ ] **Step 4: Review the diff and whitespace**

Run: `git diff --check`

Run: `git diff --stat && git diff`

Expected: no whitespace errors and no changes outside the documented scope.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/lib/server/bestEffortBatcher.ts \
  src/lib/server/bestEffortBatcher.test.ts \
  src/lib/server/economyLog.ts \
  src/lib/server/economyLog.test.ts \
  src/lib/server/economyLogBatching.test.ts \
  src/lib/server/runtimeProfiler/requestContext.ts \
  src/lib/server/runtimeProfiler/requestContext.test.ts \
  src/lib/server/retentionPolicy.ts \
  src/lib/server/retentionPolicy.test.ts \
  src/app/api/v2/cron/ops-retention/route.ts \
  docs/ops-runbook.md \
  docs/superpowers/plans/2026-09-03-economy-log-write-batching.md
git commit -m "perf: batch high-frequency economy logs"
```

- [ ] **Step 6: Confirm the resulting repository state**

Run: `git status --short && git log -3 --oneline`

Expected: clean status with the design and implementation commits at the branch tip.
