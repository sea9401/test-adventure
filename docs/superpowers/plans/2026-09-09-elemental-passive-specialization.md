# Elemental Passive Specialization Implementation Plan

Use superpowers:executing-plans inline, no subagents/repeated approvals per AGENTS.md.
Goal: replace four duplicate generic mage passives with burn sustain and wind resource cycling.
Architecture: reuse equippedSynergies for collapse ignition, extend playerDotDamage for burn duration, add shared wind settlement for rebound and mana. Keep current branch/worktree.

- [x] RED: catalog regressions remove generic bonuses, pure burn/wind tests for duration/refund/rebound conditions, real cast tests for both engines and server forwarding.
- [x] Implement catalog/passive aggregation/derive/description/SP. Keep skill IDs, use conditional fire6 synergy and no generic damage/stat buffs.
- [x] Implement pure wind transition + engine settlement, burn duration application. Display rebound readiness. Extract wind adapter to respect engine budgets.
- [x] GREEN: targeted then related combat/catalog/presentation tests; TypeScript6GB, changed-file lint, diff check and module budgets.
- [x] Self-review and local commit, no deployment.

Verification:
- Catalog RED confirmed old generic stat passives instead of the new effects; pure burn/wind RED and real PvE/PvP RED confirmed missing transitions before wiring.
- Related regression: 1,041 tests / 95 files passed.
- Final focused regression: 45 tests / 6 files passed, including explicit proc-failure readiness retention.
- TypeScript with 6GB heap passed; changed-file ESLint, git diff --check, all 12 module budgets passed.
- Self-review: current generation uses pre-cast damage and post-hit settlement; MP counts actual capped gain only. Fire6 uses existing equipped synergy/miss/immunity handling; duration applies once to newly created dots. No extra generic stats/damage fields, learned IDs unchanged. Rebound is battle-only and absent at new battle initialization.
- Local commit on feat/wind-mage-advancement-20260909 only; no push, merge, or deployment.
