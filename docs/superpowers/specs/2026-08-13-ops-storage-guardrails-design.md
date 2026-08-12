# Operations Storage Guardrails Design

## Context

The 2026-08-13 disk incident exposed three remaining operational gaps after
battle replay retention and offsite-verified backup pruning were deployed:

- the EC2 resource monitor cannot read RDS `FreeableMemory` because the
  instance role lacks `cloudwatch:GetMetricStatistics`;
- the daily database backup writes failures only to `backup.log`, so an S3 or
  dump failure can remain unnoticed;
- persistent systemd journals occupy about 2 GB of a 20 GB root volume and
  have no explicit size or retention limit.

Nginx already rotates logs daily, compresses old logs, and retains ten
rotations, so its configuration is outside this change.

## Selected Design

### 1. Restore RDS metric access

Apply the existing `infra/iam/adventure-rds-metrics-policy.json` as the inline
policy `AdventureRdsMetricsRead` on `MsmsgeProdDbBackupEc2Role`. The policy
grants only `cloudwatch:GetMetricStatistics`. Verify the live resource monitor
after application and require an `RDS MEMORY OK` or threshold warning that
contains a real MiB value, rather than an IAM error.

### 2. Alert on backup failure

Add `deploy/run-backup.sh` as the cron-facing wrapper around
`deploy/backup-db.sh`. The wrapper owns log redirection, preserves the backup
script's exit status, and posts one structured message to
`OPS_ALERT_WEBHOOK_URL` only when the backup fails. It reads the webhook from
the process environment first and then from the production environment file.
Webhook delivery failure is recorded in the backup log but never hides the
original backup exit code.

The crontab invokes the wrapper without a second redirection layer. The
underlying backup script remains directly runnable for operator-driven backup
and recovery work.

### 3. Bound persistent journal storage

Ship a journald drop-in with these explicit limits:

- `SystemMaxUse=512M`
- `SystemKeepFree=3G`
- `MaxRetentionSec=14day`

Add a focused deployment helper that installs the drop-in, restarts journald,
rotates the active journal, and vacuums archived journals to 512 MB. The normal
production release calls this helper while maintenance mode is already on.
Tests execute the helper through a fake privileged-command boundary and verify
the installed file plus restart/rotation/vacuum requests.

## Alternatives Considered

1. Put an `EXIT` trap directly in `backup-db.sh`. This couples backup creation
   to notification transport and makes operator-run backups unexpectedly send
   alerts, so the cron wrapper is clearer.
2. Convert backup and journal management to new systemd timers. This offers
   richer failure hooks but replaces a working cron setup and is unnecessary
   for these three bounded gaps.
3. Increase the root EBS volume. Extra capacity adds headroom but does not fix
   missing alerts or unbounded logs, so it is not required for this change.

## Failure Handling

- IAM application is verified against the exact role and policy document.
- Backup success never calls the webhook. Backup failure returns the original
  non-zero status even if the webhook is missing or unreachable.
- The journal helper uses `set -euo pipefail`; a failed install, restart,
  rotate, or vacuum fails the release and leaves maintenance mode enabled.
- No production deployment or maintenance-mode transition occurs without a
  separate explicit deployment request.

## Verification

- Run the live RDS monitor after applying IAM and inspect its journal output.
- Red-green tests cover backup success, backup failure notification, missing
  webhook handling, log preservation, and exit-status preservation.
- Red-green tests cover journal drop-in installation and the required service
  operations.
- Run focused tests, all unit tests, typecheck, ESLint, `bash -n`, JSON
  validation, and `git diff --check` before committing.
