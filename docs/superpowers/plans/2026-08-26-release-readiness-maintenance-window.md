# Release Readiness and Maintenance Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent routine production maintenance from starting before the exact merged `main` artifact is ready, while preserving explicit immediate maintenance and separate maintenance-off approval.

**Architecture:** Keep the existing GitHub Actions and production release sequence because it already verifies and transfers the immutable artifact before maintenance and enables maintenance immediately before the runtime stop. Add the missing operator contract to `AGENTS.md` and lock the end-to-end ordering into the existing production operations surface test.

**Tech Stack:** Markdown operator instructions, Bash release scripts, GitHub Actions YAML, Vitest static operations contract tests.

## Global Constraints

- Do not deploy or change production maintenance state during this implementation.
- Never deploy without an explicit user request.
- Never disable maintenance automatically after deployment or rollback; `bash deploy/maintenance.sh off` still requires a separate explicit user instruction.
- A generic request to enable maintenance and deploy follows the routine just-in-time flow; only an explicit "now" request or an incident permits early maintenance.
- Preserve all unrelated worktree changes and do not spawn subagents.
- No Next.js application code changes are required, so no `node_modules/next/dist/docs/` guide applies to this task.

---

### Task 1: Lock routine maintenance behind release readiness

**Files:**
- Modify: `src/productionSecuritySurface.test.ts:306`
- Modify: `AGENTS.md:7`

**Interfaces:**
- Consumes: the existing `.github/workflows/deploy.yml` step labels `Locate successful main CI artifact`, `Transfer production build to EC2`, and `SSH & deploy [prod]`; the existing `deploy/release-production.sh` production preflight, maintenance-on command, and production stop command.
- Produces: a repository-wide operator contract that distinguishes routine just-in-time maintenance from explicit immediate or incident maintenance.

- [ ] **Step 1: Write the failing operations contract test**

Add this test immediately before the existing maintenance-off approval test in `src/productionSecuritySurface.test.ts`:

```ts
it("일반 배포는 main 산출물 준비 뒤 실제 교체 직전에 점검을 시작한다", () => {
  const instructions = source(join(ROOT, "AGENTS.md"));
  const workflow = source(join(ROOT, ".github/workflows/deploy.yml"));
  const release = source(join(ROOT, "deploy/release-production.sh"));
  const normalizedInstructions = instructions.replace(/\s+/g, " ");

  expect(normalizedInstructions).toContain(
    "정확한 main SHA의 CI와 production-next-<SHA> 산출물이 준비되기 전에는",
  );
  expect(normalizedInstructions).toContain(
    '사용자가 점검 모드를 "지금 바로" 켜라고 명시하거나',
  );
  expect(normalizedInstructions).toContain(
    '일반적인 "점검 모드를 켜고 배포" 요청은 즉시 활성화 지시로 해석하지 않는다.',
  );

  const locateArtifact = workflow.indexOf("Locate successful main CI artifact");
  const transferArtifact = workflow.indexOf("Transfer production build to EC2");
  const deployRuntime = workflow.indexOf("SSH & deploy [prod]");
  expect(locateArtifact).toBeGreaterThan(-1);
  expect(transferArtifact).toBeGreaterThan(locateArtifact);
  expect(deployRuntime).toBeGreaterThan(transferArtifact);

  const productionPreflight = release.indexOf("production env preflight");
  const maintenanceOn = release.indexOf("bash deploy/maintenance.sh on");
  const productionStop = release.indexOf(
    'sudo systemctl stop "$PRODUCTION_SERVICE"',
    maintenanceOn,
  );
  expect(productionPreflight).toBeGreaterThan(-1);
  expect(maintenanceOn).toBeGreaterThan(productionPreflight);
  expect(productionStop).toBeGreaterThan(maintenanceOn);
});
```

This test catches a regression where the repository instructions permit routine maintenance before release readiness or the verified artifact/preflight ordering moves after maintenance and runtime shutdown.

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
npx vitest run src/productionSecuritySurface.test.ts
```

Expected: FAIL because `AGENTS.md` does not yet contain the new readiness and immediate-maintenance distinction. Confirm the workflow and release ordering assertions are not the cause.

- [ ] **Step 3: Add the minimal operator contract**

Insert these bullets under `# 배포` in `AGENTS.md`, after the existing explicit-deploy rule and before the maintenance-off rule:

```md
- 일반 운영 배포에서는 변경 사항을 `main`에 병합하고 정확한 main SHA의 CI와
  `production-next-<SHA>` 산출물이 준비될 때까지 기존 서비스를 유지한다. 정확한 main SHA의
  CI와 production-next-<SHA> 산출물이 준비되기 전에는 별도로
  `bash deploy/maintenance.sh on`을 실행하지 않는다.
- 사용자가 점검 모드를 "지금 바로" 켜라고 명시하거나 서비스 지속이 위험한 장애 상황인
  경우에만 배포 준비 전 점검 모드를 즉시 켠다. 일반적인 "점검 모드를 켜고 배포" 요청은
  즉시 활성화 지시로 해석하지 않는다.
- 준비된 운영 배포는 기존 배포 워크플로가 산출물 검증과 전송을 끝낸 뒤 실제 런타임 교체
  직전에 점검 모드를 켜도록 맡긴다.
```

Do not change `.github/workflows/deploy.yml` or `deploy/release-production.sh`; the new test should confirm their existing ordering already satisfies the contract.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run:

```bash
npx vitest run src/productionSecuritySurface.test.ts
```

Expected: PASS with no warnings or errors.

- [ ] **Step 5: Run static verification**

Run:

```bash
npx eslint src/productionSecuritySurface.test.ts
npx tsc --noEmit
git diff --check
```

Expected: all commands exit 0. Inspect `git diff -- AGENTS.md src/productionSecuritySurface.test.ts` and confirm no deployment workflow or release script changed.

- [ ] **Step 6: Commit only the implementation files**

```bash
git add AGENTS.md src/productionSecuritySurface.test.ts
git commit -m "ops: defer routine maintenance until release ready"
```

Expected: the commit contains only the operator rule and its regression test. Do not stage unrelated UI or worktree files.
