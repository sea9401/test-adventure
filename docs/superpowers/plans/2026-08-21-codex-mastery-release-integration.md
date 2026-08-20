# Codex Mastery Release Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the complete held codex mastery feature train on the latest `origin/main` while importing no unrelated undeployed work and leaving every production feature switch disabled.

**Architecture:** Replay only the linear codex mastery commit ranges from the preserved Phase A and gameplay-integration branches into the isolated release-candidate worktree. Validate each dependency layer before moving forward, resolve conflicts in favor of current `main` plus the narrow codex contract, and finish with PostgreSQL, migration, release-surface, build, full-suite, and bidirectional scope audits.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Drizzle ORM, PostgreSQL 16, Tailwind CSS, ESLint, npm.

## Global Constraints

- Work only in `/tmp/test-adventure-codex-mastery-release-20260821` on `codex-mastery-release-20260821`.
- The integration base is the latest fetched `origin/main`; rebase the design commit before replay if `origin/main` has advanced.
- Do not merge or rebase either preserved source branch wholesale.
- Include only codex mastery Phase A through B10; exclude every other session's missing-feature or regression work.
- Preserve the source dependency order and source tests.
- Keep `recordingEnabled`, `overviewVisible`, `rankingVisible`, `sealsEnabled`, `trophiesEnabled`, `monthlyProgressEnabled`, `monthlyRankingVisible`, `settlementEnabled`, and `feedEnabled` defaulted to `false`.
- Do not add production codex cron jobs or production season definitions.
- Do not deploy, push, open a PR, run an operating-production backfill, change a production feature flag, or change maintenance mode.
- Before modifying App Router routes or React server/client boundaries during conflict resolution, read the installed Next.js guides in `node_modules/next/dist/docs/`.
- Existing source commits are already regression-tested; pure replay does not restart TDD. If conflict resolution changes behavior beyond the source patch, add a failing regression test before the resolution.
- Use `apply_patch` for manual file edits and preserve all unrelated work.

---

## File and dependency map

The implementation is split into reviewable dependency layers:

- Foundation: `src/adventure/data/v2/codexMastery*.ts`, `src/lib/server/codexMastery{Repository,Service,Repair}*.ts`, `src/db/schema.ts`, `drizzle/0171_codex_mastery_foundation.sql`, and codex feature settings in `src/lib/server/opsSettings.ts`.
- Production catalog and backfill: `src/adventure/data/v2/codexMasteryProductionCatalog*.ts`, `src/lib/server/codexMasteryBackfill*.ts`, and `scripts/{backfill-codex-mastery,report-codex-mastery-budget}.ts`.
- Recording connections: existing server-authoritative fishing, hunting, cooking, farming, mining, woodcutting, guild, co-op, storm expedition, mastery item, offline settlement, and life-field routes plus `src/lib/server/codexMasteryGameplay*.ts`.
- Read UI: `src/lib/server/codexMastery{Snapshot,Pins}*.ts`, `src/app/api/v2/me/codex-mastery/route.ts`, `src/adventure/v2/CodexMasteryPanel.tsx`, and `src/adventure/v2/V2CodexView.tsx`.
- Permanent ranking: `src/lib/server/codexMasteryRanking*.ts`, `src/app/api/rankings/codex-mastery/route.ts`, and `src/adventure/rankings/CodexMasteryRankingPanel.tsx`.
- Trophies and housing: `src/adventure/data/v2/codexMasteryTrophies*.ts`, `src/lib/server/codexMasteryTrophy*.ts`, profile showcase files, housing files, and `drizzle/0172_codex_mastery_trophy_history.sql`.
- Monthly research: `src/adventure/data/v2/codexResearch*.ts`, `src/lib/server/codexResearch*.ts`, monthly ranking/archive API and UI files, admin season operations, and migrations `0171` through `0173`.
- Release boundary: `scripts/check-codex-mastery-release.mjs`, `src/lib/server/codexMasteryReleaseCheck.test.ts`, and `docs/operations/codex-mastery-launch-runbook.md`.

### Task 1: Refresh and certify the isolated baseline

