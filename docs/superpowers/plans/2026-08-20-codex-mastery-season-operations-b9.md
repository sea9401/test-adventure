# Codex Research Season Operations B9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a super-admin-only, preview-first operating surface for validating, scheduling, observing, settling, correcting, and publishing monthly codex research seasons without enabling any feature or creating a real season.

**Architecture:** Keep definition summaries in a pure domain module, database reads and state transitions in a focused operations repository, and mutation orchestration in a service with injected runtimes. Expose one authenticated admin route and one isolated admin component inside the existing season tab. Reuse the B8b settlement and trophy award engines inside caller-owned PostgreSQL transactions.

**Tech Stack:** TypeScript, Next.js 16.2 Route Handlers, React, Drizzle ORM, PostgreSQL 16, Vitest, existing admin UI primitives.

## Global Constraints

- Do not deploy, push, merge, activate any feature flag, create a real season, execute a real settlement, or publish real trophies.
- Every POST operation requires `requireAdminRole("super")`; GET requires `requireAdmin()`.
- `settle` and `resettle` require `settlementEnabled`; `award-trophies` also requires `trophiesEnabled`.
- Schedule only a season whose KST calendar-month `startAt` is strictly later than the operation time.
- Resettle only a closed, ended season with zero published `research_season` trophy rows.
- Use exact confirmation strings: `SCHEDULE {seasonId}`, `SETTLE {seasonId}`, `RESETTLE {seasonId}`, and `AWARD {seasonId}`.
- Never add SP, combat stats, gold, items, achievement score, permanent mastery score, cron automation, or economic rewards.
- Preserve opaque light/dark surfaces and do not apply whole-card opacity to disabled admin cards.
- Keep every codex feature default `false`.

---

### Task 1: Pure Definition and Settlement Preview Contracts

**Files:**
- Create: `src/adventure/data/v2/codexResearchOps.ts`
- Create: `src/adventure/data/v2/codexResearchOps.test.ts`

**Interfaces:**
- Consumes: `validateCodexResearchSeasonDefinition`, `kstCodexResearchSeasonWindow`, `codexResearchTierFor`, `CodexResearchDefinitionSnapshot`, and a domain-owned `CodexResearchSettlementPreviewCandidate` value shape. The pure domain module must not import a server-layer candidate type.
- Produces: `CodexResearchDefinitionPreview`, `CodexResearchSettlementPreview`, `previewCodexResearchDefinition(definition, now)`, `buildCodexResearchSettlementPreview(season, candidates)`, and `codexResearchConfirmation(op, seasonId)`.

- [ ] **Step 1: Write failing domain tests**

  Add literal fixtures proving that a valid 18-objective definition returns the exact KST timestamps, 6/6/4/2 group counts and 12,000/5,000/3,000 budgets; an already-started season is rejected for scheduling; settlement preview maps literal ranks to literal tier counts and top-ten rows; confirmation strings are exact.

- [ ] **Step 2: Run the tests and observe RED**

  Run: `npm test -- src/adventure/data/v2/codexResearchOps.test.ts`

  Expected: module or exported functions are missing.

- [ ] **Step 3: Implement the minimal pure contracts**

  `previewCodexResearchDefinition` must clone validated data, reject invalid `now`, call the existing definition validator with the KST window, and return:

  ```ts
  type CodexResearchDefinitionPreview = {
    seasonId: string;
    themeId: string;
    themeName: string;
    version: number;
    startAt: string;
    endAt: string;
    primaryCategories: [CodexMasteryCategory, CodexMasteryCategory];
    supportCategory: CodexMasteryCategory;
    objectiveCount: 18;
    groupCounts: { basic: 6; field: 6; expert: 4; challenge: 2 };
    objectiveScore: 12_000;
    diversityScore: 5_000;
    recordScore: 3_000;
    schedulable: boolean;
  };
  ```

  `buildCodexResearchSettlementPreview` validates contiguous ranks and score bounds independently, applies `codexResearchTierFor`, and returns participant count, six tier counts, untiered count, and top ten `{ userId, rank, score, tier }` entries.

