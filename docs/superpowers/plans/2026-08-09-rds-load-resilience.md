# RDS Load Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce polling-driven RDS memory pressure, recover automatically from stale PostgreSQL pools, and alert on low RDS free memory.

**Architecture:** Batch the three primary chat channels behind one compatible route contract and lengthen non-critical polling. Put the PostgreSQL pool behind a process-global runtime that can rotate generations after a health timeout. Extend the existing EC2 timer with a CloudWatch-backed RDS memory monitor.

**Tech Stack:** Next.js 16 Route Handlers, React 19 client hooks, Drizzle ORM, node-postgres, Vitest, Bash/systemd, AWS CLI/CloudWatch.

## Global Constraints

- Do not change the RDS instance class.
- Do not deploy or change maintenance mode.
- Preserve unrelated worktree changes and commit only files from this plan.
- Keep existing single-channel and custom-room chat API behavior compatible.

---

### Task 1: Batch and slow polling hot paths

**Files:**
- Create: `src/components/chat/chatPollingPolicy.ts`
- Create: `src/components/chat/chatPollingPolicy.test.ts`
- Modify: `src/components/chat/chatMessagesApi.ts`
- Modify: `src/components/ChatButton.tsx`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/lib/usePresenceHeartbeat.ts`
- Modify: `src/lib/playerSanctions.ts`

**Interfaces:**
- Produces `mainChatMessagesUrl`, `fetchMainChatMessages`, and `{ global, trade, guild }` response data.
- Produces `chatPollDelayMs(open)` returning 3,000 or 30,000 milliseconds.

- [ ] Write failing tests for one batched chat URL, channel result mapping, and visible open/closed delay behavior.
- [ ] Run the focused tests and confirm they fail because the batch API and policy do not exist.
- [ ] Add the batch route branch while preserving existing single-channel behavior.
- [ ] Change `ChatButton` to issue one batch request per tick and update all three message lists.
- [ ] Set presence to 30 seconds and sanction UI refresh to 120 seconds.
- [ ] Run focused tests and commit the polling change.

### Task 2: Rotate an unresponsive database pool

**Files:**
- Create: `src/db/poolRuntime.ts`
- Create: `src/db/poolRuntime.test.ts`
- Modify: `src/db/index.ts`
- Modify: `src/app/api/health/route.ts`
- Modify: `src/app/api/health/route.test.ts`

**Interfaces:**
- `createPoolRuntime({ createPool, createDatabase, closePool, now, recycleCooldownMs })`
- Runtime methods `getDatabase()` and `recycle(reason)`.
- `recycleDatabasePool(reason)` exported by `src/db/index.ts`.

- [ ] Write a failing runtime test proving repeated reads share one pool and a recycle makes the next read use a new pool.
- [ ] Add a failing cooldown test proving consecutive timeouts cannot rotate pools repeatedly within 30 seconds.
- [ ] Implement the generic runtime and process-global production instance.
- [ ] Add `query_timeout`, keepalive, and application name to the production pool.
- [ ] Write a failing health-route test proving a DB ping timeout requests pool recycling.
- [ ] Update the health route and run focused tests.
- [ ] Commit the database recovery change.

### Task 3: Alert on low RDS free memory

**Files:**
- Create: `scripts/check-rds-memory.mjs`
- Create: `src/lib/server/rdsMemoryMonitor.test.ts`
- Create: `infra/iam/adventure-rds-metrics-policy.json`
- Modify: `deploy/check-resources.sh`
- Modify: `deploy/adventure-resource-monitor.service`
- Modify: `docs/ops-runbook.md`

**Interfaces:**
- Reads `RDS_DB_INSTANCE_ID`, `AWS_REGION`, `RDS_FREEABLE_MEMORY_MIN_MIB`, `RDS_MEMORY_MONITOR_STATE_PATH`, and existing webhook configuration.
- Test-only metric injection uses `RDS_MONITOR_FREEABLE_MEMORY_BYTES` and never changes production behavior when unset.

- [ ] Write failing process tests for low-memory warning, cooldown suppression, and recovery output using a temporary state file.
- [ ] Implement CloudWatch metric retrieval, threshold evaluation, state persistence, and webhook messages.
- [ ] Invoke the monitor from the existing two-minute resource check without turning metric-read failures into service failures.
- [ ] Add the least-privilege IAM read policy and runbook setup/verification commands.
- [ ] Run focused tests and commit the monitoring change.

### Task 4: Full verification and review

**Files:**
- Review all files above.

- [ ] Run all focused tests from Tasks 1-3.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run ESLint on changed TypeScript/JavaScript files and `bash -n` on changed shell files.
- [ ] Run `npm test`.
- [ ] Inspect `git diff --check`, status, and the exact staged file list.
- [ ] Commit any verification-only corrections without staging unrelated user changes.

