# Codex Mastery Catalog and Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Phase B1: immutable production mastery definitions for all six codex categories, a reproducible score-budget report, and a dry-run/apply historical backfill that never double-counts live progress.

**Architecture:** Generate stable mastery entries from the existing authoritative fish, dungeon, equipment, recipe, life-record, and job catalogs. Convert legacy save JSON into absolute per-entry targets in a pure module, then let a transaction-only target-sync service reconcile those targets against locked mastery rows. A paginated CLI owns dry-run/apply orchestration and records a per-user backfill version only after a complete transaction.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM, PostgreSQL, Next.js 16.2 route-compatible server modules, `tsx` operations scripts.

## Global Constraints

- Base branch is `hold/codex-mastery-phase-a-20260820`; work only on `feat/codex-mastery-gameplay-integration-20260820` in `/tmp/test-adventure-codex-mastery-gameplay`.
- Do not merge into the current pending-release branch, deploy, push, run a production migration, enable an operations switch, or execute a real backfill with `--apply`.
- Keep every codex-mastery operations switch defaulted to `false`.
- New mastery stages and seals grant no SP, combat stats, drop rate, gold, or permanent economy output.
- Public entry IDs and score weights are immutable once released; this plan establishes version 1 values.
- Backfill is absolute-target based, idempotent, paginated, dry-run by default only when explicitly passed `--dry-run`, and marks a user complete only after all target writes succeed.
- Gameplay routes are out of B1 scope. B2 connects fish/monster/job, and B3 connects equipment/cooking/life.

---

### Task 1: Generate and validate the six production catalogs

**Files:**
- Create: `src/adventure/data/v2/codexMasteryProductionCatalog.ts`
- Create: `src/adventure/data/v2/codexMasteryProductionCatalog.test.ts`
- Create: `scripts/report-codex-mastery-budget.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `CODEX_MASTERY_CATALOG_VERSION = 1`, `CODEX_MASTERY_DEFINITIONS`, `CODEX_MASTERY_CATALOG`, `CODEX_MASTERY_BUDGET_REPORT`, `CODEX_MASTERY_MONSTER_NAME_TO_ENTRY_ID`.
- Consumes: `FISH_IDS`, `FISH`, `V2_EQUIPMENT`, `COOKING_RECIPES`, `LIFE_FIELD_RECORD_CATALOG`, `V2_JOB_LIST`, and `dungeonThemeCatalog(MAX_FRONTIER_DEPTH)`.

- [ ] **Step 1: Write failing catalog coverage and threshold tests**

Assert exact authoritative-ID coverage for all six categories, exact design thresholds for a representative entry of every profile, deterministic ordering, unique IDs, immutable definitions, and a standard-stage budget within 1% of 10,000 display points per category.

- [ ] **Step 2: Run the production catalog test and verify RED**

Run: `npm test -- src/adventure/data/v2/codexMasteryProductionCatalog.test.ts`

Expected: FAIL because the production catalog module does not exist.

- [ ] **Step 3: Implement generated immutable definitions**

Use stable source IDs without display-name-derived aliases. Calculate one version-1 integer `scoreWeightMilli` per category as:

```ts
Math.round(10_000_000 / (22 * categoryEntryCount))
```

Apply the approved threshold profiles:

```ts
fish: common/uncommon/rare/epic/legendary
monster: normal/elite
equipment: common/set/ultraRare/craftOnly
cooking: normal/advanced/rareIngredient
life: region/environment/normalDiscovery/rareDiscovery
job: { bronze: 50, silver: 250, gold: 1_000, platinum: 2_500, diamond: 5_000, legendary: 10_000 }
```

Catalog seals are declarative only in B1. Include only server-provable candidates such as fish size/night, equipment craft/origin, cooking quality/rare ingredient/order, monster rival, life breadth, and job skills/boss variety; B2/B3 decide when to submit them.

- [ ] **Step 4: Add and test the budget report command**

Add `codex-mastery:budget` to `package.json`, pointing to `tsx scripts/report-codex-mastery-budget.ts`. The script prints version, entry count, milli-points, and rounded display points for all six categories and exits nonzero if a category leaves the 1% budget band.

- [ ] **Step 5: Run focused tests and the budget command**

Run:

```bash
npm test -- src/adventure/data/v2/codexMasteryProductionCatalog.test.ts src/adventure/data/v2/codexMasteryCatalog.test.ts
npm run codex-mastery:budget
```

Expected: PASS; every category reports approximately 10,000 standard-stage points.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/report-codex-mastery-budget.ts src/adventure/data/v2/codexMasteryProductionCatalog.ts src/adventure/data/v2/codexMasteryProductionCatalog.test.ts
git commit -m "feat: generate codex mastery production catalog"
```

