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

- [ ] Add hook regression tests for weekly limits, fishing rewards, failed purchase state synchronization and generic fallback.
- [ ] Move fishing-specific messages to `fishingShopMessages.ts`; add optional consumable message policy to `useCoinShop` and wire `useFishingShop`/`useArenaShop`.
- [ ] Run shop tests and commit.

## 2. Marketplace responsibilities

- [ ] Verify the existing requests, layout and codex-filter tests before extraction.
- [ ] Separate listing/auction rendering and price-tool dialogs from `V2MarketplaceView.tsx` into focused marketplace components, preserving props and exports.
- [ ] Isolate typed read requests from React state updates and preserve tab-based lazy loading and refresh behavior.
- [ ] Run marketplace tests and typecheck, then commit.

## 3. Hunt processing

- [ ] Verify existing hunt route, stamina, cooldown, tax, rare-map and unexplored tests.
- [ ] Separate HTTP authentication/rate limiting, single-hunt execution and batch orchestration into modules under the hunt directory.
- [ ] Preserve the shared transaction, batch flush timing and request-scoped in-flight guard.
- [ ] Run hunt/server tests and typecheck, then commit.

## 4. Combat derivation

- [ ] Verify existing derivation tests and combat golden snapshots.
- [ ] Extract pure derivation/types and save interpretation into focused modules, leaving DB fetching in the compatibility entry point.
- [ ] Separate primary stat contributions from final combat conversion at an existing calculation boundary; preserve rounding and modifier order.
- [ ] Run derivation and golden tests and typecheck, then commit.

## 5. Combat engines

- [ ] Establish the existing golden and combat test baseline.
- [ ] Extract PvP state types and shared state operations to remove the engine/phase runtime back edge.
- [ ] Separate PvE/PvP skill-action processing from battle loop orchestration, using explicit lower-level state helpers and preserving RNG call order.
- [ ] Run all combat and downstream server tests. Tighten the module budgets for reduced entry points.
- [ ] Complete full tests, lint, typecheck and production build; review and commit.
