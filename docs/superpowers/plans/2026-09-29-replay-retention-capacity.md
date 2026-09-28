# Replay retention capacity implementation plan

> Execute inline using the executing-plans workflow. User instructions prohibit subagents and require leaving completed work on the current branch.

**Goal:** Let the existing minute cron drain expired replays faster than the observed 1,691 rows/minute inflow.

**Architecture:** Keep the existing 1,000-row SQL transaction. Add a sequential coordinator with a six-batch cap and a five-second budget checked between batches, then connect the authenticated POST route.

**Tech Stack:** Next.js 16.2.11 route handlers, TypeScript, Drizzle, Vitest.

## Constraints

- Preserve replay expiry periods, SQL predicates, advisory lock and per-transaction size.
- Do not deploy, manually delete production DB rows, resize RDS or change alert logic.
- Keep changes on the current feature branch; do not create subagents.
- The time budget prevents starting another batch; it does not cancel an in-flight query.

## Task 1: Coordinator and route

Files: `src/lib/server/battleReplayRetention.ts`, its existing test, and
`src/app/api/v2/cron/battle-replay-retention/route.ts` plus `route.test.ts`.

- [x] Add coordinator regression tests. An executor returning 1,000, 1,000, then 317 deleted rows must yield 2,317 deleted and `more: false`. A perpetually full executor must stop at 6,000. A clock advanced to 5,000 after one full batch must stop at 1,000 with `more: true`. Lock failure must stop without claiming the backlog is empty. Propagate a subsequent batch error.
- [x] Run `npx vitest run src/lib/server/battleReplayRetention.test.ts` and confirm failure before implementation.
- [x] Add `deleteExpiredBattleReplays(executor = defaultExecutor, now = new Date(), clock = () => performance.now())`. Accumulate `deleted`, preserve `batchSize`, stop on partial/locked results or either budget, and return `{ deleted, more, batchSize, skipped }`.
- [x] Add authenticated route tests proving multi-batch aggregate output and no cleanup on unauthorized requests; confirm the aggregate regression fails with the old single-batch route.
- [x] Switch the POST route to `deleteExpiredBattleReplays()`.
- [x] Run replay retention/store and adjacent retention tests, targeted ESLint, `npx tsc --noEmit --incremental false`, and `git diff --check`.
- [x] Review the diff against the spec and commit the completed local change. Report that production still needs a separately authorized deployment.

## Validation result

- Baseline: 4 existing retention tests passed.
- Red: 7 new coordinator cases failed before implementation; route aggregate failed with 1,000 instead of 2,317.
- Green: 24 tests across retention coordinator, authenticated route, replay storage and adjacent retention policy passed.
- TypeScript: the initial check exhausted the default 2GiB Node heap; `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --incremental false` passed on retry. No server memory settings were changed.
- Targeted ESLint and `git diff --check` passed.
- Inline review confirmed expiry, auth, SQL lock and transaction size are preserved; no production deployment.
