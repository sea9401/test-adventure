# September 3 Production Pending Squash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce, verify, and release one production commit containing the six approved undeployed work groups while excluding test-server work.

**Architecture:** Start from fetched `origin/main`, apply an explicit allowlist of commit patches without source ancestry, and preserve production-only behavior while resolving overlaps. The final tree is committed once, merged to `main`, pushed, and deployed only after exact-SHA CI and artifact verification.

**Tech Stack:** Git, TypeScript, React, Next.js 16.2.11, Vitest 4.1.10, Playwright 1.62.0, GitHub Actions

## Global Constraints

- Do not merge or copy the head of `staging` or any test-server branch.
- Preserve the production marketplace browse limit of 500.
- Keep source branches and worktrees recoverable.
- Produce exactly one commit relative to the fetched production baseline.
- Do not enable maintenance before the deploy workflow reaches runtime swap.

---

### Task 1: Apply the approved patch allowlist

**Files:**
- Modify: files changed by the six allowlisted work groups
- Create: `docs/superpowers/specs/2026-09-03-production-pending-squash-design.md`
- Create: `docs/superpowers/plans/2026-09-03-production-pending-squash.md`

**Interfaces:**
- Consumes: fetched production baseline `22ab4a3d5` and the explicit commit allowlist in the design
- Produces: one staged integrated tree with no source-branch ancestry

- [ ] **Step 1: Apply the accessibility range without committing**

Run: `git cherry-pick -n 41a8d9ba3^..4dc57f7ce`

- [ ] **Step 2: Apply the marketplace codex-filter range without committing**

Run: `git cherry-pick -n 2876aa604^..098452f5d`

- [ ] **Step 3: Apply the critical-resistance range without committing**

Run: `git cherry-pick -n e7d8365d5^..33cba7071`

- [ ] **Step 4: Apply the three standalone changes without committing**

Run: `git cherry-pick -n 2e98bcfc8 46b496bae 36e7b1e9d`

- [ ] **Step 5: Resolve overlaps by retaining both selected behaviors and current production behavior**

Verify the marketplace codex filter, accessibility names and alerts, the
500-row browse limit, critical-resistance projection, guild pagination, PvP
counter gate, and mutant lineage are all present.

### Task 2: Prove regression coverage and audit scope

**Files:**
- Test: tests included by each selected work group

**Interfaces:**
- Consumes: integrated working tree from Task 1
- Produces: focused behavioral evidence and an exclusion audit

- [ ] **Step 1: Run focused Vitest suites for all selected work**

Run the accessibility, marketplace codex filter, critical-resistance, guild
pagination, PvP counter, and skill-lineage test files selected from the diff.

- [ ] **Step 2: Run exclusion and whitespace audits**

Run: `git diff --check origin/main`

Inspect the file list and diff for staging-only environment changes,
unexplored-region paths, and accidental reversions of deployed marketplace
behavior.

### Task 3: Create and verify the single release commit

**Files:**
- Modify: all selected files staged by Tasks 1 and 2

**Interfaces:**
- Consumes: audited integrated tree
- Produces: one release commit atop `origin/main`

- [ ] **Step 1: Run lint and TypeScript**

Run: `npx eslint <all changed TypeScript files>`

Run: `env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`

- [ ] **Step 2: Run the full unit suite and production build**

Run: `npm test`

Run: `env NODE_OPTIONS=--max-old-space-size=4096 npm run build`

- [ ] **Step 3: Run public and authenticated accessibility E2E**

Run the configured Chromium public and authenticated accessibility projects;
retain the official CI WebKit lane for host libraries unavailable locally.

- [ ] **Step 4: Commit once and prove topology**

Run: `git commit -m "feat: consolidate September 3 production updates"`

Verify `git rev-list --count origin/main..HEAD` prints `1` and the worktree is
clean.

### Task 4: Integrate and deploy the exact release SHA

**Files:**
- No source changes

**Interfaces:**
- Consumes: verified single release commit
- Produces: exact main SHA, matching CI artifact, and production deployment

- [ ] **Step 1: Push the release branch and create a PR to `main`**

Use the repository PR workflow and include test evidence plus the exclusion
audit.

- [ ] **Step 2: Merge the verified release commit to `main`**

Record the exact resulting main SHA; do not deploy a different revision.

- [ ] **Step 3: Wait for successful CI and matching production artifact**

Verify successful CI for the exact main SHA and the artifact named
`production-next-<SHA>`.

- [ ] **Step 4: Dispatch and monitor the production deploy workflow**

Allow the workflow to enter maintenance only immediately before runtime swap,
then verify health and deployed SHA. Maintenance remains subject to the
repository's explicit-off rule.
