# Combat diagnostics, second pass

## Scope and design

Add opt-in local diagnostic aggregation to the existing synchronous PvE/PvP
comparison workflow. No balance change, network/DB access, production activation,
API payload change or deployment. Existing isolated branch is reused.

Considered: parsing replay strings (ambiguous and language-dependent), sampling
HP at action boundaries (loses simultaneous damage/healing), and instrumentation
at resolved calculation sites. Use calculation-site instrumentation, independent
of replay retention and randomness. Disabled instrumentation must not change
engine results or consume RNG. Nested synchronous scopes restore in finally.

Record metric/category/source/recipient aggregates, not unbounded event arrays.
Distinguish resolved damage from effective HP loss and shield absorption; healing
must use actual capped recovery. Never count shield expiry as absorption or HP
cost as hostile damage. Explicit coverage metadata accompanies the report; do
not claim uninstrumented special effects are covered or infer missing totals.

Record actual skill selection gate observations (cooldown, MP, unavailable
effect/resource, pattern condition, proc failure, selection). Candidate checks
may repeat and must not inflate a per-evaluation reason. A successful resolver
selection is not necessarily a final cast because callers may rerun calculations.
Label selector evaluations accordingly; no additional random draws for diagnosis.

Keep normal combat instrumentation disabled; enable via local comparison input.
Tests compare complete seeded resolutions with diagnostics on/off, both engine
families and full/summary logs; fixed fixtures independently assert quantities.

## Approval and review

User approved the proposed first two second-pass tasks. Per AGENTS.md, execute
local design, implementation, non-destructive checks and commits continuously,
without repeated approval menus or subagents. Real-player build evaluation and
performance-driven follow-up refactors are not included in this request.
