# Combat Follow-up Implementation Plan

> Execute with executing-plans, inline per AGENTS.md (no subagents).

**Goal:** Improve combat observability, log cost and repeatable comparison without changing balance.

**Architecture:** Preserve public engines and full replays; opt-in summary/RNG
contexts; extract pure shared DoT helpers; local-only paired comparison.

**Tech Stack:** TypeScript, Next.js 16, Vitest, tsx.

## Global constraints

No deployment, push, DB migration, lock changes, balance adjustments or snapshot updates.
Existing worktree `/tmp/adventure-gameplay-refactor-20260906` is already isolated.

- [x] 1. Relabel net HP loss in `guild/GuildRaidPanel.tsx` and
  `GuildRaidAttackLogView.tsx`, documenting API compatibility. Extend existing
  practice render test to expect `최종 HP 감소량` and recovery explanation; watch
  it fail, change labels, run raid UI/service tests and commit.
- [x] 2. Add `logMode?: "full" | "summary"` to both engine contexts. Test seeded
  full/summary equal outcomes, HP/MP, turns, stacks and potions, with summary log
  empty and full log unchanged. At outer loops only, execute
  `if (ctx.logMode === "summary") state = { ...state, log: [] };`.
  Public wrappers return an empty final log for summary. Pass summary for
  `runOneHunt(false, ...)`; verify boss/legacy parity and offline tests, commit.
- [x] 3. Create `combatRandom.ts` exposing `combatRandom()`,
  `withCombatRandom<T>(random: (() => number) | undefined, run: () => T): T`, and
  `seededCombatRandom(seed: number): () => number`. Test repeated seeded real
  battles, nested scope restoration and thrown callbacks before implementation.
  Replace direct Math.random reads in combat runtime modules with combatRandom;
  context wrappers scope execution. Preserve default RNG/golden outputs, commit.
- [x] 4. Move pure DoT helpers/types from `combatShared.ts` into
  `combatDots.ts`, retaining compatibility exports. Add independent literal
  expiry/stack/rounding assertions and run DoT, poison, bleed, PvE/PvP tests and
  dependency-cycle guard. Do not merge policy-specific damage application. Commit.
- [x] 5. Create local `combatComparison.ts` + CLI accepting JSON PvE build and
  enemy snapshots, explicit bounded trials and seed base. Use paired seeded
  engine calls with summary mode. Return inputs, ruleset flags, algorithm version,
  per-seed outcome/turns/remaining HP and aggregates. Test deterministic reruns,
  identical-build equality, invalid counts and input immutability; run a local
  comparison, document limitations and commit.
- [x] Final. Full tests, lint, typecheck, build, budgets and diff check. Record
  actual counts, local measurements, remaining telemetry limitations. Leave all
  changes committed on current branch, without merge/push/deployment.

## Execution record — 2026-09-06

- Step 1: `4b8289f7e`.
- Steps 2–4: `f787ad744`, grouped because the engine wrappers and shared helper
  imports overlap. Implemented and tested in the planned order.
- Step 5: `2d0dca910` (PvE and PvP), including usage/limitations in
  `docs/combat-comparison.md`.
- Full suite: 1,203 files passed, 5 skipped; 9,502 tests passed, 23 skipped;
  243.84 seconds. Existing golden expectations were not regenerated.
- Full lint, standalone TypeScript check and production build: exit 0.
  The final strengthened RNG test needed an explicit V2SkillsState annotation;
  TypeScript was rerun successfully after that correction.
- Final focused RNG/comparison/log-mode run with core loop, ATB skills and
  skill-proc-in-pattern enabled: 3 files / 15 tests passed. Final edited-test
  lint passed. Module budgets: all 58 passed. Git diff whitespace checks passed.
- Clean-tree CLI smoke at exact revision
  `2d0dca910d6de4bc6be34eb1a2a834ad84e87e06`, all three flags enabled:
  each example won 20/20; A mean turns 20.75 / remaining HP 306.5;
  B mean turns 16.4 / remaining HP 350.75. Synthetic inputs, not a balance verdict.
- Local long-fight log-mode probe: full 30.27 ms vs summary 22.02 ms median;
  final log entries 1,549 vs 0. This is not an operational average or zero
  per-action allocation. Setup and limitations are recorded in the usage guide.
- Manual review preserved full replay defaults, boss event-delta consumers,
  default RNG ordering and PvE/PvP-specific damage policies. No DB lock,
  transaction boundary, production settings or balance changes.
- Skill-by-skill cumulative damage/healing/shield diagnostics, historical seed
  persistence and production performance measurement remain outside this first
  pass. No merge, push or deployment performed.
