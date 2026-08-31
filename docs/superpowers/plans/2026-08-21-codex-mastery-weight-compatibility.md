# Codex Mastery Weight Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve published v1 codex mastery scores when catalog entries are added and self-heal the short-lived tier-7 job weight.

**Architecture:** Freeze v1 score denominators in the production catalog. Definitions may list narrowly scoped compatible historical weights; the recorder normalizes only those recognized scores and adjusts the locked summary in the same transaction before applying gameplay progress.

**Tech Stack:** TypeScript, Vitest, Drizzle-backed codex mastery service

## Global Constraints

- Preserve existing 3,392-weight job scores.
- Do not weaken validation for unregistered score mismatches.
- Do not deploy or mutate production data in this task.

---

### Task 1: Reproduce the production score failure

**Files:**
- Modify: `src/lib/server/codexMasteryService.test.ts`

**Interfaces:**
- Consumes: `createCodexMasteryRecorder`, production job catalog definition
- Produces: regression coverage for persisted job score 74,624

- [x] Add a test using the real production catalog and a legendary job progress row scored with v1 weight 3,392.
- [x] Run the single test and confirm it fails with `codex mastery locked progress score is inconsistent`.

### Task 2: Freeze v1 weights and normalize compatible rows

**Files:**
- Modify: `src/adventure/data/v2/codexMasteryTypes.ts`
- Modify: `src/adventure/data/v2/codexMastery.ts`
- Modify: `src/adventure/data/v2/codexMasteryCatalog.ts`
- Modify: `src/adventure/data/v2/codexMasteryProductionCatalog.ts`
- Modify: `src/lib/server/codexMasteryService.ts`
- Modify: `src/lib/server/codexMasteryService.test.ts`
- Modify: `src/adventure/data/v2/codexMasteryProductionCatalog.test.ts`

**Interfaces:**
- Consumes: locked progress and summary from `CodexMasteryStore.lock`
- Produces: optional `compatibleScoreWeightsMilli`, frozen v1 weights, atomic score normalization

- [x] Add a failing service test proving a registered compatible weight updates progress and summary together.
- [x] Validate and freeze compatible weights in catalog definitions.
- [x] Replace live source-count scoring with v1 baseline counts `{ equipment: 351, fish: 50, monster: 70, cooking: 45, life: 36, job: 134 }` and register job weight 3,294 as compatible.
- [x] Normalize recognized compatible scores before applying the requested mutation; leave all other mismatch checks fail-closed.
- [x] Run targeted service and catalog tests until green.

### Task 3: Verify and commit

**Files:**
- Verify all modified source, tests, and documents

**Interfaces:**
- Consumes: completed implementation
- Produces: clean committed branch

- [x] Run typecheck, lint, focused tests, full test suite, production build, release checks, and secret checks.
- [x] Review the diff for unrelated changes and secret leakage.
- [ ] Commit the verified fix on `fix/codex-mastery-job-weight-20260821`.
