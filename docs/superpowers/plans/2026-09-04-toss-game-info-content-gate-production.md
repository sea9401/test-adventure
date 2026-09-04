# Toss Review, Game Info Return, and Content Gate Production Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate only the three approved undeployed work groups onto the exact latest production `main`, produce one squash commit, and deploy that exact revision.

**Architecture:** Start from fetched `origin/main` in an isolated `/tmp` worktree and apply the approved source commits without their branch ancestry. Preserve the current production CI and deploy safeguards while resolving overlaps, then prove the diff excludes the staging-only immortal berserker work before creating one commit.

**Tech Stack:** Git, TypeScript, React, Next.js 16.2.11, Vitest 4.1.10, Playwright 1.62.0, GitHub Actions

## Global Constraints

- Include only the Toss homepage review range `a5aee5b2a..7c0fd6239`, game-info return range `ca9c6f7e3..d03d07f55`, and content-modification deploy-gate range `14ffb9d35..d755f71ee`.
- Exclude PR #2505 and every immortal-berserker staging change.
- Produce exactly one commit relative to the fetched `origin/main` baseline.
- Preserve the GitHub Advisory Database production audit and exact-SHA production artifact checks already on `main`.
- Do not enable maintenance until the production artifact is ready and the deploy workflow reaches runtime replacement.
- Disable maintenance only after the deploy workflow succeeds, then verify the public build ID and health.

---

### Task 1: Apply the three approved work groups

**Files:**
- Modify/Create: the files changed by commits `a5aee5b2a` through `7c0fd6239`
- Modify/Create: the files changed by commits `ca9c6f7e3` through `d03d07f55`
- Modify/Create: the files changed by commits `14ffb9d35` through `d755f71ee`
- Create: `docs/superpowers/plans/2026-09-04-toss-game-info-content-gate-production.md`

**Interfaces:**
- Consumes: exact fetched `origin/main` and the three allowlisted commit ranges
- Produces: one staged integrated tree without source-branch ancestry

- [x] **Step 1: Apply the Toss review range without committing**

Run: `git cherry-pick -n a5aee5b2a^..7c0fd6239`

- [x] **Step 2: Apply the game-info return range without committing**

Run: `git cherry-pick -n ca9c6f7e3^..d03d07f55`

- [x] **Step 3: Apply the content deploy-gate range without committing**

Run: `git cherry-pick -n 14ffb9d35^..d755f71ee`

- [x] **Step 4: Resolve overlaps against current production safeguards**

Keep `scripts/check-production-advisories.mjs`, the `production-next-<SHA>` artifact contract, the deferred maintenance transition, and the content-review validation required by `deploy.yml`.

### Task 2: Audit scope and run focused verification

**Files:**
- Test: `src/adventure/v2/MuseunCoinCheckout.test.tsx`
- Test: `src/app/products/museun-coin/page.test.tsx`
- Test: `src/app/sign-in/LandingContent.test.tsx`
- Test: `src/app/sitemap.test.ts`
- Test: `src/auth.config.test.ts`
- Test: `src/db/productionEnvPreflight.test.ts`
- Test: `src/lib/publicMerchantInfo.test.ts`
- Test: `src/adventure/v2/V2PreferencesView.test.tsx`
- Test: `src/adventure/v2/V2SettingsMenu.rating.test.tsx`
- Test: `src/components/GameInfoReturnControl.test.tsx`
- Test: `src/components/GameRatingInformation.test.tsx`
- Test: `src/contentModificationDeployGate.test.ts`
- Test: `src/productionSecuritySurface.test.ts`

**Interfaces:**
- Consumes: the integrated tree from Task 1
- Produces: behavioral and scope evidence for the final squash commit

- [x] **Step 1: Audit the changed paths and excluded staging work**

Run: `git diff --check origin/main`

Run: `git diff --name-status origin/main`

Run: `git diff --name-only origin/main | rg 'immortalBerserker|coopBosses'` and require no matches.

- [x] **Step 2: Run the focused Vitest suites**

Run: `npm test -- --run src/adventure/v2/MuseunCoinCheckout.test.tsx src/app/products/museun-coin/page.test.tsx src/app/sign-in/LandingContent.test.tsx src/app/sitemap.test.ts src/auth.config.test.ts src/db/productionEnvPreflight.test.ts src/lib/publicMerchantInfo.test.ts src/adventure/v2/V2PreferencesView.test.tsx src/adventure/v2/V2SettingsMenu.rating.test.tsx src/components/GameInfoReturnControl.test.tsx src/components/GameRatingInformation.test.tsx src/contentModificationDeployGate.test.ts src/productionSecuritySurface.test.ts`

- [x] **Step 3: Run lint, TypeScript, and production-policy checks**

Run: `npx eslint .`

Run: `env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`

Run: `npm run check-secrets`

Run: `npm run check-action-pins`

### Task 3: Verify and create the single release commit

**Files:**
- Modify/Create: all allowlisted files integrated by Task 1

**Interfaces:**
- Consumes: the scoped, verified integration tree
- Produces: one production release commit atop `origin/main`

- [x] **Step 1: Run the full unit suite**

Run: `npm test`

- [x] **Step 2: Run the production build**

Run: `env NODE_OPTIONS=--max-old-space-size=4096 npm run build`

- [ ] **Step 3: Commit the entire integration once**

Run: `git add` only the audited changed paths, then `git commit -m "feat: publish Toss review surfaces and deploy safeguards"`.

- [ ] **Step 4: Prove topology and cleanliness**

Run: `git rev-list --count origin/main..HEAD` and require `1`.

Run: `git status --short --branch` and require no working-tree changes.

### Task 4: Merge, deploy, and reopen production

**Files:**
- No additional source changes

**Interfaces:**
- Consumes: the exact release commit and its successful CI evidence
- Produces: a verified production deployment with maintenance disabled

- [ ] **Step 1: Push the release branch and create a PR to `main`**

Push `release/toss-game-info-content-gate-20260904` and create a PR describing the three included groups and explicit PR #2505 exclusion.

- [ ] **Step 2: Merge only after the PR CI succeeds**

Squash-merge the PR and record the exact resulting 40-character `main` SHA.

- [ ] **Step 3: Wait for the exact main CI and production artifact**

Require successful CI for the exact SHA and an unexpired artifact named `production-next-<SHA>`.

- [ ] **Step 4: Deploy the exact SHA**

Dispatch `deploy.yml` with `deploy_sha=<SHA>` and require the workflow's maintenance-required public verification to pass.

- [ ] **Step 5: Disable maintenance and verify production**

Run `bash deploy/maintenance.sh off` on the production EC2 host, require service `active`, internal health `200`, public maintenance policy `forbid`, and `/api/version` build ID equal to the deployed SHA.
