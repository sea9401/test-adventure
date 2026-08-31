# RDS Outage Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a short RDS disconnect or restart from producing prolonged global loading, overlapping cleanup work, and oversized error logs.

**Architecture:** Keep write operations single-attempt, recycle stale PostgreSQL pools on connection-level idle client errors, and recover the render-blocking sanction gate with bounded client retries. Reduce normal sanction reads, make replay cleanup mutually exclusive inside PostgreSQL, and grant only the monitoring reads required to diagnose the RDS event.

**Tech Stack:** Next.js 16.2.11 App Router, React 19, TypeScript, node-postgres, Drizzle ORM, PostgreSQL advisory locks, Vitest, AWS IAM/CloudWatch/RDS.

## Global Constraints

- Do not deploy the application without a separate explicit user request.
- Do not automatically retry write transactions.
- Do not expose SQL parameters, battle payloads, user IDs, or database credentials in logs.
- Preserve the existing 30-second pool recycle cooldown.
- Preserve the sanction gate's fail-closed security behavior.
- Preserve unrelated working-tree changes, including `src/adventure/data/v2/tier7Advancement.test.ts`.

---

### Task 1: Recycle pools on idle connection errors

**Files:**
- Modify: `src/db/index.ts`
- Modify: `src/db/poolRuntime.ts`
- Test: `src/db/poolRuntime.test.ts`

**Interfaces:**
- Consumes: node-postgres `Pool` error events and the existing `createPoolRuntime` recycle cooldown.
- Produces: `attachPoolErrorHandler(pool, handler)` behavior that reports safe `{ name, code }` metadata and requests one pool recycle.

- [ ] **Step 1: Write the failing tests**

Add tests proving an emitted pool error requests recycle, the safe description excludes the original message, and a second error inside 30 seconds does not close another pool.

- [ ] **Step 2: Run the tests to verify RED**

Run: `npm test -- src/db/poolRuntime.test.ts`

Expected: FAIL because pool errors are not connected to runtime recycling and no safe error description exists.

- [ ] **Step 3: Implement the minimal handler**

Add a small safe error descriptor and register the pool listener during creation. Log only the error name and string code, then call the existing cooldown-protected `recycle("pool-client-error")`.

- [ ] **Step 4: Run the tests to verify GREEN**

Run: `npm test -- src/db/poolRuntime.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/index.ts src/db/poolRuntime.ts src/db/poolRuntime.test.ts
git commit -m "fix: recycle failed database pools"
```

### Task 2: Avoid unnecessary global sanction queries

**Files:**
- Modify: `src/lib/server/playerSanctions.ts`
- Test: `src/lib/server/playerSanctions.test.ts`

**Interfaces:**
- Consumes: the user row's `tradeSuspendedUntil` and existing sanction history query.
- Produces: the unchanged `Promise<PlayerSanctionStatus>` contract with no trade-history query for users without an active trade suspension.

- [ ] **Step 1: Write the failing tests**

Add one test where `tradeSuspendedUntil` is null and assert the status is ready without a third select, plus one active-suspension test that still resolves the matching sanction row.

- [ ] **Step 2: Run the tests to verify RED**

Run: `npm test -- src/lib/server/playerSanctions.test.ts`

Expected: FAIL because the current `Promise.all` always starts all three selects.

- [ ] **Step 3: Implement conditional lookup**

Fetch the user and unacknowledged warning in parallel. Only run the trade sanction history query when the returned user row has a non-null, non-expired `tradeSuspendedUntil`; otherwise use an empty row list.

- [ ] **Step 4: Run the tests to verify GREEN**

Run: `npm test -- src/lib/server/playerSanctions.test.ts src/lib/server/playerSanctionsRoute.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/playerSanctions.ts src/lib/server/playerSanctions.test.ts
git commit -m "perf: skip inactive trade sanction reads"
```

### Task 3: Recover the render-blocking sanction gate automatically

**Files:**
- Modify: `src/adventure/v2/PlayerSanctionGate.tsx`
- Test: `src/adventure/v2/PlayerSanctionGate.test.tsx`

**Interfaces:**
- Consumes: the existing fail-closed `GateState` and `/api/v2/me/sanctions` fetch.
- Produces: automatic retries after 2 seconds, 5 seconds, and then 10-second capped intervals while the initial status remains unavailable.

- [ ] **Step 1: Write the failing fake-timer tests**

Prove a failed initial request shows the error screen, a retry fires after 2 seconds, successful recovery renders children, and unmount cancels the pending timer.

- [ ] **Step 2: Run the tests to verify RED**

Run: `npm test -- src/adventure/v2/PlayerSanctionGate.test.tsx`

Expected: FAIL because the gate currently waits for the 120-second poll or manual input.

- [ ] **Step 3: Implement bounded retry scheduling**

Track consecutive initial failures, schedule one retry timer from the error state, reset the counter after success or authorization response, and clear the timer on unmount. Keep the manual button and last-known-ready behavior.

