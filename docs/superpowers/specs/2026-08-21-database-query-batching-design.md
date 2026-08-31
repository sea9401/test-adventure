# Database Query Batching Design

## Context

Production runtime samples show `POST /api/v2/dungeon/hunt` at roughly 33 queries per request on average and commonly 39 queries per request. In the same window the application pool reported no waiters and RDS CPU stayed below saturation. The first optimization target is therefore request amplification, not a larger connection pool.

`GET /api/save` already seeds two rows in one insert and reads all synchronized rows in one select. Its operation-level total also includes authentication and session work, so changing the save route without finer attribution would be speculative. The `life` profiler bucket likewise combines many endpoints. This change will optimize shared save access used by combat and add endpoint-level attribution for save/life traffic before choosing the next life endpoint.

## Goals

- Reduce round trips in the successful single-hunt hot path without changing rewards, response payloads, transaction boundaries, or authorization.
- Preserve the established lock order: outpost rows, guild lookup, `character.v2`, then the remaining per-user save rows.
- Make multi-key save reads, locks, and upserts reusable by other server routes.
- Preserve per-key `version` increments and a common `updatedAt` timestamp during batched upserts.
- Split save/life runtime-profiler operations by normalized static endpoint so the next optimization is evidence-based.

## Non-goals

- No deployment, maintenance-mode change, RDS parameter change, pool-size change, or Performance Insights activation.
- No caching of authenticated responses or server-authoritative state across requests.
- No schema migration.
- No broad rewrite of every life endpoint in this change.

## Considered approaches

### Increase the PostgreSQL pool

Rejected for now. Production samples showed zero pool waiters, while the `db.t4g.micro` instance had limited free memory. More connections would not remove the repeated statements and could increase database memory pressure.

### Add route-local memoization only

This would reduce a few duplicate reads but leave five independent save upserts and duplicate batching code. It would also be difficult to reuse safely in progression and life routes.

### Add shared multi-key save primitives and a request-scoped hunt state

Selected. A single-user `saves_kv` primary key makes multi-key selects and multi-row upserts natural. The hunt route can keep `character.v2` as the first save lock, lock the remaining mutable save rows in a deterministic order, derive all read-only combat inputs from one multi-key read, and flush dirty save values with one statement.

## Design

### Shared save primitives

`savesKv.ts` gains:

- `readSaves(executor, userId, fallbacks)`: one `SELECT key, value ... WHERE user_id = ? AND key IN (...)`, returning every requested key with its fallback filled in.
- `lockSavesForUpdate(executor, userId, fallbacks)`: the same lookup with deterministic key ordering and `FOR UPDATE`.
- `upsertSaves(executor, userId, entries)`: one multi-row insert with conflict update. Each conflicting row receives `excluded.value`, increments its own version once, and shares one `updatedAt` value.

Empty input returns immediately and emits no SQL. Duplicate keys are represented by object/map keys and therefore cannot produce multiple updates in one statement.

### Hunt preload and flush

The outer support check remains a non-locking read because location and batch entitlement must be known before the transaction obtains outpost locks. Inside the transaction:

1. Lock outpost rows and read guild policy as today.
2. Lock `character.v2` alone, preserving its position in the global lock order and the location-change check.
3. On the request-scoped batch state, lock equipment, skills, proficiency, inventory, adventure log, and guild dining state in one deterministic query.
4. Read profile plus fishing/equipment codex state in one non-locking query. Build the codex SP bonus from those raw values.
5. Run the existing battle and reward logic against the request-scoped values.
6. Mark changed saves dirty. Flush all dirty save keys in one `upsertSaves` call on both single and multi-hunt success paths. If the low-HP recovery branch consumes charges, mark those two values dirty and flush before returning its error response.

Guild dining keeps its existing read/lock semantics when no preloaded cache is supplied. The hunt preload marks the cache initialized and locked because the row was included in the deterministic `FOR UPDATE` query.

The route continues to perform non-save writes such as referral rewards and guild exploration in their existing order.

### Runtime attribution

The profiler will keep its privacy-safe normalized labels but recognize static save and life endpoints (for example `/api/save`, `/api/v2/me/state`, `/api/v2/farm/harvest`, and `/api/v2/life-fields`) instead of combining them all as `GET save` or `POST life`. Dynamic identifiers remain collapsed by the existing fallback category, never retained verbatim.

The operations runbook will record how to compare request count, DB query count, DB time, and pool waiting. `pg_stat_statements` and RDS Performance/Database Insights remain operator-approved infrastructure steps because they can require parameter-group or paid-service changes.

## Correctness and concurrency

- All mutable hunt rows remain inside the same database transaction.
- `character.v2` is still the first `saves_kv` row locked by hunt; remaining keys use sorted order.
- A batch upsert increments each touched key once per request, matching the current final-state write behavior for multi-hunt. Single hunt also previously wrote each final key once.
- Missing rows use the same fallbacks and are created by the final upsert.
- The in-process per-user hunt guard remains unchanged.
- No state is cached beyond one request/transaction.

## Verification

- Unit tests for multi-key fallback behavior, deterministic lock query shape, empty input, and one-statement multi-row upsert.
- Hunt integration tests for unchanged success/error state plus a query-boundary budget: one remaining-save lock preload, one read-only preload, and one save flush on the normal successful path.
- Route-classifier tests proving exact normalized save/life labels and absence of query strings or dynamic IDs.
- Focused tests during TDD, then TypeScript, lint, full Vitest, build, `git diff --check`, and final diff review.
