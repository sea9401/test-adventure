# Measured performance follow-up

Use the approved order: classify state errors, instrument hunt phases, reduce proven state request duplication, then reduce proven gathering DB duplication. Existing production snapshot is the baseline, not evidence of local improvement. Work in the existing isolated worktree without deployment or live writes.

Nginx for the measured state endpoint reports 1,864 HTTP 200 and 10 HTTP 499, no 5xx. The profiler reported nine errors because its legacy counter combines aborted requests with 5xx and observes a different completion boundary. Do not claim a server failure or infer why clients disconnected. Keep the legacy errors field for compatibility and add separate server-error and aborted counters.

Hunt instrumentation will use existing request-local storage and bounded, static phase names. Separate preparation, battle resolution, and settlement without changing locks, RNG, transaction scope, or response payload. Aggregate elapsed time and attributable query counts; do not interpret elapsed minus DB time as pure CPU.

State refresh optimization must preserve fresh reads after mutations and protect against stale responses. Prefer instance-local coalescing of refresh bursts with a trailing read when invalidated; do not introduce persistent caching or merge different views. Reuse existing core view rather than stripping fields from full-view callers.

Gathering optimization is conditional on verified duplicate access. Reuse already-loaded snapshots or existing batched save helpers only where there is no intervening mutation. Preserve user locks, row lock order, version increments, idempotency receipts, and reward outcomes. Record a local query-count comparison with deterministic fixtures; no speculative removal of integrity checks.
