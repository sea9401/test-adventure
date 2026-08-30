# Game Modularization and Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve game behavior while restoring structural quality gates and reducing global rerenders, marketplace eager work, state-read side effects, and high-risk module coupling.

**Architecture:** Keep public component and API contracts stable while extracting responsibility-focused modules. Introduce narrow React contexts behind a compatibility facade, defer marketplace-only tools, separate state reconciliation from response projection, and split hunt/combat orchestration only along deterministic boundaries.

**Tech Stack:** Next.js 16.2.11, React 19.2.4, TypeScript, Vitest, Drizzle ORM, ESLint, Knip

## Global Constraints

- Do not change combat balance coefficients or RNG call order.
- Do not change API status codes, error codes, response fields, or user-facing copy.
- Do not raise existing module line budgets.
- Do not deploy, push, merge, or change maintenance mode.
- Preserve all unrelated user changes.

---

### Task 1: Restore structural quality gates

**Files:**
- Modify: `src/adventure/v2/V2MarketplaceView.tsx`
- Modify: `src/adventure/v2/GameStateProvider.tsx`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Modify: `src/adventure/v2/V2CodexView.tsx`
- Modify: `src/app/api/v2/me/state/route.ts`
- Create: responsibility-focused sibling modules selected from existing pure helpers and response/UI sections
- Test: `scripts/module-budgets.test.ts`

**Interfaces:**
- Consumes: current exported components, route handlers, combat entry points, and frozen line budgets.
- Produces: the same public exports with every audited module below its current budget.

- [ ] **Step 1: Confirm the existing red gate**

Run: `npm run check-module-budgets`
Expected: FAIL for the six audited modules recorded in the design.

- [ ] **Step 2: Extract one responsibility at a time without changing public contracts**

Move complete pure helpers, state contracts, dialog components, request parsing, batch aggregation, or response projection blocks to sibling modules. Do not split a function merely to hide lines and do not change RNG or transaction order.

- [ ] **Step 3: Verify the focused modules and gate**

Run the closest existing Vitest files for each extraction, followed by `npm run check-module-budgets`.
Expected: focused tests PASS and `MODULE BUDGETS PASS`.

- [ ] **Step 4: Repair the two pre-existing lint errors in the touched quality gate**

Replace the two explicit `any` annotations in `src/app/api/v2/me/use-cash-item/route.test.ts` with the smallest structural test type that describes the mocked transaction.

- [ ] **Step 5: Commit**

```bash
git add src scripts docs/superpowers/specs/2026-08-30-game-modularization-optimization-design.md docs/superpowers/plans/2026-08-30-game-modularization-optimization.md
git commit -m "refactor: restore game module quality gates"
```

### Task 2: Partition global game state subscriptions

**Files:**
- Modify: `src/adventure/v2/GameStateProvider.tsx`
- Create: `src/adventure/v2/GameIdentityContext.tsx`
- Create: `src/adventure/v2/GameResourceContext.tsx`
- Create: `src/adventure/v2/GameActivityContext.tsx`
- Create: `src/adventure/v2/GameWorldContext.tsx`
- Modify: small-field consumers found by `rg "useGameState\\(" src`
- Test: `src/adventure/v2/GameStateProvider.contexts.test.tsx`

**Interfaces:**
- Produces: `useGameIdentityState`, `useGameResourceState`, `useGameActivityState`, and `useGameWorldState`.
- Preserves: `useGameState(): GameStateValue` as a compatibility facade.

- [ ] **Step 1: Write a render-count regression test**

