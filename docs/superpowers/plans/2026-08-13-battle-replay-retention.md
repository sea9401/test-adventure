# Battle Replay Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep expired battle replays near zero and prevent verified offsite database backups from filling the EC2 root disk.

**Architecture:** A dedicated authenticated cron endpoint deletes one indexed 5,000-row batch per minute. A standalone backup helper removes only automatic local dumps whose matching S3 objects can be verified before the next dump begins.

**Tech Stack:** Next.js route handlers, Drizzle SQL, PostgreSQL, Bash, AWS CLI, Vitest.

## Global Constraints

- Preserve one day of batch-hunt replays and fourteen days of arena replays.
- Keep each database cleanup transaction at or below 5,000 rows.
- Keep `run-cron.sh`'s 45-second HTTP timeout unchanged.
- Never delete a local backup unless the matching configured S3 object is verified.
- Never select manual backups such as `prebeta_*` or staging backups for automatic pruning.

---

### Task 1: Dedicated battle replay cleanup

**Files:**
- Create: `src/lib/server/battleReplayRetention.ts`
- Create: `src/lib/server/battleReplayRetention.test.ts`
- Create: `src/app/api/v2/cron/battle-replay-retention/route.ts`
- Create: `src/app/api/v2/cron/battle-replay-retention/route.test.ts`
- Modify: `deploy/crontab.txt`
- Modify: `deploy/release-production.sh`
- Modify: `src/productionSecuritySurface.test.ts`

**Interfaces:**
- Produces: `deleteExpiredBattleReplayBatch(executor?, now?) => Promise<{deleted: number; more: boolean; batchSize: number}>`.
- Consumes: `db.execute`, `requireCronAuth`, and the existing `battle_replays_expires_idx`.

- [ ] Write failing tests for zero, partial, and full 5,000-row cleanup results.
- [ ] Run `npm test -- src/lib/server/battleReplayRetention.test.ts` and verify failure because the module does not exist.
- [ ] Implement the bounded indexed `ctid` deletion and result parsing.
- [ ] Run the focused library test and verify it passes.
- [ ] Write failing route tests for missing cron authorization and a successful JSON response.
- [ ] Implement the authenticated route and run its focused test.
- [ ] Add the per-minute crontab entry and deployment sync marker, then extend the production surface assertion.
- [ ] Run `npm test -- src/lib/server/battleReplayRetention.test.ts src/app/api/v2/cron/battle-replay-retention/route.test.ts src/productionSecuritySurface.test.ts`.

### Task 2: Offsite-verified local backup pruning

**Files:**
- Create: `deploy/prune-offsite-backups.sh`
- Create: `deploy/prune-offsite-backups.test.ts`
- Modify: `deploy/backup-db.sh`

**Interfaces:**
- Produces: `bash deploy/prune-offsite-backups.sh`, consuming `BACKUP_DIR` and `BACKUP_S3_URI`.
- Consumes: AWS CLI `s3api head-object`; selects only `$BACKUP_DIR/auto_*.sql.gz`.

- [ ] Write a failing temporary-directory test with a fake AWS CLI that confirms only S3-backed automatic dumps are removed.
- [ ] Run `npm test -- deploy/prune-offsite-backups.test.ts` and verify failure because the helper does not exist.
- [ ] Implement strict S3 URI parsing, per-object verification, and exact-file deletion.
- [ ] Run the focused helper test and verify it passes.
- [ ] Call the helper before `pg_dump` when S3 is configured and validate AWS CLI before consuming disk.
- [ ] Extend the test to assert `backup-db.sh` invokes pre-pruning before `pg_dump`, then rerun it.

### Task 3: Verification and commit

**Files:**
- Verify all files listed above.

- [ ] Run all focused tests for retention, backup pruning, and production security.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npx eslint` on every changed TypeScript file.
- [ ] Run `npm run build` to exercise the project-specific Next.js production build.
- [ ] Inspect `git diff --check` and `git status --short`.
- [ ] Commit the design, tests, implementation, and deployment configuration with a focused message.