### Task 2: Add transaction-safe absolute target synchronization

**Files:**
- Modify: `src/lib/server/codexMasteryService.ts`
- Modify: `src/lib/server/codexMasteryService.test.ts`

**Interfaces:**
- Produces: `CodexMasteryTargetInput` and `syncCodexMasteryTarget(executor, catalog, input, settings, now)`.
- Consumes: existing locked store transition logic and the common internal source `codex.backfill.v1`.

- [ ] **Step 1: Write failing target-sync tests**

Cover a fresh target, a partially recorded target, a target below current count, discovery-only targets, best-value monotonicity, invalid targets, disabled recording, and two repeated sync calls producing no second score delta.

- [ ] **Step 2: Run the service test and verify RED**

Run: `npm test -- src/lib/server/codexMasteryService.test.ts`

Expected: FAIL because `syncCodexMasteryTarget` is not exported.

- [ ] **Step 3: Refactor the locked transition path and implement target sync**

After locking summary and progress, calculate `amount = Math.max(0, targetCount - locked.progress.count)` inside the same transaction. Reuse the existing invariant validation, transition, summary update, and save path. Never read current progress before acquiring the recorder lock.

- [ ] **Step 4: Run service and PostgreSQL-focused tests**

Run:

```bash
npm test -- src/lib/server/codexMasteryService.test.ts src/lib/server/codexMasteryRepository.test.ts
```

Expected: PASS with no changes to the existing additive recorder contract.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/codexMasteryService.ts src/lib/server/codexMasteryService.test.ts
git commit -m "feat: sync codex mastery absolute targets"
```

### Task 3: Derive historical targets from authoritative legacy saves

**Files:**
- Create: `src/lib/server/codexMasteryBackfill.ts`
- Create: `src/lib/server/codexMasteryBackfill.test.ts`

**Interfaces:**
- Produces: `CODEX_MASTERY_BACKFILL_KEY`, `CODEX_MASTERY_BACKFILL_VERSION`, `CodexMasteryBackfillSource`, `CodexMasteryBackfillTarget`, `deriveCodexMasteryBackfillTargets(source)`, and `previewCodexMasteryBackfill(targets, existingProgress, now)`.
- Consumes: production catalog, existing save parsers, `emptyCodexMasteryProgress`, and `applyCodexMasteryMutation`.

- [ ] **Step 1: Write failing source-mapping tests**

Cover fish `totalCaught`/`bestSize`, monster display-name-to-entry mapping, registered equipment discovery only, discovered recipes only, life region/discovery counts, environment discovery without guessed day counts, and tier-1 plus concrete-job `jobCumLevel` values. Corrupt and unknown entries must be ignored, never guessed.

- [ ] **Step 2: Run backfill tests and verify RED**

Run: `npm test -- src/lib/server/codexMasteryBackfill.test.ts`

Expected: FAIL because the backfill module does not exist.

- [ ] **Step 3: Implement pure target derivation and preview**

Targets express absolute counts and reliable discovery/best-value evidence. Deduplicate by `category:entryId`, preserve the greatest target count and best value, and sort in catalog category/entry order. Preview computes only the positive delta from supplied existing progress and returns entry/category/total score and stage counts without writing.

- [ ] **Step 4: Run target derivation tests**

Run: `npm test -- src/lib/server/codexMasteryBackfill.test.ts src/adventure/data/v2/codexMasteryProductionCatalog.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/codexMasteryBackfill.ts src/lib/server/codexMasteryBackfill.test.ts
git commit -m "feat: derive codex mastery backfill targets"
```

### Task 4: Add paginated dry-run/apply backfill operations

**Files:**
- Create: `src/lib/server/codexMasteryBackfillRunner.ts`
- Create: `src/lib/server/codexMasteryBackfillRunner.test.ts`
- Create: `src/lib/server/codexMasteryBackfillCli.ts`
- Create: `src/lib/server/codexMasteryBackfillCli.test.ts`
- Create: `scripts/backfill-codex-mastery.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `listCodexMasteryBackfillUserIds`, `previewCodexMasteryBackfillUser`, `applyCodexMasteryBackfillUser`, CLI parsing/execution, and `codex-mastery:backfill`.
- Consumes: source save rows, current mastery progress, production catalog, absolute target sync, and the per-user backfill marker.