Render identity-only and resource-only probes under the provider. Change gold through the resource action and assert that the identity probe render count does not increase.

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run src/adventure/v2/GameStateProvider.contexts.test.tsx`
Expected: FAIL because narrow contexts do not exist.

- [ ] **Step 3: Add memoized narrow context values and hooks**

Keep setters and callbacks reference-stable. Compose the legacy facade from the same state without nesting a narrow consumer beneath the broad provider.

- [ ] **Step 4: Migrate small consumers**

Start with consumers of only `applyResourcePatch`, only identity fields, and only activity setters. Leave complex screens on the compatibility hook.

- [ ] **Step 5: Verify and commit**

Run the context test, related component tests, TypeScript, and module budgets. Commit as `refactor: partition global game state contexts`.

### Task 3: Defer marketplace tools and eager requests

**Files:**
- Modify: `src/adventure/v2/V2MarketplaceView.tsx`
- Create: `src/adventure/v2/marketplace/MarketplaceAutomationDialogs.tsx`
- Modify: marketplace view tests

**Interfaces:**
- Preserves: `V2MarketplaceView`, preview fixtures, marketplace mutation endpoints, and balance refresh behavior.
- Produces: dynamically imported automation dialogs and demand-driven automation loading.

- [ ] **Step 1: Write request-timing tests**

Assert the browse tab requests listings, equipment, and prices but does not request buy orders or price alerts until the market tools are opened.

- [ ] **Step 2: Verify RED**

Run the focused marketplace test and confirm current eager automation requests cause failure.

- [ ] **Step 3: Extract and dynamically load automation dialogs**

Keep dialog props serializable within the client boundary and preserve all labels and action callbacks.

- [ ] **Step 4: Load automation state on demand**

Fetch orders and alerts when an automation surface opens or the user enters the management tab. Keep the existing visible-tab polling and mutation refresh only while those surfaces need it.

- [ ] **Step 5: Verify and commit**

Run marketplace tests, TypeScript, module budgets, and commit as `perf: defer marketplace automation work`.

### Task 4: Isolate state reconciliation from response projection

**Files:**
- Modify: `src/app/api/v2/me/state/route.ts`
- Create: `src/app/api/v2/me/state/stateReconciliation.ts`
- Create: `src/app/api/v2/me/state/stateResponse.ts`
- Modify: state route tests

**Interfaces:**
- Produces: `reconcileStateReadDependencies(...)` and pure core/full response builders.
- Preserves: GET response bytes at the JSON-value level and all title grant conditions.

- [ ] **Step 1: Add contract tests for core/full responses and side-effect calls**

Cover existing character initialization, skill reconciliation, insomnia/hidden/champion title grants, and absence of full-only reads in core mode.

- [ ] **Step 2: Verify tests RED against the new module interfaces**

Run the focused route tests and confirm missing exports fail.

- [ ] **Step 3: Extract reconciliation and projection**

Keep transaction and await order stable first. Move event-timed grants out of GET only where an existing authoritative mutation already exists; otherwise retain the compatibility call in the reconciliation service.

- [ ] **Step 4: Verify and commit**

Run state tests, TypeScript, module budgets, and commit as `refactor: isolate game state reconciliation`.

### Task 5: Split hunt orchestration and combat result assembly

**Files:**
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Create: `src/app/api/v2/dungeon/hunt/huntBatch.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Create: a focused PvE engine sibling selected from an existing pure phase/result block
- Modify: deterministic hunt and combat tests

**Interfaces:**
- Preserves: `runOneHunt`, route `POST`, lock order, save flush order, replay shape, RNG calls, and combat result shape.
- Produces: a batch accumulator module and a pure combat phase/result helper module.

- [ ] **Step 1: Add or select fixed-seed golden tests**

Record representative PvE wins, losses, status effects, batch rewards, and stop reasons using existing deterministic fixtures.

- [ ] **Step 2: Confirm the structural gate is RED before extraction**

Run module budgets and the selected golden tests. Budgets fail while golden behavior passes.

- [ ] **Step 3: Extract batch aggregation and a pure engine responsibility**

Move code without reordering calls. Keep database access in the route/service layer and all RNG consumption in its original sequence.

- [ ] **Step 4: Verify and commit**

Run deterministic tests, route tests, TypeScript, module budgets, full lint, and the full test suite. Commit as `refactor: split hunt and combat orchestration`.

### Task 6: Final repository verification

**Files:**
- No production changes unless a regression is exposed.

**Interfaces:**
- Produces: fresh verification evidence for the complete local change set.

- [ ] **Step 1: Run static gates**

Run: `npm run check-module-budgets && npm run lint && npx tsc --noEmit`
Expected: all exit 0.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: 0 failed tests.

- [ ] **Step 3: Inspect repository state**

Run: `git status --short --branch && git log -6 --oneline`
Expected: only intended local commits; no push, merge, deploy, or maintenance-mode change.
