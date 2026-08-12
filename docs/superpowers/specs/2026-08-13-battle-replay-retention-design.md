# Battle Replay Retention and Backup Disk Safety Design

## Problem

Production created roughly 850,000–1,020,000 `battle_replays` rows per day,
while the daily shared retention job deleted at most 5,000. On 2026-08-13,
2.94 million of 3.97 million rows were already expired and the table occupied
about 10 GB of an 11 GB database. Logical backups grew from 11 MB to 2.2 GB,
and fourteen days of local backup retention filled 97% of the EC2 root disk.

## Approaches Considered

1. Increase the shared daily deletion batch. This cannot sustainably process
   one million rows within `run-cron.sh`'s 45-second HTTP limit and would also
   enlarge transactions for every other retention table.
2. Run the full operations retention endpoint every minute. This would keep up,
   but would unnecessarily repeat archive, storage-metric, notification, and
   external-storage work unrelated to battle replays.
3. Add a dedicated, small battle-replay cleanup endpoint and run it every
   minute. This isolates load, keeps transactions bounded, and provides enough
   capacity without changing replay availability. This is the selected design.

For backups, merely reducing `BACKUP_KEEP_DAYS` still allows the next multi-GB
dump to cross the EC2 warning threshold before rotation runs. Expanding EBS is
useful headroom but does not correct unbounded local duplication. The selected
design verifies each previous automatic backup exists in the configured S3
location, then removes that local copy before starting the next dump. If S3 is
unconfigured or verification fails, the local file is preserved.

## Runtime Design

`POST /api/v2/cron/battle-replay-retention` requires `CRON_SECRET` and deletes
at most 5,000 expired rows per request. It selects rows through the existing
`expires_at` index and deletes by PostgreSQL `ctid`, avoiding a second random
primary-key lookup. The response reports `deleted`, `more`, and `batchSize`.
The EC2 crontab invokes it once per minute, giving a theoretical capacity of
7.2 million rows per day—more than seven times the measured daily creation
rate. The existing daily retention deletion remains as defense in depth.

Before `pg_dump`, `backup-db.sh` invokes a focused helper only when
`BACKUP_S3_URI` is configured. The helper considers only top-level
`auto_*.sql.gz` files, checks the matching S3 object with `head-object`, and
deletes only confirmed copies. Manual and staging backups are never selected.
The new dump is still written locally, integrity-checked, uploaded, and retained
locally. An upload failure therefore leaves the new verified local dump intact.

## Failure Handling

- Cron authentication failure returns before database access.
- A cleanup failure affects only one bounded transaction; the next minute
  retries from the remaining expired rows.
- Missing AWS CLI with configured offsite storage fails before a new dump uses
  more disk.
- An unavailable or missing S3 object preserves its local copy and aborts the
  backup before a new dump can consume additional disk.
- No `VACUUM FULL` is part of the workflow; normal autovacuum reclaims reusable
  table space without an exclusive table rewrite.

## Verification

- Unit-test cleanup result parsing and the `more` boundary at 5,000 rows.
- Route-test authorization and the successful cleanup response.
- Execute the S3-pruning helper against temporary files and a fake AWS command,
  proving that confirmed automatic backups are deleted while unconfirmed and
  manual files remain.
- Verify crontab and release checks include the new endpoint.
- Run focused tests, typecheck, lint, and the production build before commit.