- [ ] **Step 4: Run the tests to verify GREEN**

Run: `npm test -- src/adventure/v2/PlayerSanctionGate.test.tsx`

Expected: PASS without timer leakage warnings.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/v2/PlayerSanctionGate.tsx src/adventure/v2/PlayerSanctionGate.test.tsx
git commit -m "fix: retry account status after database outages"
```

### Task 4: Prevent replay maintenance and logging from amplifying outages

**Files:**
- Modify: `src/lib/server/battleReplayRetention.ts`
- Test: `src/lib/server/battleReplayRetention.test.ts`
- Modify: `src/lib/server/battleReplayStore.ts`
- Test: `src/lib/server/battleReplayStore.test.ts`

**Interfaces:**
- Consumes: one SQL statement per cleanup invocation and the existing replay persistence fallback.
- Produces: cleanup result `{ deleted, more, batchSize, skipped }` and safe persistence warning metadata without the original error message or object.

- [ ] **Step 1: Write the failing cleanup tests**

Require the compiled SQL to contain `pg_try_advisory_xact_lock`, return `skipped: true` when the row says the lock was not acquired, and preserve batch semantics when acquired.

- [ ] **Step 2: Run the cleanup tests to verify RED**

Run: `npm test -- src/lib/server/battleReplayRetention.test.ts`

Expected: FAIL because cleanup currently has no lock or skipped field.

- [ ] **Step 3: Implement the single-statement lock**

Add a materialized lock CTE, feed `due` only from an acquired lock row, and select both deletion count and acquisition state.

- [ ] **Step 4: Write the failing log sanitization test**

Throw an error whose message contains sentinel SQL, params, and payload text. Assert the warning arguments contain none of those sentinels and include only a safe name/code descriptor.

- [ ] **Step 5: Run the store tests to verify RED**

Run: `npm test -- src/lib/server/battleReplayStore.test.ts`

Expected: FAIL because the current warning receives the original error object.

- [ ] **Step 6: Implement safe replay warnings and verify GREEN**

Run: `npm test -- src/lib/server/battleReplayRetention.test.ts src/lib/server/battleReplayStore.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/battleReplayRetention.ts src/lib/server/battleReplayRetention.test.ts src/lib/server/battleReplayStore.ts src/lib/server/battleReplayStore.test.ts
git commit -m "fix: contain replay maintenance failures"
```

### Task 5: Restore RDS observability and verify the complete change

**Files:**
- Modify: `infra/iam/adventure-rds-metrics-policy.json`
- Modify: `docs/ops-runbook.md`

**Interfaces:**
- Consumes: EC2 role `MsmsgeProdDbBackupEc2Role` and the existing RDS memory monitor.
- Produces: read-only `cloudwatch:GetMetricStatistics`, `rds:DescribeEvents`, and `rds:DescribeDBInstances` access.

- [ ] **Step 1: Update the read-only IAM policy and runbook**

Add the two RDS describe actions without write actions and document the event query for the incident window. Configuration-only policy changes do not receive a synthetic source-text test.

- [ ] **Step 2: Validate policy and focused tests**

Run:

```bash
node -e 'JSON.parse(require("fs").readFileSync("infra/iam/adventure-rds-metrics-policy.json", "utf8")); console.log("policy json ok")'
npm test -- src/db/poolRuntime.test.ts src/lib/server/playerSanctions.test.ts src/lib/server/playerSanctionsRoute.test.ts src/adventure/v2/PlayerSanctionGate.test.tsx src/lib/server/battleReplayRetention.test.ts src/lib/server/battleReplayStore.test.ts
npx tsc --noEmit
npx eslint src/db/index.ts src/db/poolRuntime.ts src/db/poolRuntime.test.ts src/lib/server/playerSanctions.ts src/lib/server/playerSanctions.test.ts src/adventure/v2/PlayerSanctionGate.tsx src/adventure/v2/PlayerSanctionGate.test.tsx src/lib/server/battleReplayRetention.ts src/lib/server/battleReplayRetention.test.ts src/lib/server/battleReplayStore.ts src/lib/server/battleReplayStore.test.ts
npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 3: Commit the policy and runbook**

```bash
git add infra/iam/adventure-rds-metrics-policy.json docs/ops-runbook.md
git commit -m "ops: restore RDS incident visibility"
```

- [ ] **Step 4: Apply the IAM policy if an administrator credential is available**

Use the existing runbook command with `aws iam put-role-policy`; do not change the RDS instance or deploy the application. Then query RDS events and CloudWatch metrics for 2026-08-20 14:40-15:15 UTC. If no administrator credential is available, report that exact external blocker while leaving the validated policy committed.

- [ ] **Step 5: Report evidence**

Report tests, build result, commits, unchanged unrelated files, whether IAM was applied, and whether the RDS event identified memory pressure, maintenance, failover, or another AWS cause.