- [ ] **Step 4: Run GREEN and type/lint checks**

  Run: `npm test -- src/adventure/data/v2/codexResearchOps.test.ts`

  Run: `npx tsc --noEmit`

  Run: `npx eslint src/adventure/data/v2/codexResearchOps.ts src/adventure/data/v2/codexResearchOps.test.ts`

- [ ] **Step 5: Commit**

  ```bash
  git add src/adventure/data/v2/codexResearchOps.ts src/adventure/data/v2/codexResearchOps.test.ts
  git commit -m "feat: define codex research operations previews"
  ```

### Task 2: Operations Repository and Closed-Season Correction

**Files:**
- Create: `src/lib/server/codexResearchOpsRepository.ts`
- Create: `src/lib/server/codexResearchOpsRepository.test.ts`
- Modify: `src/lib/server/codexResearchRepository.ts`
- Modify: `src/lib/server/codexResearchRepository.test.ts`

**Interfaces:**
- Consumes: `codexResearchSeasons`, `codexResearchProgress`, `codexTrophyHistory`, existing season row mappers and transaction executor types.
- Produces: `readCodexResearchSeasonForOps(executor, seasonId)`, `readCodexResearchSeasonOpsList(executor, now, limit)`, `countCodexResearchSeasonTrophies(executor, seasonId)`, and `markCodexResearchSeasonResettling(executor, seasonId, now)`.

- [ ] **Step 1: Write failing repository tests**

  Cover a missing season returning `null`; bounded list parsing the database aggregate counts; malformed negative counts throwing; trophy count filtering the exact `research:{seasonId}` and `research_season` kind; resettling changing only `closed` to `settling`, clearing `settledAt`, and requiring exactly one updated row.

- [ ] **Step 2: Run repository tests and observe RED**

  Run: `npm test -- src/lib/server/codexResearchOpsRepository.test.ts src/lib/server/codexResearchRepository.test.ts`

  Expected: new exports are missing.

- [ ] **Step 3: Implement repository reads and transition**

  Use one SQL aggregate query for the recent-season list. Each row must include `progress_count`, `scored_count`, `final_rank_count`, six final-tier counts, and `trophy_count`. Pass `now` explicitly so tests and the route share deterministic state classification. Derive operational state as follows:

  ```ts
  type CodexResearchSeasonOpsState =
    | "ready"
    | "too_early"
    | "closed"
    | "inconsistent";
  ```

  A closed season with scored rows but no final ranks, or more trophies than tiered final rows, is `inconsistent`. Scheduled/active seasons before `endAt` are `too_early`; ended nonclosed seasons are `ready`; otherwise closed seasons are `closed`.

