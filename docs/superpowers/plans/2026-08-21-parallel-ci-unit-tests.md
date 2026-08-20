# Parallel CI Unit Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore parallel execution for ordinary Vitest files while keeping the expensive level-design simulation deterministic in an isolated single-worker CI lane.

**Architecture:** The existing `unit-tests` job runs the normal suite with `levelDesignSim.test.ts` excluded and Vitest's default worker pool. A new `level-design-sim-tests` job runs only that file with `--maxWorkers=1`; the existing required `check` aggregation job accepts the workflow only when both lanes succeed.

**Tech Stack:** GitHub Actions, Vitest 4.1.10, TypeScript contract tests

## Global Constraints

- Do not deploy or change production infrastructure.
- Preserve the required GitHub status check name `check`.
- Do not modify unrelated working-tree changes.

---

### Task 1: Split the unit-test CI lane

**Files:**
- Modify: `src/productionSecuritySurface.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Vitest CLI `--exclude` and `--maxWorkers=1` options.
- Produces: `unit-tests`, `level-design-sim-tests`, and aggregate `check` GitHub Actions jobs.

- [ ] **Step 1: Write the failing CI contract test**

Add a test that requires the ordinary unit-test command to exclude
`src/adventure/data/v2/levelDesignSim.test.ts`, requires a dedicated
`level-design-sim-tests` job to run only that file with one worker, and requires the
aggregate `check` job to depend on and validate both results.

- [ ] **Step 2: Run the contract test and verify RED**

Run: `npm test -- src/productionSecuritySurface.test.ts`

Expected: FAIL because `.github/workflows/ci.yml` still serializes the entire suite and has no dedicated simulation lane.

- [ ] **Step 3: Implement the workflow split**

Set the ordinary command to:

```yaml
run: npx vitest run --exclude src/adventure/data/v2/levelDesignSim.test.ts
```

Add a parallel job whose test command is:

```yaml
run: npx vitest run src/adventure/data/v2/levelDesignSim.test.ts --maxWorkers=1
```

Add that job to `check.needs`, export its result, and require `success` alongside the existing lanes.

- [ ] **Step 4: Verify GREEN and workflow syntax**

Run: `npm test -- src/productionSecuritySurface.test.ts`

Expected: PASS.

Run: `npx vitest run --exclude src/adventure/data/v2/levelDesignSim.test.ts --passWithNoTests`

Expected: all ordinary tests pass using the default worker pool.

Run: `npx vitest run src/adventure/data/v2/levelDesignSim.test.ts --maxWorkers=1`

Expected: the isolated simulation tests pass.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-08-21-parallel-ci-unit-tests.md \
  src/productionSecuritySurface.test.ts .github/workflows/ci.yml
git commit -m "ci: isolate deterministic simulation tests"
```
