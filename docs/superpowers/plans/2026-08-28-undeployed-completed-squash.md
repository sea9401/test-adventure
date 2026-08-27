# August 28 Undeployed Completed Work Squash Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate every completed change after deployed commit `0ed7e6f8a52dc6040419c9ec0303695d9cd8ea87` into one local release commit while excluding all unexplored-region work.

**Architecture:** Use `origin/main` as the exact deployed base. Apply only audited non-unexplored commit patches without preserving their source history, verify that no unexplored path or commit patch leaked into the result, then create one squash commit.

**Tech Stack:** Git, Next.js application sources, Vitest, ESLint, TypeScript

## Global Constraints

- Do not deploy, push, merge into `main`, or change maintenance mode.
- Preserve the source branches and their worktrees.
- Exclude unexplored-region designs, mockups, catalogs, rewards, simulations, scripts, and related material-count updates.
- Keep the final release branch based directly on `origin/main` with exactly one new commit.

---

### Task 1: Establish the deployed baseline

**Files:**
- No repository files changed.

**Interfaces:**
- Consumes: `origin/main` and the latest successful production deployment SHA.
- Produces: verified base SHA `0ed7e6f8a52dc6040419c9ec0303695d9cd8ea87`.

- [x] Confirm `origin/main` equals the latest successful main deployment SHA.
- [x] Confirm source anchor `feb9ce51f5a83b16f90a74f2689ecec4611c3a15` has the same tree as `origin/main`.
- [x] Run the full baseline suite: 973 test files and 7,863 tests passed.

### Task 2: Apply the completed non-unexplored patches

**Files:**
- Modify: application, test, migration, documentation, and operations files touched by the selected commits.

**Interfaces:**
- Consumes: the following 38 source commits in chronological/dependency order.
- Produces: one staged aggregate diff against `origin/main`.

- [x] Apply these selected commits without committing:

```text
554d6a4af 97257a075 7d04d3f2b 48dc53018 2ea1200dd 7b695957b
8bcf60276 7eb91efd5 1f8b87408 650e1474a 3538c2157
aa18cf3c6 7f1363730 c192ba324 e25ee5364 d54c5c0b8 67d2bc74a
045ad87cc 578a7a12a 029b1cf71 30f6e0f19 6bdcdbfd9 0f15d3c2f
c044cc6b7 1fe1a5650 9e694c8ae 7ba625653 2bdf67a5e 05db36579
28c3a5162 7ac9f0910 d9d815250 90f675656 ffd271a11 2e00ae38e
d33593861 035c1c665 b20f3a0ac
```

- [x] Resolve only integration conflicts required to preserve the selected commits' final behavior.
- [x] Confirm every selected commit's patch is represented in the aggregate tree.
- [x] Keep superseded parallel guild-gold implementation `f14b6c845` out; use final branch tip `650e1474a` only.

### Task 3: Prove unexplored-region work is absent

**Files:**
- Inspect: final aggregate diff and the excluded source commits below.

**Interfaces:**
- Consumes: final aggregate tree and the excluded commit list.
- Produces: path-level and patch-level exclusion evidence.

- [x] Keep these 34 unexplored-region commits excluded:

```text
eaa08f9eb 86d72c821 cce9c83f1 2efc5c14b 483928464 5c3bae897
ff1975f53 9608aa25d 7b3349ef0 08bfc1d42 5fa0bb250 028b6df00
7c141261a bd182e739 ba2f0e8a7 8b9fc3504 51b4a6d6c a27f5c517
065c79220 ec66563a0 251d68806 ec8d28592 854e495ad d3d401368
3948af42a 694161fe7 80ba7ea44 90bd03485 ee0d35a97 ad7b8d54d
b6505dda1 f1efd57e3 64e385c20 3d6a93beb
```

- [x] Search the aggregate diff for `unexplored`, `미개척`, and excluded paths.
- [x] Compare the final changed-path list with each excluded commit's changed paths and review any overlap.

### Task 4: Verify and squash

**Files:**
- Verify: all changed application, test, migration, documentation, and operations files.

**Interfaces:**
- Consumes: audited aggregate diff.
- Produces: one verified release commit on `release/aug28-completed-excluding-unexplored`.

- [x] Run `git diff --check`.
- [x] Run `npm test` and require zero failures.
- [x] Run `npm run lint` and require zero errors.
- [x] Run `env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`; record any pre-existing baseline error separately.
- [x] Commit the aggregate diff once and confirm `origin/main..HEAD` contains exactly one commit.
- [x] Re-run the inclusion and exclusion audits against the committed tree.
