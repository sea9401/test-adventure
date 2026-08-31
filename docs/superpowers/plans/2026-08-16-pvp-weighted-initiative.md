# PvP Weighted Initiative Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace position-fixed PvP first turns with a capped speed-weighted draw while retaining ATB speed frequency.

**Architecture:** Add a focused pure initiative module that reuses the compressed ATB action rate. Resolve one initiative winner per battle, inject it into both legacy and ATB state initialization, and make ATB opening actions share tick zero with alternating priority for later exact ties.

**Tech Stack:** TypeScript, Vitest, existing PvP/ATB combat engine

## Global Constraints

- Apply only to PvP; do not change PvE initiative.
- Equal speed must produce exactly 50:50 odds.
- Clamp either side's first-action chance to 35%-65%.
- Tests must inject the draw and remain deterministic.
- Do not deploy.

---

### Task 1: Pure initiative odds and draw

**Files:**
- Create: `src/adventure/v2/combat/pvpInitiative.ts`
- Create: `src/adventure/v2/combat/pvpInitiative.test.ts`

**Interfaces:**
- Produces: `pvpInitiativeChance(p1Spd, p2Spd): number`
- Produces: `pickPvpInitiative(p1Spd, p2Spd, roll): "p1" | "p2"`

- [x] **Step 1: Write failing tests** for equal-speed 50:50, the 35%-65% bounds, and injected rolls selecting either side.
- [x] **Step 2: Run `npm test -- src/adventure/v2/combat/pvpInitiative.test.ts --run`** and confirm failure because the module is absent.
- [x] **Step 3: Implement the minimal pure helper** using `100 + actionRate(spd)` weights and a 0.35-0.65 clamp.
- [x] **Step 4: Re-run the focused test** and confirm it passes.

### Task 2: Integrate the draw into legacy and ATB PvP

**Files:**
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/engine.pvp-atb.ts`
- Modify: `src/adventure/battle/engine-pvp.test.ts`
- Modify: `src/adventure/v2/combat/combatPvpAtb.test.ts`

**Interfaces:**
- Consumes: `pickPvpInitiative`
- Extends: `PvPResolveContext` with `initiativeRoll?: number`
- Extends: `initialBattleStatePvP` with an optional resolved first actor for production resolvers and deterministic mechanics tests.

- [x] **Step 1: Write failing integration tests** proving an injected high roll lets `p2` act first at equal speed in both legacy and ATB, and that ATB begins both schedules at the same tick.
- [x] **Step 2: Run the two focused suites** and confirm failures show the existing `p1`/faster-side priority.
- [x] **Step 3: Resolve initiative once per battle** and pass the selected actor into state initialization with a visible weighted-draw log.
- [x] **Step 4: Start both ATB schedules at tick zero** and alternate priority on subsequent exact-tick collisions.
- [x] **Step 5: Re-run focused tests** and repair only behavior expectations intentionally changed by the approved design.

### Task 3: Regression verification and commit

**Files:**
- Verify all changed files and related callers.

**Interfaces:**
- Consumes: completed Tasks 1-2.
- Produces: one verified local commit; no deployment.

- [x] **Step 1: Run related PvP and ATB suites** including initiative, engine PvP, ATB invariants, and tournament tests.
- [x] **Step 2: Run TypeScript and ESLint checks** for changed code.
- [x] **Step 3: Review `git diff --check` and the complete diff** for unrelated changes or ambiguous behavior.
- [x] **Step 4: Commit only the feature files** with a focused message.
