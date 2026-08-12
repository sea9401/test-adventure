# Operations Storage Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore RDS memory visibility, alert immediately on daily backup failures, and cap persistent journal disk use.

**Architecture:** Apply the repository's least-privilege CloudWatch policy directly to the production EC2 role. Add a cron-facing backup wrapper that owns logging and failure notification, plus a deployment helper that installs and enforces a bounded journald drop-in.

**Tech Stack:** Bash, AWS CLI/IAM, systemd-journald, Vitest, TypeScript test harnesses.

## Global Constraints

- Grant only `cloudwatch:GetMetricStatistics` to the production EC2 role.
- Preserve the underlying backup command's non-zero exit status.
- Never send a failure webhook for a successful backup.
- Keep journals at or below 512 MB, keep at least 3 GB free, and retain at most 14 days.
- Do not change nginx rotation; its existing daily compressed rotation is healthy.
- Do not deploy or change maintenance mode without a separate explicit deployment request.

---

### Task 1: Restore production RDS metric access

**Files:**
- Verify: `infra/iam/adventure-rds-metrics-policy.json`

**Interfaces:**
- Consumes: AWS account `983903215138`, role `MsmsgeProdDbBackupEc2Role`.
- Produces: inline policy `AdventureRdsMetricsRead` and working `FreeableMemory` monitor reads.

- [ ] **Step 1: Confirm the active AWS account and role exist**

Run `aws sts get-caller-identity` and `aws iam get-role --role-name MsmsgeProdDbBackupEc2Role`. Require account `983903215138` and the exact role name.

- [ ] **Step 2: Validate and apply the checked-in policy**

Run `node -e 'JSON.parse(require("node:fs").readFileSync("infra/iam/adventure-rds-metrics-policy.json", "utf8"))'`, then:

```bash
aws iam put-role-policy \
  --role-name MsmsgeProdDbBackupEc2Role \
  --policy-name AdventureRdsMetricsRead \
  --policy-document file://infra/iam/adventure-rds-metrics-policy.json
```

- [ ] **Step 3: Verify policy and live monitor behavior**

Run `aws iam get-role-policy` for the exact role/policy, start
`adventure-resource-monitor.service`, and require its journal to contain
`RDS MEMORY OK` or `RDS MEMORY WARN` with a MiB value and no `AccessDenied`.

### Task 2: Notify operators when a backup fails

**Files:**
- Create: `deploy/run-backup.sh`
- Create: `src/lib/server/backupRunner.test.ts`
- Modify: `deploy/crontab.txt`
- Modify: `docs/ops-runbook.md`

**Interfaces:**
- Consumes: `BACKUP_SCRIPT_PATH`, `BACKUP_LOG_PATH`,
  `PRODUCTION_ENV_PATH`, and `OPS_ALERT_WEBHOOK_URL`.
- Produces: `bash deploy/run-backup.sh`, returning the underlying backup exit
  status and posting a JSON payload with `detail.source = "db-backup"` on
  failure.

- [ ] **Step 1: Write failing behavior tests**

Create tests that run the real wrapper with temporary success/failure backup
scripts and a fake `curl`. Assert that success appends output and never calls
the webhook; failure appends output, posts one `db-backup` payload, and returns
the original status; missing webhook still returns the original status and
records a warning.

- [ ] **Step 2: Verify the tests fail because the wrapper is missing**

Run `npm test -- src/lib/server/backupRunner.test.ts`. Require failures caused
by `deploy/run-backup.sh` not existing.

- [ ] **Step 3: Implement the minimal wrapper**

Implement strict argument/environment handling, internal log redirection,
structured JSON payload creation, a ten-second webhook timeout, and original
status preservation.

- [ ] **Step 4: Route cron through the wrapper and document alerts**

Replace the daily crontab command with `bash deploy/run-backup.sh` and update
the operations runbook to identify the wrapper, log, and failure alert.

- [ ] **Step 5: Verify the focused tests pass**

Run `npm test -- src/lib/server/backupRunner.test.ts` and `bash -n` on both
backup scripts.

### Task 3: Enforce journal retention during release

**Files:**
- Create: `deploy/adventure-journald.conf`
- Create: `deploy/configure-log-retention.sh`
- Create: `src/lib/server/journalRetention.test.ts`
- Modify: `deploy/release-production.sh`
- Modify: `docs/ops-runbook.md`

**Interfaces:**
- Consumes: `JOURNALD_CONFIG_DIR` and `PRIVILEGED_COMMAND` as test seams;
  defaults to `/etc/systemd/journald.conf.d` and `sudo` in production.
- Produces: installed `adventure-rpg.conf`, restarted journald, rotated active
  journals, and archived journal vacuuming to 512 MB.

- [ ] **Step 1: Write the failing journal enforcement test**

Run the real helper through a fake privileged-command executable. Require the
temporary destination to contain all three limits and the command log to show
restart, rotate, and `--vacuum-size=512M` requests.

- [ ] **Step 2: Verify the test fails because the helper is missing**

Run `npm test -- src/lib/server/journalRetention.test.ts`. Require a missing
`deploy/configure-log-retention.sh` failure.

- [ ] **Step 3: Add the drop-in and minimal deployment helper**

Install the drop-in with mode `0644`, restart `systemd-journald`, rotate active
journals, and vacuum archived journals. Keep every privileged operation behind
the one command boundary.

- [ ] **Step 4: Wire the helper into production release**

Call `bash deploy/configure-log-retention.sh` after systemd units are synced
and before the resource monitor is started.

- [ ] **Step 5: Verify the focused test and shell syntax**

Run `npm test -- src/lib/server/journalRetention.test.ts` and `bash -n
deploy/configure-log-retention.sh deploy/release-production.sh`.

### Task 4: Full verification and commit

**Files:**
- Verify all files above.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: a committed, deploy-ready branch without changing production
  application code or maintenance state.

- [ ] **Step 1: Run focused and full tests**

Run both new focused test files, then `npm test`.

- [ ] **Step 2: Run static verification**

Run `npx tsc --noEmit`, ESLint on changed TypeScript files, `bash -n` on changed
shell files, JSON parsing on the IAM policy, and `git diff --check`.

- [ ] **Step 3: Review operational safety**

Confirm the IAM policy is least privilege, backup failure preserves its status,
journal operations fail closed during release, crontab has one backup entry,
and no command disables maintenance mode.

- [ ] **Step 4: Commit the implementation**

Stage only the scoped files and commit with `fix: harden storage operations`.
