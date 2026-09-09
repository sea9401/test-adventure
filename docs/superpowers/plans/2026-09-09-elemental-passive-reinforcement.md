# Elemental Passive Reinforcement Implementation Plan

Use executing-plans inline; AGENTS.md prohibits subagents/repeated approval gates.
Goal: add one role-specific support effect to each existing fire/wind 5th/6th utility passive.

- [x] RED: fire-specific MP affordability, collapse shield with/without passive and missed attack, wind gain shield and full release evasion including non-stacking in real PvE/PvP; server forwarding and generic bonus regression.
- [x] Catalog/price/description: fire spell marker, passive fields, shield equipped synergy with shared constant, passive aggregation and summary.
- [x] Combat: discount common cast cost; extend wind settlement to shield/evade and connect shield totals/logs/tier6 events and PvP sustain scaling. Preserve engine budgets.
- [x] Verify targeted + related regressions, TypeScript6GB, lint, diff, module budgets; self-review and local commit only.

Verification:
- RED confirmed missing affordability discount, both engine shield grants, release evasion, and server forwarding before implementation.
- Related regression: 1,052 tests / 95 files passed.
- Final focused: 48 tests / 5 files passed, including minimum MP cost and preserving larger existing evade pools.
- TypeScript6GB passed. Changed-file ESLint, git diff --check, all12 module budgets passed.
- Self-review: MP discounts require learned+equipped and a fire spell marker; common candidate selection and payment share the same cost. Fire shield uses existing equipped synergy and self-effect rules. Wind shield is based on actual gain and participates in shield logs/tier6 events/PvP sustain scaling. Guaranteed evades use max(existing+other grants, minimum grant), never reset or add repeatedly.
- Final costs: 5/5/6/6 SP for the four passives; collapse14 SP via generic synergy pricing. No new skill IDs, generic INT/magic damage, deployment, push, or merge.