**Files:**
- Existing: `docs/superpowers/specs/2026-08-21-codex-mastery-release-integration-design.md`
- Existing: `docs/superpowers/plans/2026-08-21-codex-mastery-release-integration.md`
- Read: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- Read: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`

**Interfaces:**
- Consumes: clean `origin/main`, source commits `0d1e66f55`, `69ad0c7b5..fea3aa2ee`, and `f7b20a57e..ad43a86b2`.
- Produces: a clean, current baseline with dependencies available and no source feature code yet.

- [ ] **Step 1: Confirm the worktree contains only the approved documentation commits**

Run:

```bash
git status --short --branch
git log --oneline origin/main..HEAD
```

Expected: clean status and only the design/plan documentation commits ahead of `origin/main`.

- [ ] **Step 2: Refresh the remote base without changing any production state**

Run:

```bash
git fetch origin main
git rev-parse origin/main
git merge-base origin/main HEAD
```

Expected: both hashes are recorded. If the merge base is not the current `origin/main`, rebase only the local documentation commits with `git rebase origin/main`, then repeat the checks.

- [ ] **Step 3: Attach the repository's installed dependencies**

Run:

```bash
ln -s /home/sea9401/test-adventure/node_modules node_modules
npm --version
```

Expected: `node_modules` is an untracked ignored symlink and npm exits successfully. Do not run `npm install` unless the package manifests later prove incompatible.

- [ ] **Step 4: Read the installed Next.js routing and component-boundary guides**

Run:

```bash
sed -n '1,260p' node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
sed -n '1,260p' node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
```

Expected: current-version route handler, caching, request, and client/server boundary rules are understood before resolving route or component conflicts.

- [ ] **Step 5: Verify both source ranges are linear and contain no merge commits**

Run:

```bash
git rev-list --count 69ad0c7b5^..fea3aa2ee
git rev-list --merges 69ad0c7b5^..fea3aa2ee
git rev-list --count fea3aa2ee..ad43a86b2
git rev-list --merges fea3aa2ee..ad43a86b2
```

Expected: counts `20` and `98`; both merge-commit queries print nothing.

### Task 2: Replay the Phase A foundation

**Files:**
- Create: `src/adventure/data/v2/codexMastery.ts`
- Create: `src/adventure/data/v2/codexMasteryCatalog.ts`
- Create: `src/adventure/data/v2/codexMasteryTypes.ts`
- Create: `src/lib/server/codexMasteryRepository.ts`
- Create: `src/lib/server/codexMasteryService.ts`
- Create: `src/lib/server/codexMasteryRepair.ts`
- Create: `src/lib/server/codexMasteryRepairCli.ts`
- Create: `scripts/repair-codex-mastery-summary.ts`
- Create: `drizzle/0171_codex_mastery_foundation.sql`
- Create: `drizzle/meta/0171_snapshot.json`
- Modify: `src/db/schema.ts`
- Modify: `src/lib/server/opsSettings.ts`
- Modify: `src/app/api/admin/ops-settings/route.ts`
- Modify: `src/lib/server/savesKv.ts`
- Modify: `scripts/reset-game-progress-plan.mjs`
- Modify: `scripts/reset-game-progress.mjs`
- Modify: `drizzle/meta/_journal.json`
- Modify: `package.json`
- Test: matching `*.test.ts` files under the paths above plus `src/db/codexMasterySchema.test.ts` and `src/db/resetGameProgressPlan.test.ts`

**Interfaces:**
- Consumes: current DB/user storage and `DbExecutor`/transaction patterns.
- Produces: `CodexMasteryCatalog`, persistent progress/summary rows, transactional `recordCodexMastery`, repair operations, and nine disabled feature switches.

- [ ] **Step 1: Replay only the approved Phase A documentation and linear foundation range**

Run:

```bash
git cherry-pick 0d1e66f55
git cherry-pick 69ad0c7b5^..fea3aa2ee
```

Expected: 21 codex-only commits apply. On any conflict, stop; inspect `git diff --name-only --diff-filter=U` and resolve only the codex hunk against current `main`.

- [ ] **Step 2: Verify feature defaults and migration order immediately**

Run:

```bash
rg -n -A 14 'DEFAULT_CODEX_MASTERY_FEATURES' src/lib/server/opsSettings.ts
npm run check-migrations
```

Expected: all nine flags are `false`; migration check passes with `0169` after the current main migration tip.

- [ ] **Step 3: Run the Phase A focused tests**

Run:

```bash
npm test -- src/adventure/data/v2/codexMastery.test.ts src/adventure/data/v2/codexMasteryCatalog.test.ts src/db/codexMasterySchema.test.ts src/db/resetGameProgressPlan.test.ts src/lib/server/codexMasteryRepository.test.ts src/lib/server/codexMasteryService.test.ts src/lib/server/codexMasteryRepair.test.ts src/lib/server/codexMasteryRepairCli.test.ts src/app/api/admin/ops-settings/route.test.ts src/lib/server/opsSettingsActive.test.ts
```

Expected: all selected files pass with no skipped codex unit tests.

- [ ] **Step 4: Confirm the replay left a clean checkpoint**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and no uncommitted tracked changes; cherry-picked commits are the checkpoint.

### Task 3: Replay the production catalog and historical backfill

**Files:**
- Create: `src/adventure/data/v2/codexMasteryProductionCatalog.ts`
- Create: `src/lib/server/codexMasteryBackfill.ts`
- Create: `src/lib/server/codexMasteryBackfillCli.ts`
- Create: `src/lib/server/codexMasteryBackfillRunner.ts`
- Create: `scripts/backfill-codex-mastery.ts`
- Create: `scripts/report-codex-mastery-budget.ts`
- Modify: `src/lib/server/codexMasteryService.ts`
- Modify: `package.json`
- Test: corresponding catalog, service, backfill, CLI, and runner `*.test.ts` files.

**Interfaces:**
- Consumes: Phase A catalog, progress repository, `syncCodexMasteryTarget`, and legacy save keys.
- Produces: immutable production catalog version 1, budget report, dry/apply backfill CLI, per-user marker `codex-mastery-backfill.v1`, and idempotent absolute target synchronization.

- [ ] **Step 1: Replay the catalog/backfill range**

Run:

```bash
git cherry-pick f7b20a57e^..41bdd65d2
```

Expected: six commits apply in source order.

- [ ] **Step 2: Run the catalog and backfill focused tests**

Run:

```bash
npm test -- src/adventure/data/v2/codexMasteryProductionCatalog.test.ts src/lib/server/codexMasteryBackfill.test.ts src/lib/server/codexMasteryBackfillCli.test.ts src/lib/server/codexMasteryBackfillRunner.test.ts src/lib/server/codexMasteryService.test.ts
```

Expected: all tests pass, including dry/apply separation, marker idempotency, progress-only users, and absolute target behavior.

- [ ] **Step 3: Verify the score budget and checkpoint**

Run:

```bash
npm run codex-mastery:budget
git diff --check
git status --short
```

Expected: six category budgets are printed near their fixed targets and the worktree is clean.

### Task 4: Replay server-authoritative gameplay recording (B2)

**Files:**
- Create: `src/lib/server/codexMasteryGameplay.ts`
- Modify: `src/app/api/v2/cooking/route.ts`
- Modify: `src/app/api/v2/dungeon/hunt/huntProficiency.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Modify: `src/app/api/v2/farm/harvest/route.ts`
- Modify: `src/app/api/v2/fishing/reel/route.ts`
- Modify: `src/app/api/v2/guild/training-ground/route.ts`
- Modify: `src/app/api/v2/mastery-tower/use-certificate/route.ts`
- Modify: `src/app/api/v2/me/offline-settle/route.ts`
- Modify: `src/app/api/v2/me/use-coop-mastery-tome/route.ts`
- Modify: `src/app/api/v2/mining/auto/route.ts`
- Modify: `src/app/api/v2/mining/strike/route.ts`
- Modify: `src/app/api/v2/woodcutting/auto/route.ts`
- Modify: `src/app/api/v2/woodcutting/chop/route.ts`
- Modify: server helper/test files named in commit range `e714906cd^..3f514403d`.

