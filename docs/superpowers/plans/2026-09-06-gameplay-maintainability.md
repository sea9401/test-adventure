# Gameplay Maintainability Implementation Plan

**Goal:** Complete the five approved refactoring stages in order: coin shops, marketplace, hunts, combat derivation, combat engines.

**Architecture:** Preserve public imports and runtime behavior while separating domain policies, request orchestration, rendering, and pure calculations. Keep transaction boundaries, combat arithmetic and RNG ordering unchanged. Correct the identified weekly purchase-limit message through a regression test.

**Tech Stack:** TypeScript, React, Next.js 16, Drizzle, Vitest.

## Constraints

- Work on `refactor/gameplay-maintainability-20260906` under `/tmp`.
- Preserve gameplay balance, API payloads, persistence format, locking order and combat logs.
- Retain existing exports through compatibility re-exports where consumers need them.
- Each stage has focused verification and its own commit. Final validation includes full tests, typecheck, lint, module budgets and production build.
- No push, merge or deployment is part of this refactoring request.

## 1. Coin shop policies

- [x] Add hook regression tests for weekly limits, fishing rewards, failed purchase state synchronization and generic fallback.
- [x] Move fishing-specific messages to `fishingShopMessages.ts`; add optional consumable message policy to `useCoinShop` and wire `useFishingShop`/`useArenaShop`.
- [x] Run shop tests and commit.

## 2. Marketplace responsibilities

- [x] Verify the existing requests/layout baseline and codex-filter regression tests.
- [x] Separate listing/auction rendering and price-tool dialogs from `V2MarketplaceView.tsx` into focused marketplace components, preserving props and exports.
- [x] Isolate typed marketplace read requests from React state updates and preserve tab-based lazy loading and refresh behavior. Cross-domain inventory reads remain in their existing callbacks.
- [x] Run marketplace tests and typecheck, then commit.

## 3. Hunt processing

- [x] Verify existing hunt route, stamina, cooldown, tax, rare-map and unexplored tests.
- [x] Separate HTTP authentication/rate limiting, single-hunt execution and batch orchestration into modules under the hunt directory.
- [x] Preserve the shared transaction, batch flush timing and request-scoped in-flight guard.
- [x] Run hunt/server tests and typecheck, then commit.

## 4. Combat derivation

- [x] Verify existing derivation tests and combat golden snapshots.
- [x] Extract pure derivation/types and save interpretation into focused modules, leaving DB fetching in the compatibility entry point.
- [x] Separate primary stat contributions from final combat conversion at an existing calculation boundary; preserve rounding and modifier order.
- [x] Run derivation and golden tests and typecheck, then commit.

## 5. Combat engines

- [x] Establish the existing golden and combat test baseline.
- [x] Extract PvP state types and shared state operations to remove the engine/phase runtime back edge.
- [x] Separate PvE/PvP skill-action processing from battle loop orchestration, using explicit lower-level state helpers and preserving RNG call order.
- [x] Run all combat tests (92 files, 896 tests) before and after extraction. Tighten entry-point and extracted-module budgets. Add a runtime module-cycle regression test.
- [x] Complete full tests, lint, typecheck and production build; review and commit.

## Review evidence

- Compared the 75 original PvE/PvP function bodies with their extracted equivalents: identical.
- Compared the seven original hunt function bodies: identical; transaction and lock order remain unchanged.
- Of the original derivation functions, only `derivePlayerCombatV2Pure` changes its body to call the extracted primary-stat calculation; modifier arithmetic is preserved.
- The weekly fishing-potion limit message is the only intended user-visible behavior correction. No balance, schema, API payload or deployment change is included.
- Further decomposition of long individual skill handlers remains possible, but is deliberately separate from this behavior-preserving module-boundary refactor.

## Final validation (2026-09-06)

- `npm test`: 1,191 files passed, 5 skipped; 9,448 tests passed, 23 skipped; no failures.
- `npm run lint`: exit 0.
- `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit --incremental false`: exit 0 (separate from Next.js, which intentionally skips typechecking during builds).
- `npm run check-module-budgets`: all 22 budgets passed.
- `NODE_OPTIONS=--max-old-space-size=4096 npm run build`: compilation, 612-page generation and postbuild checks passed. No image assets were changed.
- Work remains on the local refactoring branch; no push, merge, deployment or maintenance-mode change.
