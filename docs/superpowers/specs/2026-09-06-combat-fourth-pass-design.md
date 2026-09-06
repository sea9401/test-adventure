# Combat Fourth Pass Design

## Scope and approach

User approved remaining telemetry, HP reconciliation, then broader comparison.
Keep the existing opt-in synchronous collector. Instrument the actual numeric
mutation sites; do not derive metrics from replay text or replace the entire HP
mutation pipeline. A global mutation rewrite has much higher gameplay risk;
log parsing misses summary/no-log events. No balance/data/RNG/log changes.

## Deliverables

1. Cover PvP dodge reflection and rune/martial counters; capped potion, evasion,
   extra-hit and bleed-tick healing; manual endurance sites in legacy/ATB/PvP.
   Audit adjacent enemy-skill damage/recovery so the tested HP ledger is useful.
   Audit amendment: AP adapters receive empty fired-skill lists and have no
   active runtime catalog. Do not reactivate them to instrument an inactive path.
2. Pure per-target reconciliation: expected HP = initial HP - hp_damage + healing
   + survival_restoration. Residual = actual HP - expected HP. Do not clamp expected
   HP (that would hide duplicate overkill/heal hooks). Validate finite nonnegative
   HP and meaningful metric values. Ignore shield/resolved damage/gate/cast rows.
   Report residuals on diagnostic comparison trials and verify zero on bounded
   real-engine fixtures. A zero residual is not proof of exhaustive site coverage;
   HP costs, maximum-HP shifts and boss resets remain explicit unsupported cases.
3. Extend the local venom probe with a reproducible matrix of three skill
   patterns, two defense levels and two action windows using the same catalog
   growth/loadouts. Synthetic target modifications must be labeled. Run paired
   100-seed trials; expose outcomes, timeouts, HP loss and reconciliation residuals.
   Preserve the original three-case probe for backward comparison.

## Verification and boundaries

RED/GREEN fixtures with literal damage/recovery values; independent ledger math
tests including deliberate missing and duplicate rows; seeded full/summary and
diagnostics-on/off equality; default golden snapshots unchanged; full tests,
lint, independent typecheck, local build and budgets. Review inline without agents.
Small audited instrumentation-only budget deltas are allowed if extraction would
merely shuffle unrelated code; no cosmetic line compression to pass a budget.
No network/account/DB access, push, merge, deployment or balance verdicts from
synthetic trials. Existing isolated branch is retained. No UI or visual companion.