- [ ] **Step 1: Write failing runner tests**

Cover sorted pagination over any source key, dry-run with zero writes, apply in one transaction, marker lock before source reads, marker written last, completed-version skip, retry after rollback, and preservation of progress recorded before backfill.

- [ ] **Step 2: Write failing CLI tests**

Require exactly one of `--dry-run` or `--apply`; allow one `--user=<id>`; reject unknown arguments before dynamic DB import; report users, targets, score delta, skipped, applied, and errors; include the cursor in pagination failures.

- [ ] **Step 3: Run runner and CLI tests and verify RED**

Run: `npm test -- src/lib/server/codexMasteryBackfillRunner.test.ts src/lib/server/codexMasteryBackfillCli.test.ts`

Expected: FAIL because runner and CLI modules do not exist.

- [ ] **Step 4: Implement dry-run and transactional apply**

Dry-run uses ordinary reads and pure preview. Apply opens one database transaction per user, locks `codex-mastery-backfill.v1`, skips completed version 1, locks relevant save keys in a fixed order, syncs every absolute target, then writes `{ version: 1, completedAt }` last. Any failure rolls the whole user transaction back.

- [ ] **Step 5: Implement guarded CLI and package command**

Add `codex-mastery:backfill` pointing to `tsx scripts/backfill-codex-mastery.ts`. The script dynamically imports the database only after argument validation. Never invoke it with `--apply` during this plan.

- [ ] **Step 6: Run dry-run CLI tests and focused suite**

Run:

```bash
npm test -- src/lib/server/codexMasteryBackfill.test.ts src/lib/server/codexMasteryBackfillRunner.test.ts src/lib/server/codexMasteryBackfillCli.test.ts src/lib/server/codexMasteryService.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json scripts/backfill-codex-mastery.ts src/lib/server/codexMasteryBackfillRunner.ts src/lib/server/codexMasteryBackfillRunner.test.ts src/lib/server/codexMasteryBackfillCli.ts src/lib/server/codexMasteryBackfillCli.test.ts
git commit -m "feat: add codex mastery historical backfill"
```

### Task 5: B1 verification and phase isolation audit

**Files:**
- Modify only if verification exposes a B1 defect.

- [ ] **Step 1: Run all codex mastery tests**

Run: `npm test -- src/adventure/data/v2/codexMastery.test.ts src/adventure/data/v2/codexMasteryCatalog.test.ts src/adventure/data/v2/codexMasteryProductionCatalog.test.ts src/db/codexMasterySchema.test.ts src/lib/server/codexMasteryRepository.test.ts src/lib/server/codexMasteryService.test.ts src/lib/server/codexMasteryBackfill.test.ts src/lib/server/codexMasteryBackfillRunner.test.ts src/lib/server/codexMasteryBackfillCli.test.ts src/lib/server/codexMasteryRepair.test.ts src/lib/server/codexMasteryRepairCli.test.ts`

- [ ] **Step 2: Run static and build checks**

Run:

```bash
npx tsc --noEmit
npx eslint package.json scripts/report-codex-mastery-budget.ts scripts/backfill-codex-mastery.ts src/adventure/data/v2/codexMasteryProductionCatalog.ts src/adventure/data/v2/codexMasteryProductionCatalog.test.ts src/lib/server/codexMasteryService.ts src/lib/server/codexMasteryService.test.ts src/lib/server/codexMasteryBackfill.ts src/lib/server/codexMasteryBackfill.test.ts src/lib/server/codexMasteryBackfillRunner.ts src/lib/server/codexMasteryBackfillRunner.test.ts src/lib/server/codexMasteryBackfillCli.ts src/lib/server/codexMasteryBackfillCli.test.ts
npm run codex-mastery:budget
npm run build
```

- [ ] **Step 3: Verify isolation and prohibited actions**

Confirm the branch still descends from `hold/codex-mastery-phase-a-20260820`, is not an ancestor of `fix/life-field-focus-refresh-20260815`, all ops defaults remain false, and no deployment/push/merge/real `--apply` occurred.

- [ ] **Step 4: Commit verification fixes if needed**

Use a focused `fix:` commit only for defects found by the commands above. Leave the Phase B worktree and branch intact.
