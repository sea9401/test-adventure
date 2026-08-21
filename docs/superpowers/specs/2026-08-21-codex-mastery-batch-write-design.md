# Codex Mastery Batch Write Design

## Context

Gameplay integrations already aggregate duplicate mastery events before recording,
but then call the single-entry recorder sequentially. Each distinct entry ensures
and locks the same summary row, ensures and locks one progress row, updates the
same summary row, and updates one progress row. A hunt or life action that records
several entries therefore performs approximately six statements per entry.

## Goal

Persist all permanent codex-mastery events produced by one gameplay action with
one summary lock, one progress-row lock query, one summary update, and one bulk
progress write while preserving authoritative validation, monotonic progress,
transaction boundaries, and final scores.

## Non-goals

- No change to mastery thresholds, points, seals, trophies, ranking order, or
  monthly research rules.
- No schema or index removal in this workstream.
- Single-entry administration and backfill APIs remain available.
- No deployment or production data mutation.

## Considered approaches

### Cache the summary between sequential recorder calls

This removes repeated summary reads but leaves individual progress ensures,
locks, and writes. Request-scoped cache invalidation also becomes implicit.

### Run existing recorders concurrently

Rejected. Every recorder locks the same summary row, so concurrency would still
serialize in PostgreSQL and could introduce nondeterministic lock ordering.

### Add an explicit batch store and batch recorder

Selected. The batch boundary matches an existing gameplay action and keeps all
state request-scoped. Entries are validated before any write, unique progress
keys are locked in deterministic category/entry order, transitions are applied
in memory in stable event order, and final dirty rows are persisted together.

## Service design

`createCodexMasteryBatchRecorder(store, catalog)` accepts one user ID and a list
of `CodexMasteryRecordInput` values. It:

1. Returns disabled results without locking when recording is disabled.
2. Validates that every input belongs to the same user, references a catalog
   entry, uses an allowed server-owned source, and has a valid mutation.
3. Deduplicates progress identities by `category:entryId` and asks the store to
   lock them once.
4. Applies inputs in their supplied deterministic order. Multiple sources for
   the same equipment entry update the same in-memory progress object in order.
5. Carries one evolving summary through all transitions.
6. Skips persistence when every transition is unchanged.
7. Saves the final summary once and every changed progress row in one store call.
8. Reconciles trophies once after the batch if any count tier was crossed.

The result array retains one result per input. Promotions returned by the single
reconciliation are attached to the final result that crossed a count tier; no
current gameplay caller consumes the result array, but this keeps a deterministic
contract.

## Repository design

`lockCodexMasteryBatchState` executes four statements for a non-empty batch:

1. Insert the user's summary row with conflict-do-nothing.
2. Insert all missing progress rows with one multi-row conflict-do-nothing.
3. Select the summary row `FOR UPDATE`.
4. Select all requested progress rows `FOR UPDATE`, ordered by category and entry
   ID.

It verifies that exactly one row exists for every requested identity.

`saveCodexMasteryBatchState` updates the summary once and writes changed progress
rows with one multi-row `INSERT ... ON CONFLICT DO UPDATE`, preserving each
existing `first_recorded_at` and replacing only mutable progress fields.

The single-entry repository functions remain unchanged for backfills and callers
whose public contract is one entry.

## Gameplay integration

`createCodexMasteryGameplayRecorder` continues aggregation, zero filtering, and
sorting. Its runtime changes from `record` to `recordBatch`, called once with all
permanent inputs. Monthly research still receives one aggregate batch. Settings
are still read once; their repeated database read is addressed in the later
settings-cache workstream.

## Concurrency and errors

- Callers continue to run within their existing database transaction.
- Summary-first then sorted-progress locking gives one global lock order.
- Validation failure occurs before database state is created or locked.
- Malformed persisted rows fail closed and prevent all batch writes.
- A repository row-count mismatch aborts the transaction.
- Trophy failure occurs after mastery save but inside the caller transaction, so
  the whole action still rolls back as before.

## Testing

- Memory-store service tests cover multiple entries, repeated identity with
  different sources, one batch save, unchanged batches, validation before lock,
  final summary equality, and one trophy reconciliation.
- Repository tests cover sorted/deduplicated multi-row ensure and lock behavior,
  one summary update, one bulk progress upsert, empty input, and missing-row
  failure.
- Gameplay tests prove one `recordBatch` call receives the sorted aggregate while
  monthly behavior remains unchanged.
- PostgreSQL integration continues to test concurrent serialization; a batch case
  verifies two entries and one final summary when the optional test database is
  available.
