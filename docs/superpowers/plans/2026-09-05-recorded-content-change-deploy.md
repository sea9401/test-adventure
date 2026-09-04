# Recorded Content Change Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a production deployment with game-content changes after a repository record is committed, without representing that record as an official content-modification filing.

**Architecture:** Extend the existing validator with a distinct `recorded` state and a separately named repository-record input. Validate the path against a narrow documentation directory before artifact lookup, preserve all existing status semantics, and emit internal-record and official-report references as separate Actions summary fields.

**Tech Stack:** Node.js ESM, Vitest, GitHub Actions YAML, Markdown operations documentation

## Global Constraints

- `recorded` never means that an official report was filed.
- A `recorded` reference must be an existing Markdown file below `docs/content-modification-records/`.
- `reported` continues to require an actual filing receipt or report record location.
- Production artifact lookup and transfer remain after the content-change validation gate.
- Production maintenance remains enabled after deployment until a separate explicit request disables it.
- Work only in `/tmp/test-adventure-content-record-20260905`.

---

### Task 1: Add the recorded-state validator and workflow input

**Files:**
- Modify: `src/contentModificationDeployGate.test.ts`
- Modify: `src/productionSecuritySurface.test.ts`
- Modify: `scripts/validate-content-modification-review.mjs`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: existing content-modification environment inputs
- Produces: `CONTENT_MODIFICATION_RECORD_REFERENCE`, accepted status `recorded`, distinct Actions summary rows

- [ ] **Step 1: Write failing validator tests**

Extend `ReviewInput` and `runReview` with `recordReference`, then add these behaviors:

```ts
expect(runReview({
  status: "recorded",
  summary: "미개척지 콘텐츠 운영 반영",
  recordReference: "docs/content-modification-records/2026-09-05-unexplored-production.md",
  withJobSummary: true,
}).status).toBe(0);

for (const recordReference of [
  "",
  "docs/content-modification-records/missing.md",
  "../outside.md",
  "docs/ops-runbook.md",
  "docs/content-modification-records/not-markdown.txt",
]) {
  expect(runReview({
    status: "recorded",
    summary: "미개척지 콘텐츠 운영 반영",
    recordReference,
  }).status).toBe(1);
}
```

- [ ] **Step 2: Pin the workflow contract in the security test**

Require `content_modification_record_reference:`, its uppercase environment mapping, and the `recorded` choice in `.github/workflows/deploy.yml`.

- [ ] **Step 3: Run the focused suite and confirm red**

Run: `npx vitest run src/contentModificationDeployGate.test.ts src/productionSecuritySurface.test.ts`

Expected: the new cases fail because `recorded` and its workflow input do not exist.

- [ ] **Step 4: Implement minimal validation and workflow wiring**

Use this validation shape to require an existing regular `.md` file strictly below the record directory:

```js
const recordRoot = resolve("docs/content-modification-records");
const resolved = resolve(recordReference);
const inside = relative(recordRoot, resolved);
if (
  !recordReference ||
  isAbsolute(recordReference) ||
  !recordReference.endsWith(".md") ||
  !inside ||
  inside.startsWith(`..${sep}`) ||
  isAbsolute(inside)
) {
  fail("content change record must reference an existing Markdown file under docs/content-modification-records/");
}
try {
  if (!statSync(resolved).isFile()) throw new Error("not a file");
} catch {
  fail("content change record must reference an existing Markdown file under docs/content-modification-records/");
}
```

Add `recorded` to the allowed statuses, validate only that status, and write separate `내부 변경 기록` and `공식 신고 접수번호·기록` summary rows. Wire the workflow before validator execution:

```yaml
content_modification_record_reference:
  description: "recorded 선택 시 저장소 내부 변경 기록 문서 경로"
  required: false
  default: ""
  type: string
```

---

### Task 2: Record the release and update operations guidance

**Files:**
- Create: `docs/content-modification-records/2026-09-05-unexplored-production.md`
- Modify: `docs/staging-release-flow.md`
- Modify: `docs/ops-runbook.md`
- Modify: `docs/templates/operations-change-checklist.md`
- Modify: `docs/release-readiness.md`

**Interfaces:**
- Consumes: staging SHA `15b031e1f45901c27c515a0754ebcebea7018b47`, PR `#2518`, preserved production parent `d2248856d3e68adabe60875741249280377346a2`
- Produces: stable record path `docs/content-modification-records/2026-09-05-unexplored-production.md`

- [ ] **Step 1: Create the release record**

Record the `recorded` status, all three exact source identifiers above, the complete test-only promotion, the Skyward Artillery base-damage and penetration increase, the roughly 30% unexplored-boss stat increase, CI evidence, rollback basis, and the fact that the document is not proof of an official filing. Include a section where a later official reference can be appended.

```markdown
# 2026-09-05 미개척지 콘텐츠 운영 승격 기록

- 기록 상태: `recorded` — 공식 내용수정신고 여부는 운영자 후속 판단
- 테스트 서버 기준 SHA: `15b031e1f45901c27c515a0754ebcebea7018b47`
- 운영 승격 PR: `#2518`
- 보존한 기존 운영 기준: `d2248856d3e68adabe60875741249280377346a2`

이 문서는 내부 변경 이력이며 공식 내용수정신고 접수 증빙이 아니다.
```

- [ ] **Step 2: Update deployment documentation**

Describe `recorded` consistently in the four operations documents: repository record present, filing decision deferred to the operator, and record path supplied to the workflow. Keep `reported` restricted to an actual filed report.

- [ ] **Step 3: Run the focused suite and confirm green**

Run: `npx vitest run src/contentModificationDeployGate.test.ts src/productionSecuritySurface.test.ts`

Expected: both test files pass.

- [ ] **Step 4: Run focused lint and commit**

Run: `npx eslint scripts/validate-content-modification-review.mjs src/contentModificationDeployGate.test.ts src/productionSecuritySurface.test.ts`

Expected: exit 0 with no errors. Commit with `feat: allow recorded content changes in production deploys`.

---

### Task 3: Verify, integrate, and deploy

**Files:**
- Verify all files changed by Tasks 1 and 2

**Interfaces:**
- Consumes: final merged `main` SHA and exact `production-next-<SHA>` artifact
- Produces: production workflow run with `content_modification_status=recorded`

- [ ] **Step 1: Run complete local verification**

Run independently: `npx tsc --noEmit`, `npx eslint .`, `npm test`, `npm run build`, and `git diff --check`. Require exit 0 from each.

- [ ] **Step 2: Push and open a PR to `main`**

Push `release/content-recorded-deploy-20260905`, open the PR, and wait for every required CI lane.

- [ ] **Step 3: Merge and verify the immutable artifact**

Squash-merge only after clean CI. Find the exact `main` push CI by full SHA and require a non-expired `production-next-<SHA>` artifact.

- [ ] **Step 4: Dispatch the production workflow**

Use status `recorded`, record reference `docs/content-modification-records/2026-09-05-unexplored-production.md`, and an empty official report reference. State in the summary that all test-only unexplored content, the Skyward Artillery increase, and the unexplored boss stat increase are promoted while production-only changes are preserved.

- [ ] **Step 5: Verify runtime and preserve maintenance**

Confirm EC2 HEAD and `/api/version` equal the deployed SHA, internal health is HTTP 200 with DB healthy, systemd is active, the public root remains HTTP 503, and maintenance remains on. Do not disable maintenance without a separate explicit request.