**Interfaces:**
- Consumes: `recordCodexMasteryGameplayBatch`, production catalog lookup, and existing authoritative activity results.
- Produces: one normalized codex event per eligible confirmed activity, with documented exclusions and no recording while the flag is disabled.

- [ ] **Step 1: Replay B2**

Run:

```bash
git cherry-pick e714906cd^..3f514403d
```

Expected: seven gameplay-integration commits apply without importing unrelated gameplay features.

- [ ] **Step 2: Run B2 route and service tests**

Run:

```bash
npm test -- src/lib/server/codexMasteryGameplay.test.ts src/lib/server/codexMasteryService.test.ts src/app/api/v2/cooking/route.test.ts src/app/api/v2/dungeon/hunt/huntProficiency.test.ts src/lib/server/dangerousFishingRoute.test.ts src/lib/server/farmHarvestRoute.test.ts src/lib/server/fishingReelRoute.test.ts src/lib/server/guildTrainingCodexMasteryRoute.test.ts src/lib/server/huntRoute.test.ts src/lib/server/masteryCertificateRoute.test.ts src/lib/server/miningRoute.test.ts src/lib/server/offlineSettle.test.ts src/lib/server/useCoopMasteryTomeRoute.test.ts src/lib/server/woodcuttingRoute.test.ts
```

Expected: all selected tests pass and disabled recording remains a no-op.

- [ ] **Step 3: Verify no client-supplied value became authoritative**

Run:

```bash
git diff 41bdd65d2..HEAD -- src/app/api/v2 src/lib/server/codexMasteryGameplay.ts
```

Expected: codex counts are derived only after existing server-side success paths; request bodies do not directly grant counts, scores, seals, or trophies.

### Task 5: Replay the remaining content connections (B3)

