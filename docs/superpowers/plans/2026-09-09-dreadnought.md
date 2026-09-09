# Dreadnought Implementation Plan

> Use superpowers:executing-plans inline. User instructions prohibit subagents and repeat approval prompts.

**Goal:** Add the approved tier 7 defense/counter hybrid with its three skills.
**Architecture:** Reuse tier7 job registry and fortress impact. Add small pure dreadnought transitions shared by PvE/PvP; pass equipped passive values through normal aggregation/derivation. Preserve unrelated combat paths.
**Tech Stack:** TypeScript, Next.js 16, Vitest.

## Constraints
- Follow `../specs/2026-09-09-dreadnought-design.md` values. Work in `/tmp/adventure-dreadnought-20260909`.
- No deployment/push/integration or unrelated worktree changes. No subagents.

## Tasks
- [x] 1. Add failing `dreadnoughtAdvancement.test.ts`: catalog/dual prerequisite gates/legacy mapping/growth, kit and actual `[14,12,10]` SP, final counter `30+10=40` and passive values. Implement registry/catalog/skills fields, aggregation, descriptions and derive-player forwarding.
- [x] 2. Add failing `dreadnought.test.ts`: pure impact consume and counter transition, cap3, action gain once, no hit no effect, preserve pending boost on no hit. Implement `dreadnought.ts` with `dreadnoughtImpactSpend` and `dreadnoughtCounterHit` returning immutable stack patches and raw healing. Add skill-specific impact bonus to `combatShared.ts`.
- [x] 3. Add failing `dreadnoughtCombat.test.ts`: real PvE/PvP casts and counters, inherited ram healing, healing reduction, missed hit and shield behavior, enemy skill persistence. Integrate helpers into `engine.ts`, `engine.enemyPhase.ts`, `engine-pvp.ts`, carrying state through each damage path. Use existing healing calculations and log actual effects.
- [x] 4. Update manual count wording and job list/roadmap tests. Run focused suites, TypeScript, changed-file ESLint, module budget check. Review diff for regressions and commit only dreadnought work on its local branch.

Test commands: `npm test -- src/adventure/data/v2/dreadnoughtAdvancement.test.ts src/adventure/v2/combat/dreadnought.test.ts src/adventure/v2/combat/dreadnoughtCombat.test.ts`, then related fortress/vajra/tier7/derive/skill/roadmap suites; `npx tsc --noEmit --incremental false`; `npx eslint <changed TS/TSX paths>`; `npm run check-module-budgets`.

## Validation results

- Baseline: 18 existing fortress/vajra/tier7 tests passed before implementation.
- Red/green: missing job/skills/passive forwarding and combat transitions failed first, then passed. Added reproductions for multi-hit and forced-provoke action limits before fixing them.
- Broad regression: 97 files / 1,084 tests passed (all combat tests plus related catalogs, roadmap, passive summary, combat derivation, advancement route).
- After the final provoke-boundary fix: 6 files / 74 tests passed, including 17 dreadnought integration cases, both ATB skill suites and both prerequisite advancement routes.
- Whole-repository TypeScript passed with `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --incremental false`. The first run exceeded Node's default 2GB heap; no repository configuration was changed.
- ESLint on all changed/new TS/TSX files passed. `git diff --check` and all 12 module budgets passed.
- Self review completed per the user's no-subagent rule. Existing 7차 package costs remain unchanged; new SP costs are exactly14/12/10. Deployment, push and integration were not performed.
