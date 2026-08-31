# Runtime Feature Profiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a low-overhead, privacy-safe runtime profiler that attributes HTTP and database load to game features.

**Architecture:** Next.js instrumentation starts one Node-only process singleton. The singleton wraps the HTTP request boundary, propagates request-local state with AsyncLocalStorage, attributes pg query time, aggregates fixed histograms per minute, logs completed windows, and exposes a read-only admin snapshot.

**Tech Stack:** Next.js 16.2.11 instrumentation, Node.js `http`, `async_hooks`, `perf_hooks`, PostgreSQL `pg`, TypeScript, Vitest.

## Global Constraints

- Do not deploy this change.
- Do not write profiler records to PostgreSQL.
- Do not retain URL paths, query strings, request bodies, IPs, user IDs, character names, or room IDs.
- Default interval is 60000ms and history retention is 60 completed windows.
- Profiling failures must never fail a game request.
- Preserve the four pre-existing dirty adventure/loadout files.

---

### Task 1: Feature classification and aggregation core

**Files:**
- Create: `src/lib/server/runtimeProfiler/types.ts`
- Create: `src/lib/server/runtimeProfiler/routeClassifier.ts`
- Create: `src/lib/server/runtimeProfiler/routeClassifier.test.ts`
- Create: `src/lib/server/runtimeProfiler/aggregate.ts`
- Create: `src/lib/server/runtimeProfiler/aggregate.test.ts`

**Interfaces:**
- Produces `classifyRequestPath(pathname: string): RuntimeFeature`.
- Produces `createProfilerAggregator(options)` with `recordRequest`, `rotate`, and `snapshot` methods.

- [ ] Write table tests for representative chat, combat, marketplace, cron, save, life, admin, static, render, and unknown paths.
- [ ] Run the tests and confirm they fail because the modules do not exist.
- [ ] Implement ordered prefix classification without retaining the input path.
- [ ] Write aggregate tests using hand-calculated counts, averages, histogram percentiles, errors, bytes, DB totals, retention, and slow request caps.
- [ ] Run the tests and confirm they fail because aggregation is not implemented.
- [ ] Implement fixed-bucket aggregation and immutable serialized snapshots.
- [ ] Run both test files and confirm they pass.
- [ ] Commit the task as `feat: add runtime profiler aggregation`.

### Task 2: HTTP request context and database attribution

**Files:**
- Create: `src/lib/server/runtimeProfiler/requestContext.ts`
- Create: `src/lib/server/runtimeProfiler/httpInstrumentation.ts`
- Create: `src/lib/server/runtimeProfiler/httpInstrumentation.test.ts`
- Create: `src/lib/server/runtimeProfiler/pgInstrumentation.ts`
- Create: `src/lib/server/runtimeProfiler/pgInstrumentation.test.ts`

**Interfaces:**
- Produces `runWithRequestProfile(context, callback)` and `currentRequestProfile()`.
- Produces `instrumentHttpServer(aggregator)` and `instrumentPgPool(pool)`.

- [ ] Write an HTTP boundary test that sends a fake request through the patched request event and asserts one finish record with a visible request context.
- [ ] Run it and confirm the missing implementation failure.
- [ ] Implement a process-idempotent HTTP request wrapper with finish/close deduplication and socket byte deltas.
- [ ] Write pg tests for promise success, callback failure, event completion, and synchronous throw; each must mutate the real request context exactly once.
- [ ] Run them and confirm the missing implementation failure.
- [ ] Implement per-client query wrapping and pool gauge reading without changing query arguments or return styles.
- [ ] Run all Task 2 tests and confirm they pass.
- [ ] Commit the task as `feat: attribute HTTP and database profiler load`.

### Task 3: Runtime lifecycle and Next.js integration

**Files:**
- Create: `src/lib/server/runtimeProfiler/runtime.ts`
- Create: `src/lib/server/runtimeProfiler/runtime.test.ts`
- Create: `src/instrumentation.ts`
- Modify: `src/db/index.ts`

**Interfaces:**
- Produces `startRuntimeProfiler()`, `getRuntimeProfilerSnapshot()`, and `instrumentRuntimeDatabasePool(pool)`.

- [ ] Write lifecycle tests with injected clocks/runtime samplers for enablement defaults, interval clamping, one-time startup, structured log rotation, and empty disabled snapshots.
- [ ] Run them and confirm the missing implementation failure.
- [ ] Implement the global singleton, unref timer, CPU/memory/event-loop sampler, pool gauges, and structured journal output.
- [ ] Add Node-only dynamic startup in `src/instrumentation.ts` according to the Next.js 16 guide.
- [ ] Call `instrumentRuntimeDatabasePool(pool)` immediately after each application Pool is created.
- [ ] Run the focused profiler and existing pool recovery tests.
- [ ] Commit the task as `feat: start runtime feature profiler`.

### Task 4: Authenticated snapshot endpoint and operations documentation

**Files:**
- Create: `src/app/api/admin/runtime-profiler/route.ts`
- Create: `src/app/api/admin/runtime-profiler/route.test.ts`
- Modify: `docs/ops-runbook.md`

**Interfaces:**
- Consumes `requireAdmin()` and `getRuntimeProfilerSnapshot()`.
- Produces `GET /api/admin/runtime-profiler` JSON.

- [ ] Write route tests proving unauthorized requests never read the profiler and authorized requests return the snapshot unchanged with no DB access.
- [ ] Run them and confirm the missing route failure.
- [ ] Implement the read-only route.
- [ ] Document enable/disable variables, journal query, endpoint, metric interpretation, and response byte approximation.
- [ ] Run the route test and focused profiler suite.
- [ ] Commit the task as `docs: document runtime feature profiling`.

### Task 5: Full verification

**Files:**
- Modify only files required by verification findings within this feature.

- [ ] Run `npm test -- src/lib/server/runtimeProfiler src/app/api/admin/runtime-profiler/route.test.ts src/db/poolRuntime.test.ts`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and confirm the original four dirty files remain untouched.
- [ ] Review the implementation against the design privacy and failure-isolation requirements.
- [ ] Commit any verification-only fixes with a focused message.