**Files:**
- Modify: `src/app/api/v2/cooking/route.ts`
- Modify: `src/app/api/v2/coop/claim/route.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Modify: `src/app/api/v2/guild/workshop/route.ts`
- Modify: `src/app/api/v2/me/use-coop-equipment-box/route.ts`
- Modify: `src/app/api/v2/storm-expedition/route.ts`
- Modify: `src/lib/server/codexMasteryGameplay.ts`
- Modify: `src/lib/server/lifeFieldProgress.ts`
- Test: `src/lib/server/{codexMasteryGameplay,coopClaimCodexMasteryRoute,fishingReelRoute,guildWorkshopCodexMasteryRoute,huntRoute,lifeFieldProgress,stormExpeditionRoute,useCoopEquipmentBoxRoute}.test.ts`

**Interfaces:**
- Consumes: B2 normalized recorder and existing reward/drop results.
- Produces: life-field, cooking, equipment-drop, reward-box, workshop, co-op, and storm-expedition mastery events without counting transfers or failed rewards.

- [ ] **Step 1: Replay B3**

Run:

```bash
git cherry-pick 5211e83cf^..35cb56c65
```

Expected: six content-connection commits apply.

- [ ] **Step 2: Run B3 focused tests**

Run:

```bash
npm test -- src/lib/server/codexMasteryGameplay.test.ts src/lib/server/coopClaimCodexMasteryRoute.test.ts src/lib/server/fishingReelRoute.test.ts src/lib/server/guildWorkshopCodexMasteryRoute.test.ts src/lib/server/huntRoute.test.ts src/lib/server/lifeFieldProgress.test.ts src/lib/server/stormExpeditionRoute.test.ts src/lib/server/useCoopEquipmentBoxRoute.test.ts src/app/api/v2/cooking/route.test.ts
```

Expected: all tests pass, including batch quantities and duplicate/reward-failure exclusions.

### Task 6: Replay the gated adventure-book UI (B4)

**Files:**
- Create: `src/adventure/data/v2/codexMasteryView.ts`
- Create: `src/adventure/v2/CodexMasteryPanel.tsx`
- Create: `src/app/api/v2/me/codex-mastery/route.ts`
- Create: `src/lib/server/codexMasteryPins.ts`
- Create: `src/lib/server/codexMasterySnapshot.ts`
- Modify: `src/adventure/v2/V2CodexView.tsx`
- Modify: `src/lib/server/codexMasteryRepository.ts`
- Modify: `src/lib/server/opsSettings.ts`
- Modify: `src/app/api/admin/ops-settings/route.ts`
- Test: the corresponding route, panel, view, pin, repository, snapshot, and ops-setting tests.

**Interfaces:**
- Consumes: catalog, progress summaries, feature settings, and authenticated user ID.
- Produces: gated personal overview API, paginated/filterable mastery panel, recent promotions, and up to five pinned targets.

- [ ] **Step 1: Replay B4**

Run:

```bash
git cherry-pick 91b86e0ce^..403417d12
```

Expected: nine UI/read-model commits apply.

- [ ] **Step 2: Confirm UI surface rules**

Run:

```bash
rg -n 'SURFACE_(CARD|INSET|ACCENT|FROSTED)' src/adventure/v2/CodexMasteryPanel.tsx src/adventure/v2/V2CodexView.tsx
rg -n 'opacity-' src/adventure/v2/CodexMasteryPanel.tsx
```

Expected: content cards use shared opaque surfaces; no locked card relies on container-wide opacity.

- [ ] **Step 3: Run B4 focused tests**

Run:

```bash
npm test -- src/adventure/v2/CodexMasteryPanel.test.tsx src/adventure/v2/V2CodexView.test.ts src/app/api/v2/me/codex-mastery/route.test.ts src/lib/server/codexMasteryPins.test.ts src/lib/server/codexMasteryRepository.test.ts src/lib/server/codexMasterySnapshot.test.ts src/app/api/admin/ops-settings/route.test.ts src/lib/server/opsSettingsActive.test.ts
```

Expected: all tests pass and both the route and tab are hidden while `overviewVisible` is false.

### Task 7: Replay permanent rankings (B5)

**Files:**
- Create: `src/adventure/data/v2/codexMasteryRanking.ts`
- Create: `src/adventure/rankings/CodexMasteryRankingPanel.tsx`
- Create: `src/adventure/rankings/useCodexMasteryRanking.ts`
- Create: `src/app/api/rankings/codex-mastery/route.ts`
- Create: `src/lib/server/codexMasteryRanking.ts`
- Modify: `src/adventure/rankings/RankingsView.tsx`
- Test: corresponding ranking component, hook, route, server, and integration tests plus `src/adventure/data/v2/museunCosmetics.test.ts`.

**Interfaces:**
- Consumes: codex summary rows, viewer block list, admin/banned eligibility, and `rankingVisible`.
- Produces: overall and six category rankings, stable tie-breaks, top 50, and viewer-nearby rows.

- [ ] **Step 1: Replay B5**

Run:

```bash
git cherry-pick 9d583d810^..898c8afe0
```

Expected: nine permanent-ranking commits apply.

- [ ] **Step 2: Run B5 focused tests**

Run:

```bash
npm test -- src/adventure/data/v2/museunCosmetics.test.ts src/adventure/rankings/CodexMasteryRankingPanel.test.tsx src/adventure/rankings/RankingsView.test.tsx src/adventure/rankings/useCodexMasteryRanking.test.ts src/app/api/rankings/codex-mastery/route.test.ts src/lib/server/codexMasteryRanking.test.ts
```

Expected: all unit/UI/API tests pass; the PostgreSQL integration test remains reserved for Task 14.

### Task 8: Replay growing trophies and profile display (B6)

**Files:**
- Create: `drizzle/0172_codex_mastery_trophy_history.sql`
- Create: `drizzle/meta/0172_snapshot.json`
- Create: `src/adventure/data/v2/codexMasteryTrophies.ts`
- Create: `src/lib/server/codexMasteryTrophyRepository.ts`
- Create: `src/lib/server/codexMasteryTrophyRebuild.ts`
- Create: `src/lib/server/codexMasteryTrophyRebuildCli.ts`
- Create: `src/lib/server/codexMasteryTrophyView.ts`
- Create: `scripts/rebuild-codex-mastery-trophies.ts`
- Modify: `src/adventure/profile/profileShowcase.ts`
- Modify: `src/adventure/v2/ProfileBadgeRack.tsx`
- Modify: `src/adventure/v2/V2AdventureHome.tsx`
- Modify: `src/adventure/v2/V2CharacterCard.tsx`
- Modify: `src/adventure/v2/V2CharacterScreen.tsx`
- Modify: `src/adventure/v2/V2TrophyCabinetView.tsx`
- Modify: profile/state routes, reset plan, schema, service, repository, and journal files in range `797752eda^..49504ba57`.

**Interfaces:**
- Consumes: mastery summaries, promotion history, feature settings, and existing profile showcase slots.
- Produces: bronze through legendary growing trophies, immutable trophy history, idempotent rebuild, year filtering, and stable `masteryTrophy` showcase IDs.

- [ ] **Step 1: Replay B6**

Run:

```bash
git cherry-pick 797752eda^..49504ba57
```

Expected: 13 trophy/profile commits apply.

- [ ] **Step 2: Check the migration chain**

Run:

```bash
npm run check-migrations
```

Expected: `0170` follows `0169` with matching journal and snapshot metadata.

- [ ] **Step 3: Run B6 focused tests**

Run:

```bash
npm test -- src/adventure/data/v2/codexMasteryTrophies.test.ts src/adventure/profile/profileShowcase.test.ts src/adventure/v2/V2CharacterCard.test.tsx src/adventure/v2/V2TrophyCabinetView.test.tsx src/db/codexMasterySchema.test.ts src/db/resetGameProgressPlan.test.ts src/lib/server/codexMasteryGameplay.test.ts src/lib/server/codexMasteryRepository.test.ts src/lib/server/codexMasteryService.test.ts src/lib/server/codexMasteryTrophyRebuild.test.ts src/lib/server/codexMasteryTrophyRebuildCli.test.ts src/lib/server/codexMasteryTrophyRepository.test.ts src/lib/server/codexMasteryTrophyView.test.ts src/lib/server/profileShowcaseRoute.test.ts
```

Expected: all tests pass, including non-downgrade, immutable history, idempotent rebuild, reset, profile authorization, and year filters.

### Task 9: Replay housing trophy displays (B7)

**Files:**
- Modify: `src/adventure/data/v2/housing.ts`
- Modify: `src/adventure/v2/V2HousingView.tsx`
- Modify: `src/app/api/v2/me/housing/route.ts`
- Modify: `src/app/api/v2/player/[name]/housing/route.ts`
- Modify: `src/app/dev/housing/HousingHarness.tsx`
- Modify: `src/lib/server/housing.ts`
- Test: `src/adventure/data/v2/housing.test.ts`, `src/adventure/v2/V2HousingView.test.tsx`, `src/lib/server/housing.test.ts`, `src/lib/server/housingRoute.test.ts`, and `src/lib/server/publicHousingRoute.test.ts`.

**Interfaces:**
- Consumes: owned mastery trophy IDs and existing private/public housing save contracts.
- Produces: optional mastery trophy display choices, save validation, and public room rendering without coupling profile and housing selections.

- [ ] **Step 1: Replay B7**

Run:

```bash
git cherry-pick 811db5367^..03fc7be13
```

Expected: nine housing-display commits apply.

- [ ] **Step 2: Run B7 focused tests**

Run:

```bash
npm test -- src/adventure/data/v2/housing.test.ts src/adventure/v2/V2HousingView.test.tsx src/lib/server/housing.test.ts src/lib/server/housingRoute.test.ts src/lib/server/publicHousingRoute.test.ts
```

Expected: all tests pass, including ownership checks, private/public parity, and crafted display retention.

### Task 10: Replay personal monthly research progress (B8a)

**Files:**
- Create: `drizzle/0173_wandering_scrambler.sql`
- Create: `drizzle/meta/0173_snapshot.json`
- Create: `src/adventure/data/v2/codexResearch.ts`
- Create: `src/lib/server/codexResearchRepository.ts`
- Create: `src/lib/server/codexResearchService.ts`
- Modify: `src/adventure/data/v2/codexMasteryView.ts`
- Modify: `src/adventure/v2/CodexMasteryPanel.tsx`
- Modify: `src/app/api/v2/me/codex-mastery/route.ts`
- Modify: `src/lib/server/codexMasteryGameplay.ts`
- Modify: `src/lib/server/codexMasterySnapshot.ts`
- Modify: reset plan, schema, journal, and related tests.

**Interfaces:**
- Consumes: immutable monthly definition snapshots and normalized codex gameplay events.
- Produces: personal objective, diversity, and record progress under `monthlyProgressEnabled`, without affecting permanent mastery scores.

- [ ] **Step 1: Replay B8a**

Run:

```bash
git cherry-pick 165388393^..81e382be3
```

Expected: ten monthly-progress commits apply.

- [ ] **Step 2: Verify migration and focused behavior**

Run:

```bash
npm run check-migrations
npm test -- src/adventure/data/v2/codexResearch.test.ts src/adventure/v2/CodexMasteryPanel.test.tsx src/app/api/v2/me/codex-mastery/route.test.ts src/db/resetGameProgressPlan.test.ts src/lib/server/codexMasteryGameplay.test.ts src/lib/server/codexMasterySnapshot.test.ts src/lib/server/codexResearchRepository.test.ts src/lib/server/codexResearchService.test.ts
```

Expected: migration check and all selected tests pass; permanent and monthly scores remain independent.

### Task 11: Replay monthly ranking, settlement, and trophies (B8b)

**Files:**
- Create: `drizzle/0174_codex_research_settlement.sql`
- Create: `drizzle/meta/0174_snapshot.json`
- Create: `src/adventure/data/v2/codexResearchRanking.ts`
- Create: `src/adventure/rankings/CodexResearchRankingPanel.tsx`
- Create: `src/adventure/rankings/useCodexResearchRanking.ts`
- Create: `src/app/api/rankings/codex-research/route.ts`
- Create: `src/lib/server/codexResearchRanking.ts`
- Create: `src/lib/server/codexResearchSettlement.ts`
- Create: `src/lib/server/codexResearchTrophies.ts`
- Modify: trophy, profile, housing, rankings, codex panel, schema, journal, and route files in range `7944dcd02^..149b65748`.

**Interfaces:**
- Consumes: closed monthly season snapshots and personal research progress.
- Produces: deterministic provisional/final ranking, immutable settlement rows, minimum-score-aware platinum/diamond/legendary tiers, and idempotent monthly trophies.

- [ ] **Step 1: Replay B8b**

Run:

```bash
git cherry-pick 7944dcd02^..149b65748
```

Expected: ten settlement/ranking commits apply.

- [ ] **Step 2: Verify migration and focused behavior**

Run:

```bash
npm run check-migrations
npm test -- src/adventure/data/v2/codexMasteryTrophies.test.ts src/adventure/data/v2/codexResearchRanking.test.ts src/adventure/rankings/CodexResearchRankingPanel.test.tsx src/adventure/rankings/RankingsView.test.tsx src/adventure/rankings/useCodexResearchRanking.test.ts src/adventure/v2/CodexMasteryPanel.test.tsx src/adventure/v2/V2TrophyCabinetView.test.tsx src/app/api/rankings/codex-research/route.test.ts src/lib/server/codexResearchRanking.test.ts src/lib/server/codexResearchRepository.test.ts src/lib/server/codexResearchSettlement.test.ts src/lib/server/codexResearchTrophies.test.ts src/lib/server/codexMasteryTrophyRepository.test.ts src/lib/server/codexMasteryTrophyView.test.ts
```

Expected: all tests pass, including deterministic tie-breaks, minimum thresholds, no rank inversion, immutable final results, and idempotent trophy awards.

### Task 12: Replay manual season operations (B9)

**Files:**
- Create: `src/adventure/data/v2/codexResearchOps.ts`
- Create: `src/admin/tabs/CodexResearchSeasonOps.tsx`
- Create: `src/app/api/admin/codex-research-seasons/route.ts`
- Create: `src/lib/server/codexResearchOps.ts`
- Create: `src/lib/server/codexResearchOpsRepository.ts`
- Modify: `src/admin/displayLabels.ts`
- Modify: `src/admin/tabs/SeasonOpsTab.tsx`
- Modify: research repository and settlement files.
- Test: corresponding data, admin component, API, server operation, repository, settlement, and PostgreSQL tests.

**Interfaces:**
- Consumes: season definitions, preview calculations, settlement and trophy services, admin authorization.
- Produces: validated preview/list/schedule/settle/resettle/award operations with exact confirmation strings and no automatic cron.

- [ ] **Step 1: Replay B9**

Run:

```bash
git cherry-pick ba0485c08^..fc73161b7
```

Expected: nine operations commits apply.

- [ ] **Step 2: Run B9 focused tests**

Run:

```bash
npm test -- src/adventure/data/v2/codexResearchOps.test.ts src/admin/tabs/CodexResearchSeasonOps.test.tsx src/app/api/admin/codex-research-seasons/route.test.ts src/lib/server/codexResearchOps.test.ts src/lib/server/codexResearchOpsRepository.test.ts src/lib/server/codexResearchRepository.test.ts src/lib/server/codexResearchSettlement.test.ts
```

Expected: all tests pass; destructive operations require exact month-specific confirmation and invalid state transitions are rejected.

- [ ] **Step 3: Prove no automation was added**

Run:

```bash
git diff --name-only origin/main..HEAD | rg '^src/app/api/cron/.*codex|codex.*production.*season'
```

Expected: no output and exit status 1 from `rg`.

### Task 13: Replay publication, archive, notices, and release guard (B10)

**Files:**
- Create: `drizzle/0175_codex_research_publication.sql`
- Create: `src/adventure/data/v2/codexResearchArchive.ts`
- Create: `src/adventure/rankings/CodexResearchArchivePanel.tsx`
- Create: `src/adventure/rankings/useCodexResearchArchive.ts`
- Create: `src/app/api/rankings/codex-research/archive/route.ts`
- Create: `src/lib/server/codexResearchArchive.ts`
- Create: `src/lib/server/codexResearchPublication.ts`
- Create: `scripts/check-codex-mastery-release.mjs`
- Create: `docs/operations/codex-mastery-launch-runbook.md`
- Modify: admin operations, ranking shell, notifications, server feed, ticker, schema, reset, journal, package scripts, and notification/feed configuration files in range `c2809986d^..ad43a86b2`.

**Interfaces:**
- Consumes: settled seasons, monthly trophy history, notification and server-feed repositories, and visibility flags.
- Produces: published-only archive, immutable publication ledger, idempotent personal/feed notices, manual `PUBLISH YYYY-MM`, and static inert-release enforcement.

- [ ] **Step 1: Replay B10**

Run:

```bash
git cherry-pick c2809986d^..ad43a86b2
```

Expected: ten publication/release commits apply.

- [ ] **Step 2: Run the release guard before broader tests**

Run:

```bash
npm run check:codex-mastery-release
```

Expected: `✓ codex mastery release surface is inert and complete`.

- [ ] **Step 3: Run B10 focused tests**

Run:

```bash
npm test -- src/adventure/data/v2/codexResearchArchive.test.ts src/adventure/data/v2/codexResearchOps.test.ts src/adventure/rankings/CodexResearchArchivePanel.test.tsx src/adventure/rankings/RankingsView.test.tsx src/adventure/rankings/useCodexResearchArchive.test.ts src/admin/tabs/CodexResearchSeasonOps.test.tsx src/adventure/v2/WarTicker.test.ts src/app/api/admin/codex-research-seasons/route.test.ts src/app/api/rankings/codex-research/archive/route.test.ts src/lib/server/codexMasteryReleaseCheck.test.ts src/lib/server/codexResearchArchive.test.ts src/lib/server/codexResearchOps.test.ts src/lib/server/codexResearchOpsRepository.test.ts src/lib/server/codexResearchPublication.test.ts src/lib/server/codexResearchRepository.test.ts src/lib/server/codexResearchSettlement.test.ts src/lib/server/codexResearchTrophies.test.ts src/lib/feed-config.test.ts src/lib/v2-notification-config.test.ts
```

Expected: all tests pass, including unpublished-season invisibility, exact publish confirmation, transaction rollback, ledger idempotency, and gated feed behavior.

### Task 14: Run PostgreSQL integration and migration verification

**Files:**
- Test: `src/lib/server/codexMasteryPostgres.test.ts`
- Test: `src/lib/server/codexMasteryRanking.integration.test.ts`
- Verify: `drizzle/0171_codex_mastery_foundation.sql`
- Verify: `drizzle/0172_codex_mastery_trophy_history.sql`
- Verify: `drizzle/0173_wandering_scrambler.sql`
- Verify: `drizzle/0174_codex_research_settlement.sql`
- Verify: `drizzle/0175_codex_research_publication.sql`

**Interfaces:**
- Consumes: PostgreSQL 16 binaries and the complete integrated schema.
- Produces: fresh-database evidence for migrations, transactions, ranking eligibility/tie-breaks, settlement, publication, and rollback invariants.

- [ ] **Step 1: Create an isolated PostgreSQL cluster**

Use this exact task-specific temporary path:

```bash
test ! -e /tmp/codex-mastery-release-pg-20260821
mkdir /tmp/codex-mastery-release-pg-20260821
/home/sea9401/.local/opt/adventure-postgresql-16/usr/lib/postgresql/16/bin/initdb --auth=trust -D /tmp/codex-mastery-release-pg-20260821/data
/home/sea9401/.local/opt/adventure-postgresql-16/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/codex-mastery-release-pg-20260821/data -l /tmp/codex-mastery-release-pg-20260821/postgres.log -o '-F -p 55439 -k /tmp/codex-mastery-release-pg-20260821' start
createdb -h /tmp/codex-mastery-release-pg-20260821 -p 55439 codex_mastery_release
```

Expected: the precondition proves the exact path was unused, the cluster starts only on the temporary Unix socket, and database creation succeeds.

- [ ] **Step 2: Apply the complete migration chain**

Run:

```bash
DATABASE_URL=postgresql://localhost:55439/codex_mastery_release?host=/tmp/codex-mastery-release-pg-20260821 npm run db:migrate
npm run check-migrations
```

Expected: every migration through `0173` applies once and the static migration check passes.

- [ ] **Step 3: Run both real PostgreSQL test files**

Run:

```bash
CODEX_MASTERY_POSTGRES_TEST_DATABASE_URL=postgresql://localhost:55439/codex_mastery_release?host=/tmp/codex-mastery-release-pg-20260821 CODEX_MASTERY_RANKING_TEST_DATABASE_URL=postgresql://localhost:55439/codex_mastery_release?host=/tmp/codex-mastery-release-pg-20260821 npm test -- src/lib/server/codexMasteryPostgres.test.ts src/lib/server/codexMasteryRanking.integration.test.ts
```

Expected: both files run without skips and all PostgreSQL cases pass.

- [ ] **Step 4: Stop the isolated database**

Run:

```bash
/home/sea9401/.local/opt/adventure-postgresql-16/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/codex-mastery-release-pg-20260821/data stop
```

Expected: clean server shutdown. Retain the temporary directory until final reporting so logs remain inspectable.

### Task 15: Audit scope and run complete verification

**Files:**
- Verify: every path changed by `origin/main..HEAD`.
- Modify only if a regression is found: the narrow failing codex or current-main integration file and its matching test.
- Create: `docs/operations/codex-mastery-integration-audit.md`

**Interfaces:**
- Consumes: complete release candidate and both preserved source branches.
- Produces: auditable proof that codex scope is complete, inert, current-main-compatible, and free of unrelated session work.

- [ ] **Step 1: Record the final changed-path inventory**

Run:

```bash
git diff --name-status origin/main..HEAD
git log --oneline --reverse origin/main..HEAD
```

Expected: documentation commits followed only by the selected codex commit ranges; every changed path maps to Tasks 2-13.

- [ ] **Step 2: Perform the two-way source-content audit**

Run:

```bash
git diff --name-only fea3aa2ee..ad43a86b2
git diff --name-only origin/main..HEAD
git diff --stat origin/main..HEAD
```

For every path printed by the first command, run `git diff ad43a86b2 --` followed by that literal path. Classify each difference as a required current-main adaptation, an intentionally excluded unrelated change, or a defect to fix. Then inspect every candidate-only path and remove it unless it is the approved design/plan/audit documentation or attributable to the codex ranges.

Expected: no unexplained missing source hunk and no unexplained candidate-only implementation hunk.

- [ ] **Step 3: Write the integration audit with exact evidence**

Create `docs/operations/codex-mastery-integration-audit.md` with the title `도감 숙련도 재통합 감사`. Record the literal output of `git rev-parse origin/main`, source SHAs `fea3aa2ee` and `ad43a86b2`, the selective-linear-replay method, all nine disabled defaults, migrations `0171` through `0175`, the observed PostgreSQL file/test counts, zero unexplained omissions, zero unrelated imports, and the fact that deployment, operating-production backfill, and feature activation were not performed. Every value must come from the commands in this task.

- [ ] **Step 4: Run static checks**

Run:

```bash
npm run check:codex-mastery-release
npm run check-migrations
npm run check-images
npx tsc --noEmit
npx eslint src scripts/check-codex-mastery-release.mjs scripts/backfill-codex-mastery.ts scripts/rebuild-codex-mastery-trophies.ts scripts/repair-codex-mastery-summary.ts scripts/report-codex-mastery-budget.ts
git diff --check
```

Expected: every command exits 0; all nine feature defaults remain false.

- [ ] **Step 5: Run the complete test suite once**

Run:

```bash
npm test
```

Expected: exit 0. If an unrelated pre-existing failure appears, reproduce it against `origin/main` before classifying it; do not hide or silently exclude it.

- [ ] **Step 6: Run the production build**

Run:

```bash
npm run build
```

Expected: image optimization/checks, Next.js compilation, type validation, route generation, and postbuild all exit 0.

- [ ] **Step 7: Commit only audit or integration-specific conflict fixes**

Run:

```bash
git add -A
git commit -m "chore: certify codex mastery release candidate"
git status --short --branch
```

Expected: final commit succeeds and the worktree is clean. `git add -A` is used only after the two-way audit has proven that every remaining path is in scope.

---

## Execution policy

Repository instructions prohibit creating subagents unless the user explicitly requests them. Execute this plan
inline with `superpowers:executing-plans`, preserving the task checkpoints above. Do not offer or use the
subagent-driven option in this session unless the user later asks for delegation.
