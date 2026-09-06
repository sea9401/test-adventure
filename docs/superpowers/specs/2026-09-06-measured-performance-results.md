# Measured performance follow-up results

## Operational baseline (read-only)

Production SHA: `ab4032eeaa8388ec0778021f2627da37231f8285`.
Profiler window: 2026-09-06 12:17:42.481–13:17:44.832 KST, 60 intervals.

| Operation | Requests | Mean elapsed ms | Queries / request |
| --- | ---: | ---: | ---: |
| Hunt POST | 1,606 | 368.54 | 28.43 |
| State GET (core/full combined) | 1,874 | 87.55 | 16.26 |
| Fishing reel POST | 534 | 73.31 | 40.18 |
| Woodcutting chop POST | 924 | 60.45 | 28.24 |

Nginx state endpoint totals for the corresponding window: 1,864 HTTP 200,
10 HTTP 499, no HTTP 5xx. The profiler's legacy errors counter reported nine
state errors; it combines aborts and 5xx and observes a different completion
boundary. This does not establish the cause of disconnects.

## Local changes and deterministic checks

1. Keep legacy `errors` as the union; expose `serverErrors` and
   `abortedRequests` independently. An aborted 500 belongs to both new counters
   but counts once in the legacy union. Older snapshots may omit the new fields.
2. Record `hunt.prepare`, `hunt.battle`, and `hunt.settlement` in request-local
   state and serialize under feature/operation `phases`. Each contains count,
   failed count, elapsed total/max, query count and summed query milliseconds.
   Preparation starts inside `runOneHunt`: authentication, connection acquisition,
   outer transaction work and replay persistence are not part of these phases.
   Batch and offline calls contribute per executed hunt, not per HTTP request.
   A failed phase means a thrown exception, not a lost battle or validation result.
   Elapsed time minus summed DB time is not a CPU measurement.
3. Core state refresh now uses an instance-local in-flight coordinator, with no
   completed-response cache or mixing with full state requests. Ten same-tick
   refreshes issue one read; ten refreshes during an older pending read issue one
   fresh trailing read (two total). An older response cannot overwrite resources
   applied via `applyResourcePatch`; direct legacy setters are outside this guard.
   Component tests reproduce gold 123 being overwritten by stale gold 999 before
   the fix, preserve 123 afterward, and apply a fresh authoritative 125 when a
   post-mutation refresh is requested. Invalidated snapshots are discarded whole.
4. Fishing reel and woodcutting chop share a transaction-local codex feature
   settings snapshot between life progress and later fish/job mastery recording.
   Using the real settings reader with a fake DB boundary, two recorder calls
   issue two settings SELECTs without context and one with context. Record batches
   and their order remain identical; reward route tests retain their assertions.
   No lock acquisition, write order, save version, RNG or transaction boundary
   was changed. This saves one SELECT only on paths that perform both recordings
   (woodcutting's later job recording is conditional). Failed reads are not cached,
   and another executor cannot reuse the snapshot. A setting change during one
   transaction is observed by the next transaction rather than midway through it.

## Verification (2026-09-06)

- `npm test`: 1,198 files passed, 5 skipped; 9,483 tests passed, 23 skipped;
  308.96 seconds. The first sandboxed run had 33 failures including child-process
  and loopback-listen `EPERM`; the approved unrestricted full rerun passed.
- `env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit --incremental false`:
  exit 0. Tests use `BigInt(...)` to respect the project's compilation target.
- `npm run lint`: exit 0; the final added component/DB-boundary tests also passed
  a focused lint check.
- `npm run build`: exit 0; 612 static pages, image references and client cooking
  secret check passed. Build skips type validation, so the separate check above
  is required.
- `npm run check-module-budgets`: 53 targets passed. The hunt execution cap was
  raised from 1,260 to 1,280 only to accommodate the phase wrapper (1,270 lines).
- `git diff --check`: passed. Manual diff review confirmed unchanged gathering
  lock/write sequence and battle resolution inputs; no golden results changed.

## Limits and next operational check

No deployment, push, production mutation or live load generation was performed.
These are local correctness/query-boundary checks, not a production latency
benchmark. Re-measure comparable traffic only after a separately authorized
deployment; inspect hunt phase totals/counts, distinct abort/server-error counts,
state request frequency, gathering queries/request and request elapsed time.
Do not extrapolate per-interval percentiles into a global p95, socket byte counts
into payload savings, or summed request elapsed time into CPU share.
