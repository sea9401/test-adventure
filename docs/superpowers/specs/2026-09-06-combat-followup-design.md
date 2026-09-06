# Combat follow-up

Approved order: truthful raid metrics, bounded offline logs, deterministic combat,
shared effect boundaries, build comparison. No balance changes, deployment, push,
DB migration, lock changes or subagents. Reuse the existing isolated worktree.

1. Raid's persisted damageTaken is net HP loss. Relabel both live/history and
   practice UI to final HP loss, with recovery explanation; keep historical data
   and API meaning unchanged. Adding a cumulative counter would require auditing
   every damage path and versioning historical records, so it is not substituted.
2. Introduce optional full/summary log mode. Full mode preserves exact replay logs.
   Summary discards completed event history at outer engine loop boundaries, not
   within an action: boss mechanics read current-action log deltas. Return no
   replay events in summary mode; final combat state remains authoritative. Wire
   offline hunt to summary; preserve online full mode. Do not mutate old arrays.
3. Provide a synchronous scoped RNG adapter, accepting an optional seeded random
   function through PvE/PvP context. Never replace global Math.random. Nested
   resolutions restore the outer scope even on errors; default behavior delegates
   to Math.random with unchanged call order. A synchronous scope is valid only
   because both engines complete before returning and never yield/await.
4. Extract pure DoT creation/ticking/application from combatShared into a bounded
   module; preserve exports, operation order, rounding and PvE/PvP policy differences.
5. Add a local build-comparison runner accepting explicit input snapshots, seed
   sequence and ruleset metadata. Compare each build against the same enemy and
   seeds; report wins, timeouts, turns and final HP (not falsely labelled cumulative
   damage/healing). Keep full seeded cases reproducible. No public API, user data
   export or automatic balance tuning. Rich damage-source telemetry is a separate
   extension requiring instrumentation at each damage application, not log parsing.

Validate behavior first with failing tests, then full/summary parity and existing
golden cases without snapshot updates. Test nested RNG and failure restoration,
legacy/ATB paths, special bosses and comparison input bounds. Run focused and full
tests, lint, typecheck and production build before handoff. Document measured local
log retention/runtime and do not claim production latency savings.