- [ ] **Step 4: Run GREEN and static checks**

  Run: `npm test -- src/lib/server/codexResearchOpsRepository.test.ts src/lib/server/codexResearchRepository.test.ts`

  Run: `npx tsc --noEmit`

  Run: `npx eslint src/lib/server/codexResearchOpsRepository.ts src/lib/server/codexResearchOpsRepository.test.ts src/lib/server/codexResearchRepository.ts src/lib/server/codexResearchRepository.test.ts`

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/server/codexResearchOpsRepository.ts src/lib/server/codexResearchOpsRepository.test.ts src/lib/server/codexResearchRepository.ts src/lib/server/codexResearchRepository.test.ts
  git commit -m "feat: observe codex research season operations"
  ```

### Task 3: Preview, Schedule, Settle, Resettle, and Trophy Operations Service

**Files:**
- Create: `src/lib/server/codexResearchOps.ts`
- Create: `src/lib/server/codexResearchOps.test.ts`
- Modify: `src/lib/server/codexResearchSettlement.ts`
- Modify: `src/lib/server/codexResearchSettlement.test.ts`

**Interfaces:**
- Consumes: Task 1 previews, Task 2 repository, `readCodexResearchSettlementCandidates`, `settleCodexResearchSeason`, `awardCodexResearchSeasonTrophies`, `scheduleCodexResearchSeason`.
- Produces: `previewCodexResearchSettlementForOps`, `scheduleCodexResearchSeasonForOps`, `resettleCodexResearchSeason`, and `CodexResearchOpsError` with stable `code` and HTTP `status`.

- [ ] **Step 1: Write failing service tests**

  Prove preview does not write; schedule rejects `startAt <= now`; settle preview uses the B8b candidate order; resettle rejects open seasons and published trophies before marking state; valid resettle performs lock → trophy count → mark resettling → candidates → rewrite finals → close; runtime failures leave transaction rollback to the caller.

- [ ] **Step 2: Run service tests and observe RED**

  Run: `npm test -- src/lib/server/codexResearchOps.test.ts src/lib/server/codexResearchSettlement.test.ts`

  Expected: operations service is missing.

- [ ] **Step 3: Generalize only the read-only candidate executor**

  Change `readCodexResearchSettlementCandidates` to consume `Pick<DbExecutor, "execute">` so dry-run previews can use the global executor while the settlement runtime still supplies a transaction executor. Do not widen any mutating function.

- [ ] **Step 4: Implement operation services**

  `scheduleCodexResearchSeasonForOps` validates and checks `preview.schedulable` immediately before calling the existing schedule repository in a transaction. `resettleCodexResearchSeason` locks first and reads trophy count while holding the same season row lock. It calls the existing result writer and close transition with a new `now` only after all guards and candidate validation pass.

- [ ] **Step 5: Run GREEN and adjacent tests**

  Run: `npm test -- src/lib/server/codexResearchOps.test.ts src/lib/server/codexResearchSettlement.test.ts src/lib/server/codexResearchTrophies.test.ts`

  Run: `npx tsc --noEmit`

  Run: `npx eslint src/lib/server/codexResearchOps.ts src/lib/server/codexResearchOps.test.ts src/lib/server/codexResearchSettlement.ts src/lib/server/codexResearchSettlement.test.ts`

- [ ] **Step 6: Commit**

  ```bash
  git add src/lib/server/codexResearchOps.ts src/lib/server/codexResearchOps.test.ts src/lib/server/codexResearchSettlement.ts src/lib/server/codexResearchSettlement.test.ts
  git commit -m "feat: orchestrate codex research season operations"
  ```

### Task 4: Super-Admin Operations API and Audit Trail

**Files:**
- Create: `src/app/api/admin/codex-research-seasons/route.ts`
- Create: `src/app/api/admin/codex-research-seasons/route.test.ts`
- Modify: `src/admin/displayLabels.ts`

**Interfaces:**
- Consumes: Tasks 1–3, `readCodexMasteryFeatureSettings`, `getAdminEmailsList`, `requireAdmin`, `requireAdminRole`, `currentAdminEmail`, `logAdminAction`, global `db.transaction`.
- Produces: authenticated GET and explicit POST operation envelopes from the B9 design.

- [ ] **Step 1: Write failing route tests**

  Cover GET admin gate; POST super gate; inherited/unknown operation rejection; validate with no writes; schedule confirmation mismatch; settlement flag early return with no engine call; trophy flag early return; success envelopes; errors mapped from `CodexResearchOpsError`; successful and failed POST audits containing only operation, season ID, status, and counts.

- [ ] **Step 2: Run route tests and observe RED**

  Run: `npm test -- src/app/api/admin/codex-research-seasons/route.test.ts`

  Expected: route is missing.

- [ ] **Step 3: Implement GET and POST**

  Parse bodies with own-property checks. Run `validate` and `preview-settlement` without confirmations but still behind the super POST gate. Run all mutations in `db.transaction`. Audit every POST attempt, including read-only previews, without definition JSON or user rows. Return stable errors without echoing the submitted definition or user list.

- [ ] **Step 4: Add audit display labels**

  Map `codex-research.validate`, `.schedule`, `.preview-settlement`, `.settle`, `.resettle`, and `.award-trophies` to concise Korean labels. The audit detail contains no definition JSON and no top-ten preview rows.

- [ ] **Step 5: Run GREEN and static checks**

  Run: `npm test -- src/app/api/admin/codex-research-seasons/route.test.ts src/app/api/admin/ops-settings/route.test.ts`

  Run: `npx tsc --noEmit`

  Run: `npx eslint src/app/api/admin/codex-research-seasons/route.ts src/app/api/admin/codex-research-seasons/route.test.ts src/admin/displayLabels.ts`

- [ ] **Step 6: Commit**

  ```bash
  git add src/app/api/admin/codex-research-seasons src/admin/displayLabels.ts
  git commit -m "feat: expose codex research season operations"
  ```

### Task 5: Admin Season Operations UI

**Files:**
- Create: `src/admin/tabs/CodexResearchSeasonOps.tsx`
- Create: `src/admin/tabs/CodexResearchSeasonOps.test.tsx`
- Modify: `src/admin/tabs/SeasonOpsTab.tsx`

**Interfaces:**
- Consumes: Task 4 envelopes, `adminGet`, `adminPost`, `DangerAction`, existing admin read-only context.
- Produces: definition editor, validation summary, recent season table, settlement preview, and guarded mutation controls.

- [ ] **Step 1: Write failing component tests**

  Render with injected preview data and assert opaque surfaces, Korean status labels, exact confirmation hints, no mutation controls in read-only mode, validation summaries with 18 and 20,000 total points, and inconsistent-state warning. Assert JSON parsing errors remain client-local and do not call fetch.

- [ ] **Step 2: Run component tests and observe RED**

  Run: `npm test -- src/admin/tabs/CodexResearchSeasonOps.test.tsx`

  Expected: component is missing.

- [ ] **Step 3: Implement the isolated component**

  Accept optional `previewData` for real SSR tests without mocking React. In production, load GET on mount. Keep the editor empty by default so no accidental real definition ships. Store validation result separately and clear it whenever text changes. Use `DangerAction` for schedule, settle, resettle, and award operations.

- [ ] **Step 4: Attach it to `SeasonOpsTab`**

  Render `<CodexResearchSeasonOps />` after existing arena and fishing operations. Do not change the behavior of existing operations.

- [ ] **Step 5: Run GREEN and UI regression checks**

  Run: `npm test -- src/admin/tabs/CodexResearchSeasonOps.test.tsx src/admin/tabs/BroadcastTab.test.tsx`

  Run: `npx tsc --noEmit`

  Run: `npx eslint src/admin/tabs/CodexResearchSeasonOps.tsx src/admin/tabs/CodexResearchSeasonOps.test.tsx src/admin/tabs/SeasonOpsTab.tsx`

- [ ] **Step 6: Commit**

  ```bash
  git add src/admin/tabs/CodexResearchSeasonOps.tsx src/admin/tabs/CodexResearchSeasonOps.test.tsx src/admin/tabs/SeasonOpsTab.tsx
  git commit -m "feat: add codex research admin operations"
  ```

### Task 6: PostgreSQL Integration and B9 Verification

**Files:**
- Modify: `src/lib/server/codexMasteryPostgres.test.ts`

**Interfaces:**
- Consumes: all B9 services and existing temporary PostgreSQL harness.
- Produces: end-to-end evidence for schedule, preview, settlement, correction guard, award, and aggregate observability.

- [ ] **Step 1: Add integration assertions**

  In the temporary schema, schedule a future fixture, list it with zero counts, settle an ended fixture, verify the aggregate counts, resettle before trophies, award trophies, then assert resettle rejects with `trophies_already_published`. Ensure a forced outer transaction failure rolls back a resettle transition and final rows.

- [ ] **Step 2: Run the PostgreSQL test**

  Start a disposable PostgreSQL 16 cluster under `/tmp`, set `CODEX_MASTERY_POSTGRES_TEST_DATABASE_URL`, and run:

  `npm test -- src/lib/server/codexMasteryPostgres.test.ts`

  Stop PostgreSQL and remove only the created temporary directory.

- [ ] **Step 3: Run focused B9 regression and static checks**

  Run all new B9 tests plus B8 settlement/trophy/repository/admin tests, `npx tsc --noEmit`, focused ESLint, `npm run check-migrations`, and `npm run check-images`.

- [ ] **Step 4: Run full verification**

  Run: `npm test`

  Run: `npm run build`

- [ ] **Step 5: Audit isolation and defaults**

  Confirm the worktree is clean, all codex feature defaults are `false`, no deployment/cron/real season file changed, and neither the foundation nor gameplay branch is in the deployment branch.

- [ ] **Step 6: Commit integration coverage if changed**

  ```bash
  git add src/lib/server/codexMasteryPostgres.test.ts
  git commit -m "test: verify codex research operations in postgres"
  ```
