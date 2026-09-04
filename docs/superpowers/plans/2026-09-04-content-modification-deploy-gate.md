# Content Modification Deploy Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require and record a content-modification-report review before every production deployment.

**Architecture:** A dependency-free Node.js CLI validates structured `workflow_dispatch` inputs and writes a sanitized GitHub Actions job summary. The production deploy workflow invokes it before locating or transferring the build artifact, while the operations checklist documents the human review and retention duties.

**Tech Stack:** GitHub Actions YAML, Node.js ESM, Vitest, TypeScript

## Global Constraints

- Preserve the existing exact-main-SHA, successful-CI-artifact, transfer-before-maintenance, and maintenance-retention behavior.
- Do not deploy, push, merge, access the GCRB account, or change maintenance mode.
- Do not automate the legal classification decision or content-modification filing.
- Keep every change isolated on `feature/content-modification-deploy-gate`.

---

### Task 1: Add the content-modification review gate

**Files:**
- Create: `scripts/validate-content-modification-review.mjs`
- Create: `src/contentModificationDeployGate.test.ts`
- Modify: `.github/workflows/deploy.yml`
- Modify: `src/productionSecuritySurface.test.ts`
- Modify: `docs/templates/operations-change-checklist.md`

**Interfaces:**
- Consumes: `CONTENT_MODIFICATION_STATUS`, `CONTENT_MODIFICATION_SUMMARY`, `CONTENT_MODIFICATION_REPORT_REFERENCE`, `DEPLOY_SHA`, and optional `GITHUB_STEP_SUMMARY` environment variables.
- Produces: exit code zero plus a sanitized Markdown job summary for valid input, or a nonzero exit code with a specific error for invalid input.

- [ ] **Step 1: Write failing behavioral and workflow integration tests**

Create process-level tests that run the CLI with literal environments and assert:

```typescript
expect(runReview({ status: "technical-only", summary: "인증 오류 수정" }).status).toBe(0);
expect(runReview({ status: "reported", summary: "신규 전투 연출", reference: "GCRB-20260904-1" }).status).toBe(0);
expect(runReview({ status: "reported", summary: "신규 전투 연출" }).stderr).toContain("report reference is required");
```

Extend the production workflow test to require all three dispatch inputs, the validator command, and validator placement before `Transfer production build to EC2`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx vitest run src/contentModificationDeployGate.test.ts src/productionSecuritySurface.test.ts
```

Expected: FAIL because the validator and workflow inputs do not exist.

- [ ] **Step 3: Implement the minimal validator, workflow wiring, and checklist entries**

The validator accepts only `not-applicable`, `technical-only`, and `reported`; trims required text; requires a report reference for `reported`; replaces newlines and pipe characters in summary fields; and appends the deploy SHA and review fields to `GITHUB_STEP_SUMMARY` when provided.

Add the three dispatch inputs to `deploy.yml`, map them into the `verify-main-ci` environment, and invoke:

```yaml
- name: Verify content modification review
  run: node scripts/validate-content-modification-review.mjs
```

Place the step before `Locate successful main CI artifact`. Add pre-deploy and post-deploy record items to the operations checklist.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run src/contentModificationDeployGate.test.ts src/productionSecuritySurface.test.ts
```

Expected: both files pass with zero failed tests.

- [ ] **Step 5: Run repository verification**

Run:

```bash
npm test
npx tsc --noEmit
npx eslint scripts/validate-content-modification-review.mjs src/contentModificationDeployGate.test.ts src/productionSecuritySurface.test.ts
git diff --check
```

Expected: every command exits zero.

- [ ] **Step 6: Review and commit only the scoped files**

Inspect the complete diff and commit the spec, plan, validator, workflow, tests, and checklist with messages describing the compliance gate. Do not push or deploy.
