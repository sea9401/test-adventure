# Emblem Dungeon Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. User instructions prohibit subagents and redundant approval gates.

**Goal:** Add selectable dungeons and non-tradable level-growth emblems under Character > 문장.

**Architecture:** Pure emblem rules and server-authoritative mutations, integrated into the existing level-growth pipeline; a linear dungeon shares expedition combat and choice behavior without changing storm expedition rewards. Protect each mutation with character locks and optimistic versions.

**Tech Stack:** Next.js 16.2.11 App Router, React 19, TypeScript, Drizzle savesKv, Vitest.

## Global Constraints

- No deployment, push, merge or PR requested.
- Follow approved numbers in ../specs/2026-09-16-emblem-dungeon-design.md.
- Preserve existing storm expedition behavior and data.
- Baseline: user-approved main b0f234fd3 with existing unexplored unlock and reincarnation history.
- Work in /tmp/adventure-emblems-20260916; do not modify the shared release checkout.

## Task 1 — independent emblem domain

Files: src/adventure/data/v2/emblems.ts and emblems.test.ts.

- [x] Write failing tests for four-slot ownership, duplicate-kind independence, failure consuming only material, max-grade rejection, stale revision rejection, drop thresholds, and no retroactive growth.
- [x] Run `npm test -- src/adventure/data/v2/emblems.test.ts` and inspect missing behavior failures.
- [x] Implement typed Emblem/EmblemState and parseEmblemState, mutateEmblems, rollEmblemDrop, rollEmblemGrowth. Pure functions accept injected rng; item identity comes from a supplied server-generated UUID.
- [x] Run domain tests. Add tests for malformed persisted state and equipped material protection.

## Task 2 — authoritative storage and growth

Files: src/app/api/v2/emblems/route.ts, src/lib/server/emblemLevelGrowth.ts, src/adventure/data/v2/proficiency.ts, src/lib/server/derivePlayerCombatV2.ts, existing normal/offline/consumable level-grant callers.

- [x] Confirm baseline and existing unexplored unlock/growth policy.
- [x] Write regression tests: two actual levels produce two independent growth rolls per equipped item, no-level grants produce zero, unequip preserves prior gains, all real level-up paths apply one growth update.
- [x] Add ownership/slot/fusion endpoint with authenticated character transaction lock, rate limit, integer slot validation, and required expected revision. Never accept client-supplied rolls or item catalogs.
- [x] Persist and derive gained HP/MP/stats; preserve gains on unequip. Explicitly test reset/advance behavior against the settled policy.
- [x] Run growth and route tests, including concurrent/stale mutation rejection and unauthorized requests.

## Task 3 — linear sanctuary dungeon

Files: src/adventure/data/v2/sanctuaryDungeon.ts, src/app/api/v2/sanctuary-dungeon/route.ts, shared expedition combat/choices helper as needed.

- [x] Add failing tests for independent daily attempts, authoritative unlock, stale battle rejection, linear transitions, invalid choices and battle failure.
- [x] Reuse existing combat preparation/resolution and expedition choice effects. Preserve HP/MP between fights and limited-recovery-skill usage.
- [x] Roll and persist emblem rewards under the same lock as battle progression; prevent duplicate awards on retries. Verify general/elite/boss thresholds and all three grade boundaries.
- [x] Run sanctuary tests and existing storm expedition regressions.

## Task 4 — menus and playable screens

Files: src/adventure/v2/MainTabNav.tsx, V2CharacterMenu.tsx, V2BattleHome.tsx, V2EmblemView.tsx, V2DungeonSelectionView.tsx, V2SanctuaryDungeonView.tsx, corresponding app/(game) pages.

- [x] Add UI tests for Character > 문장, dungeon navigation, equip/unequip/fusion success and failure, visible rules, and linear dungeon progression.
- [x] Build four-slot and owned-item interface, explicit fusion target/material and confirmation, accessible status/error handling and busy guards.
- [x] Build dungeon selection and linear sanctuary progression including choices, battle results and reward display.
- [x] Update manual and activity links to match the final behavior.

## Task 5 — verification and local delivery

- [x] Run affected Vitest suites, TypeScript, changed-file ESLint and image references.
- [x] Review all diffs for unrelated changes, numerical contracts, data races and reset behavior.
- [x] Commit the verified feature locally and report checks and remaining limitations. No deployment.

## Verification checkpoint

The user approved main as the baseline. The feature branch contains the earlier independent emblem commit rebased onto that main plus the completed sanctuary, level-growth integration, menus and manual. No deployment, main merge or remote write was performed.

Verified the pure domain, authoritative mutation APIs, linear run and reward claiming, existing storm route regressions, normal/rare/unexplored/offline shared growth path, level grant paths, normal caps/reincarnation reset, combat derivation, character and dungeon UI, activity summaries and current manual content. The 24-suite regression run passed 423 tests; an additional practice-access regression was written, failed, then passed with the selector fix (3 selector tests passed). TypeScript passed with a 6 GiB Node heap after correcting test fixture types. Changed-file ESLint, image-reference validation, module budgets and git diff whitespace checks passed.

No new images, SQL migration or installed dependency is required. Live database/browser end-to-end gameplay and new difficulty balancing were not run; new enemy values reuse the existing storm wreckage balance. Reincarnation resets and normal stat caps follow the existing policy, as stated during implementation.
