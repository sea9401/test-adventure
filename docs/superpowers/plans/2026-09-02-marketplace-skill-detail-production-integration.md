# Marketplace Auction and Skill Detail Production Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the completed auction-only marketplace and shared skill detail dialog onto current production `main` as one release commit, deploy its verified artifact, and turn maintenance mode off after successful health verification.

**Architecture:** Reapply only the feature-owned commits from the two preserved local branches, resolve them against current `main`, and replace the colliding marketplace migration with a generated `0180` migration. Preserve the original behavior contracts and tests, then squash the complete integration into one commit before PR and deployment.

**Tech Stack:** Next.js App Router route handlers, React 19, TypeScript, Drizzle/PostgreSQL, Vitest, Playwright, GitHub Actions, EC2 deployment scripts.

## Global Constraints

- Do not include unexplored-region, dark-surface, Tier 7 balance, manual-navigation, or feedback-546 work.
- Use opaque surface constants for the skill detail dialog.
- Keep all marketplace listings as six-hour whole-lot auctions and retire fixed-price and buy-order mutations.
- Use migration number `0180`; `0179` already exists on production `main`.
- Produce exactly one feature commit on top of the latest production `main` before merging.
- Do not enable maintenance early; let the deployment workflow enable it immediately before runtime replacement.
- Disable maintenance only after deployment and external health verification succeed.

---

### Task 1: Establish the red integration baseline

**Files:**
- Test: `src/adventure/v2/SkillDetailDialog.test.tsx`
- Test: `src/app/api/v2/marketplace/retiredRoutes.test.ts`

**Interfaces:**
- Consumes: current production `main` at `cb92e5962` or its exact successor.
- Produces: recorded failures proving both omitted features are absent.

- [ ] Run `npx vitest run src/adventure/v2/SkillDetailDialog.test.tsx src/app/api/v2/marketplace/retiredRoutes.test.ts` and confirm both test paths are missing before restoration.
- [ ] Record the expected missing-test failure; do not change production code in this task.

### Task 2: Restore the shared skill detail dialog

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Create: `src/adventure/data/v2/v2SkillDetails.test.ts`
- Create: `src/adventure/data/v2/__snapshots__/v2SkillDetails.test.ts.snap`
- Create: `src/adventure/v2/skillDetailModel.ts`
- Create: `src/adventure/v2/skillDetailModel.test.ts`
- Create: `src/adventure/v2/SkillDetailDialog.tsx`
- Create: `src/adventure/v2/SkillDetailDialog.test.tsx`
- Modify: `src/adventure/v2/V2SkillLearnView.tsx`
- Modify: `src/adventure/v2/V2LoadoutPanel.tsx`
- Modify: `src/adventure/v2/JobRoadmapDialog.tsx`
- Modify: `src/lib/useEscapeKey.ts`
- Modify: `src/lib/useFocusTrap.ts`
- Modify: `src/lib/useModalA11y.ts`

**Interfaces:**
- Consumes: `V2SkillDefinition`, existing skill effect formatters, and modal accessibility hooks.
- Produces: `buildSkillDetailModel`, `SkillDetailContent`, `SkillDetailTrigger`, and `SkillDetailDialog`.

- [ ] Apply feature commits `a0c77d524` through `b506dbda4` without committing, excluding the unrelated Vajra combat commit `dee87ae51`.
- [ ] Resolve current-main conflicts while preserving current skill balance values and the original detail text contract.
- [ ] Run `npx vitest run src/adventure/data/v2/v2SkillDetails.test.ts src/adventure/v2/skillDetailModel.test.ts src/adventure/v2/SkillDetailDialog.test.tsx src/adventure/v2/V2SkillLearnView.test.tsx src/adventure/v2/V2LoadoutPanel.test.tsx src/adventure/v2/JobRoadmapDialog.test.tsx` and require all tests to pass.

### Task 3: Restore the auction-only marketplace

**Files:**
- Create: `drizzle/0180_auction_only_marketplace.sql`
- Create: `drizzle/meta/0180_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/db/schema.ts`
- Modify: `src/lib/server/marketplaceV2.ts`
- Modify: `src/lib/server/marketplaceBuyOrdersV2.ts`
- Modify: `src/lib/server/marketplaceEscrow.ts`
- Create: `src/lib/server/marketplaceFeatureRetired.ts`
- Modify: `src/app/api/v2/marketplace/**/route.ts`
- Modify: `src/app/api/v2/cron/marketplace-expire/route.ts`
- Modify: `src/adventure/v2/V2MarketplaceView.tsx`
- Modify: `src/adventure/v2/marketplace/*.tsx`
- Modify: `src/app/manual/content/plaza.tsx`

**Interfaces:**
- Consumes: existing marketplace listing, bid, escrow, trade-suspension, and inbox contracts.
- Produces: auction-mode version 1 listings, whole-lot bid UI, auction settlement, and retired fixed-price routes.

- [ ] Apply feature commits `250bee7b0` through `96f250223` without committing, including the existing auction tests and documentation.
- [ ] Resolve current-main conflicts without restoring removed or stale non-marketplace code.
- [ ] Remove the original `0179_auction_only_marketplace` artifacts, add the schema field on top of current `0179`, and run `npm run db:generate -- --name auction_only_marketplace` to produce `0180` artifacts.
- [ ] Run `npx vitest run src/lib/server/marketplaceV2.test.ts src/lib/server/marketplaceBuyOrdersV2.test.ts src/lib/server/marketplaceEscrow.test.ts src/lib/server/marketplaceListRoute.test.ts src/app/api/v2/marketplace/bid/route.test.ts src/app/api/v2/marketplace/browse/route.test.ts src/app/api/v2/marketplace/retiredRoutes.test.ts src/app/api/v2/cron/marketplace-expire/route.test.ts src/adventure/v2/V2MarketplaceView.requests.test.tsx src/adventure/v2/marketplace/MarketplaceStackBrowse.test.tsx` and require all tests to pass.

### Task 4: Verify and squash the release

**Files:**
- Modify only files already listed by Tasks 2 and 3 plus the integration spec and plan.

**Interfaces:**
- Consumes: completed skill-detail and auction integrations.
- Produces: one clean release commit on current production `main`.

- [ ] Run `npm run check-migrations`, `npx tsc --noEmit`, `npm run lint`, `npm run check-images`, and `npm run check-module-budgets`.
- [ ] Run `npm test` and require zero failures.
- [ ] Run `npm run build` and require the production build and all hooks to pass.
- [ ] Run `git diff --check`, inspect `git status --short`, and confirm no unrelated paths are present.
- [ ] Create one commit named `feat: ship auction marketplace and skill details`.

### Task 5: Merge, deploy, and reopen

**Files:**
- No additional repository files.

**Interfaces:**
- Consumes: the single verified release commit.
- Produces: merged `main`, exact-SHA CI artifact, successful production runtime, and maintenance mode off.

- [ ] Push the release branch, open a PR to `main`, and wait for every required CI check to pass.
- [ ] Squash-merge the PR and capture the exact resulting `main` SHA.
- [ ] Wait for successful `main` CI and the matching `production-next-<SHA>` artifact.
- [ ] Dispatch the production deployment workflow for that exact SHA and wait for success.
- [ ] Verify the external health endpoint and release marker report the deployed SHA.
- [ ] Run `bash deploy/maintenance.sh off` only after the previous checks pass, then verify the public service is open and healthy.
