# Project Toolkit Staging Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely automate approved branch push, staging PR, CI tracking, squash merge, test-server deployment tracking, and exact public SHA verification.

**Architecture:** A release state machine consumes a current full-verification token and same-task staging approval. Git operations and `gh` calls sit behind injected clients, persist every external ID before advancing, and resume by querying existing state rather than repeating mutations. Deployment success requires both the staging workflow and independent public health/version verification for the exact merged SHA.

**Tech Stack:** Git CLI, GitHub CLI, GitHub Actions, Node.js 20 fetch, Vitest fake clients, existing `deploy-staging.yml`

## Global Constraints

- Complete the core, unexplored-boss adapter, and image/verification plans first.
- A test deployment approval covers only the same task's push, staging PR, staging squash merge, and test deployment.
- Never create, update, merge, or deploy a PR whose base is `main`.
- Do not expose or invoke production deployment workflows, production hosts, maintenance mode, rollback, or `deploy.yml`.
- Require a current full-verification token before push, PR, merge, or deployment.
- Never use `gh pr merge --delete-branch`; linked worktrees may still own the local branch.
- Resolve and persist the full 40-character `origin/staging` SHA after merge.
- Treat workflow display `headSha` as non-authoritative for `workflow_run`; final success requires `/api/version.buildId` to equal the persisted staging SHA.
- Persist IDs and results after every external mutation so resume never creates duplicate branches, PRs, merges, or deployments.
- Any failure pauses the task. Do not auto-rerun CI, choose another SHA, force merge, or fall through to production.

---

### Task 1: Model and validate repository release state

**Files:**
- Create: `toolkit/pipelines/git.ts`
- Create: `toolkit/pipelines/git.test.ts`
- Create: `toolkit/pipelines/releaseState.ts`
- Create: `toolkit/pipelines/releaseState.test.ts`
- Modify: `toolkit/cli/command.ts`
- Modify: `toolkit/cli/command.test.ts`
- Modify: `toolkit/cli/runtime.ts`

**Interfaces:**
- Produces: `GitClient` and `CliGitClient`.
- Produces: `readRepositoryState(root): Promise<RepositoryState>`.
- Produces: `validateReleaseRepository(task, repo): void`.
- Produces: `StagingReleaseState` and `nextReleasePhase(state, event)`.
- Extends `ToolkitCommand` with `{ kind: "task-checkpoint"; taskId; message; dryRun }`.

- [ ] **Step 1: Write failing repository guard tests**

```ts
it("rejects a main branch and unrelated dirty paths", async () => {
  expect(() => validateReleaseRepository(task, {
    branch: "main",
    headSha: forty("a"),
    upstream: "origin/main",
    changedPaths: [],
  })).toThrow("release branch must not be main");

  expect(() => validateReleaseRepository(task, {
    branch: "feat/echo-warden",
    headSha: forty("b"),
    upstream: null,
    changedPaths: ["notes/private.txt"],
  })).toThrow("unplanned changed path: notes/private.txt");
});
```

- [ ] **Step 2: Run repository tests and verify RED**

Run: `npx vitest run toolkit/pipelines/git.test.ts toolkit/pipelines/releaseState.test.ts`

Expected: FAIL because Git and release-state modules do not exist.

- [ ] **Step 3: Implement shell-free Git queries**

Invoke `git` with explicit argument arrays for `status --porcelain=v2 -z --branch`, `rev-parse HEAD`,
`rev-parse --abbrev-ref --symbolic-full-name @{upstream}`, and `diff --name-only`. Parse NUL-delimited status;
reject detached HEAD, branch `main` or `staging`, merge/rebase/cherry-pick state, unmerged entries, missing commits,
and changed paths not recorded in task artifacts.

Parse `task checkpoint <task-id> --message <text>`. Require a current successful fast verification, stage only
changed task artifact paths and `manualPaths` with `git add -- <exact-paths>`, compare
`git diff --cached --name-only` with that allowlist, run `git diff --cached --check`, commit the supplied
non-empty message, and record the resulting full SHA. Dry run prints the exact stage set and commit message
without calling Git.

- [ ] **Step 4: Implement the release phase reducer**

Use these monotonic phases: `verified`, `pushed`, `pr-open`, `pr-ci-passed`, `merged-staging`,
`staging-ci-passed`, `deploy-passed`, `public-verified`. Accept only the next valid event, but treat a repeated
event with the same ID and SHA as idempotent. Reject a repeated event with different external data.

- [ ] **Step 5: Run repository and reducer tests**

Run: `npx vitest run toolkit/pipelines/git.test.ts toolkit/pipelines/releaseState.test.ts`

Expected: PASS for clean, planned dirty, main, staging, detached, unmerged, no upstream, idempotent event,
out-of-order event, and conflicting repeated event cases.

- [ ] **Step 6: Commit release state foundations**

```bash
git add toolkit/pipelines/git.ts toolkit/pipelines/git.test.ts toolkit/pipelines/releaseState.ts toolkit/pipelines/releaseState.test.ts
git add toolkit/cli/command.ts toolkit/cli/command.test.ts toolkit/cli/runtime.ts
git commit -m "feat: guard toolkit staging releases"
```

---

### Task 2: Push once and create or recover the staging PR

**Files:**
- Create: `toolkit/pipelines/github.ts`
- Create: `toolkit/pipelines/github.test.ts`
- Create: `toolkit/pipelines/stagingRelease.ts`
- Create: `toolkit/pipelines/stagingRelease.test.ts`

**Interfaces:**
- Produces: `GitHubClient` and `GhCliClient`.
- Produces: `pushVerifiedBranch(context): Promise<PushResult>`.
- Produces: `ensureStagingPullRequest(context): Promise<PullRequestRef>`.

- [ ] **Step 1: Write failing duplicate-prevention tests**

```ts
it("recovers the existing head PR instead of creating another", async () => {
  github.findPullRequest.mockResolvedValue({
    number: 2501, state: "OPEN", baseRefName: "staging", headRefName: "feat/echo-warden",
    url: "https://github.com/sea9401/test-adventure/pull/2501",
  });
  const pr = await ensureStagingPullRequest(context);
  expect(pr.number).toBe(2501);
  expect(github.createPullRequest).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run GitHub tests and verify RED**

Run: `npx vitest run toolkit/pipelines/github.test.ts toolkit/pipelines/stagingRelease.test.ts`

Expected: FAIL because GitHub and staging release clients do not exist.

- [ ] **Step 3: Implement the typed `gh` JSON boundary**

Run `gh pr list/view/create`, `gh run list/view`, and `gh pr merge` through `CommandRunner`. Validate every
JSON response with local guards: positive integer IDs, HTTPS github.com URLs, known enum strings, full SHA
where authoritative, and exact base/head refs. Reject non-JSON stdout and missing fields.

- [ ] **Step 4: Implement approval-gated push and PR creation**

Before push, call `requireCurrentFullVerification`, `requireApproval(task, "push", "staging")`, and repository
guards. Require a clean worktree so every verified change is present in HEAD. Push
`HEAD:refs/heads/<current-branch>` with `git push -u origin`. Before creating, query an existing
open or merged PR by exact head branch; require base `staging`. Create with title from task content name and a
body containing spec hash, verified HEAD SHA, check summary, image paths, and explicit test-only scope.

- [ ] **Step 5: Run GitHub and staging release tests**

Run: `npx vitest run toolkit/pipelines/github.test.ts toolkit/pipelines/stagingRelease.test.ts`

Expected: PASS for missing approval, stale verification, push failure, existing PR, wrong base, duplicate PR,
malformed JSON, and successful creation. Assert task state persists the push SHA before PR creation.

- [ ] **Step 6: Commit push and PR automation**

```bash
git add toolkit/pipelines/github.ts toolkit/pipelines/github.test.ts toolkit/pipelines/stagingRelease.ts toolkit/pipelines/stagingRelease.test.ts
git commit -m "feat: create toolkit staging pull requests"
```

---

### Task 3: Track required PR and staging CI checks

**Files:**
- Create: `toolkit/pipelines/ciWatcher.ts`
- Create: `toolkit/pipelines/ciWatcher.test.ts`
- Modify: `toolkit/pipelines/stagingRelease.ts`
- Modify: `toolkit/pipelines/stagingRelease.test.ts`

**Interfaces:**
- Produces: `waitForPullRequestChecks(prNumber, options): Promise<CiResult>`.
- Produces: `waitForCommitCi(sha, options): Promise<CiResult>`.

- [ ] **Step 1: Write failing poll-state tests**

```ts
it("waits through pending and requires the aggregate check success", async () => {
  github.pullRequestChecks
    .mockResolvedValueOnce(checks({ check: "PENDING", unit: "SUCCESS" }))
    .mockResolvedValueOnce(checks({ check: "SUCCESS", unit: "SUCCESS" }));
  const result = await waitForPullRequestChecks(2501, fastPollOptions());
  expect(result.aggregateName).toBe("check");
  expect(result.conclusion).toBe("success");
});

it("fails immediately on a completed failed required check", async () => {
  github.pullRequestChecks.mockResolvedValue(checks({ check: "FAILURE" }));
  await expect(waitForPullRequestChecks(2501, fastPollOptions()))
    .rejects.toThrow("required check failed: check");
});
```

- [ ] **Step 2: Run watcher tests and verify RED**

Run: `npx vitest run toolkit/pipelines/ciWatcher.test.ts`

Expected: FAIL because the watcher does not exist.

- [ ] **Step 3: Implement bounded polling and state persistence**

Poll every 10 seconds with an injected clock, a 30-minute timeout, and abort-signal support. Persist run IDs
and last known checks after each changed response. Require the aggregate `check` job to complete successfully;
also reject any completed failure, cancelled, timed-out, action-required, or startup-failure check.

- [ ] **Step 4: Implement exact commit CI lookup**

Call `gh run list --commit <sha> --workflow CI --json databaseId,status,conclusion,headSha,url --limit 10`.
Require one run with exact `headSha`; if several attempts exist, choose the newest non-obsolete attempt and
persist its ID. Never substitute the current branch HEAD or newest repository run.

- [ ] **Step 5: Run watcher tests**

Run: `npx vitest run toolkit/pipelines/ciWatcher.test.ts toolkit/pipelines/stagingRelease.test.ts`

Expected: PASS for pending, success, failure, cancellation, timeout, abort, run retry, wrong SHA, no run yet,
and resume from persisted run ID.

- [ ] **Step 6: Commit CI tracking**

```bash
git add toolkit/pipelines/ciWatcher.ts toolkit/pipelines/ciWatcher.test.ts toolkit/pipelines/stagingRelease.ts toolkit/pipelines/stagingRelease.test.ts
git commit -m "feat: track toolkit staging ci"
```

---

### Task 4: Squash merge to staging and identify the triggered deploy run

**Files:**
- Create: `toolkit/pipelines/deployWatcher.ts`
- Create: `toolkit/pipelines/deployWatcher.test.ts`
- Modify: `toolkit/pipelines/stagingRelease.ts`
- Modify: `toolkit/pipelines/stagingRelease.test.ts`

**Interfaces:**
- Produces: `mergePullRequestToStaging(context): Promise<MergedStagingRef>`.
- Produces: `waitForStagingDeploy(context, merged): Promise<DeployResult>`.

- [ ] **Step 1: Write failing merge and deploy-correlation tests**

```ts
it("uses squash merge without local branch deletion", async () => {
  await mergePullRequestToStaging(context);
  expect(github.mergePullRequest).toHaveBeenCalledWith(2501, {
    method: "squash",
    deleteBranch: false,
  });
});

it("ignores deploy runs that predate the exact staging CI", async () => {
  const result = await waitForStagingDeploy(context, mergedFixture());
  expect(result.runId).toBe(9002);
  expect(result.createdAt > context.stagingCiCompletedAt).toBe(true);
});
```

- [ ] **Step 2: Run deploy watcher tests and verify RED**

Run: `npx vitest run toolkit/pipelines/deployWatcher.test.ts toolkit/pipelines/stagingRelease.test.ts`

Expected: FAIL because merge and deployment tracking do not exist.

- [ ] **Step 3: Implement staging-only squash merge**

Re-read PR base, head, state, mergeability, and checks immediately before mutation. Require
`merge-staging@staging` approval. Invoke `gh pr merge <number> --squash` without branch deletion. If the call
returns nonzero, query PR state before deciding failure because GitHub may have merged before a local cleanup
error. Persist the PR merge commit from `gh pr view --json state,mergedAt,mergeCommit,baseRefName`.

- [ ] **Step 4: Resolve authoritative staging SHA and CI**

Run `git fetch origin staging`, then `git rev-parse origin/staging`. Require the full SHA to equal the PR merge
commit and record it. Start exact commit CI tracking from Task 3. Before waiting for CI, record the highest
existing `deploy-staging.yml` workflow-run database ID as the deploy baseline.

- [ ] **Step 5: Correlate and watch deployment candidates**

After staging CI succeeds, list `deploy-staging.yml` workflow runs with event `workflow_run`. Candidates must
have an ID above the baseline and `createdAt >= stagingCiCompletedAt`. Poll the oldest candidate first with a
40-minute timeout. A failed candidate stops the task; multiple candidates are recorded rather than silently
choosing the newest. Workflow `headSha` is informational only and is not compared with the staging SHA.

- [ ] **Step 6: Run deploy watcher tests and commit**

Run: `npx vitest run toolkit/pipelines/deployWatcher.test.ts toolkit/pipelines/stagingRelease.test.ts`

Expected: PASS for already merged, merge failure, merge cleanup error after success, wrong base, changed SHA,
stale deploy run, multiple candidates, queued run, deploy failure, timeout, and resume.

```bash
git add toolkit/pipelines/deployWatcher.ts toolkit/pipelines/deployWatcher.test.ts toolkit/pipelines/stagingRelease.ts toolkit/pipelines/stagingRelease.test.ts
git commit -m "feat: track toolkit test deployments"
```

---

### Task 5: Verify the public test surface and exact build ID

**Files:**
- Create: `toolkit/pipelines/publicVerification.ts`
- Create: `toolkit/pipelines/publicVerification.test.ts`
- Modify: `toolkit/pipelines/stagingRelease.ts`
- Modify: `toolkit/pipelines/stagingRelease.test.ts`

**Interfaces:**
- Produces: `verifyTestDeployment(expectedSha, dependencies): Promise<PublicVerificationResult>`.

- [ ] **Step 1: Write failing public verification tests**

```ts
it("requires healthy app, healthy db, and the exact full SHA", async () => {
  fetchJson
    .mockResolvedValueOnce({ ok: true, db: "ok", ms: 23, time: 1 })
    .mockResolvedValueOnce({ buildId: forty("c") });
  await expect(verifyTestDeployment(forty("c"), dependencies))
    .resolves.toMatchObject({ ok: true, buildId: forty("c") });
});

it("rejects a healthy deployment of another SHA", async () => {
  fetchJson
    .mockResolvedValueOnce({ ok: true, db: "ok" })
    .mockResolvedValueOnce({ buildId: forty("d") });
  await expect(verifyTestDeployment(forty("c"), dependencies))
    .rejects.toThrow("test buildId does not match staging SHA");
});
```

- [ ] **Step 2: Run public verification tests and verify RED**

Run: `npx vitest run toolkit/pipelines/publicVerification.test.ts`

Expected: FAIL because public verification does not exist.

- [ ] **Step 3: Implement allowlisted HTTPS fetches**

Allow only exact URLs `https://test.msmsge.com/api/health` and `/api/version`; reject redirects, non-HTTPS,
non-2xx responses, bodies over 64 KiB, invalid JSON, unknown response types, and requests over 10 seconds.
Retry transient network/5xx failures every 5 seconds for at most 5 minutes; do not retry malformed success JSON.

- [ ] **Step 4: Validate health and version independently**

Require `health.ok === true`, `health.db === "ok"`, and `version.buildId === expectedSha` with a lowercase
40-character hex SHA. Save latency, response time, expected SHA, observed SHA, and verification time, but not
headers or cookies.

- [ ] **Step 5: Run public and staging release tests**

Run: `npx vitest run toolkit/pipelines/publicVerification.test.ts toolkit/pipelines/stagingRelease.test.ts`

Expected: PASS for healthy, DB failure, wrong SHA, redirect, oversized body, invalid JSON, transient retry,
timeout, and exact URL allowlist cases.

- [ ] **Step 6: Commit public deployment verification**

```bash
git add toolkit/pipelines/publicVerification.ts toolkit/pipelines/publicVerification.test.ts toolkit/pipelines/stagingRelease.ts toolkit/pipelines/stagingRelease.test.ts
git commit -m "feat: verify toolkit test deployment sha"
```

---

### Task 6: Connect resumable release commands and enforce policy end to end

**Files:**
- Modify: `toolkit/cli/runtime.ts`
- Modify: `toolkit/cli/runtime.test.ts`
- Modify: `toolkit/core/taskState.ts`
- Create: `toolkit/pipelines/stagingReleaseIntegration.test.ts`
- Modify: `docs/staging-release-flow.md`

**Interfaces:**
- Consumes: `release pr` and `release deploy-test` commands.
- Produces: `runStagingRelease(taskId, targetPhase, dependencies): Promise<ToolkitTaskState>`.

- [ ] **Step 1: Write a failing full resume test**

```ts
it("resumes after interruption without repeating external mutations", async () => {
  const interrupted = await integration.runUntil("staging-ci-passed");
  expect(interrupted.external.prNumber).toBe(2501);
  const completed = await integration.resume(interrupted);
  expect(github.createPullRequest).toHaveBeenCalledTimes(1);
  expect(github.mergePullRequest).toHaveBeenCalledTimes(1);
  expect(completed.release.phase).toBe("public-verified");
  expect(completed.external.deployedSha).toBe(completed.external.stagingSha);
});
```

- [ ] **Step 2: Run integration tests and verify RED**

Run: `npx vitest run toolkit/pipelines/stagingReleaseIntegration.test.ts toolkit/cli/runtime.test.ts`

Expected: FAIL because release commands are not connected.

- [ ] **Step 3: Implement target-phase execution**

`release pr` advances through `pr-open` and stops without merge. `release deploy-test` advances through
`public-verified`. Before every resumed phase, re-query the external resource named in state and verify its
task branch, PR number, base, SHA, or run ID still matches. Persist phase success immediately.

- [ ] **Step 4: Add hard policy rejection tests**

Assert no public API accepts target `main`, `production`, workflow `deploy.yml`, production hostname, a
maintenance command, force merge, or branch deletion. Scan toolkit source in the test and permit the words
only in rejection messages and tests, never executable command definitions.

- [ ] **Step 5: Document operator behavior and run the release suite**

Add a project-toolkit subsection to `docs/staging-release-flow.md` with dry-run, approval recording, PR-only,
test-deploy, resume, and state-inspection commands. State that production remains outside the toolkit.

Run: `npx vitest run toolkit && npx tsc --noEmit && npx eslint toolkit`

Expected: PASS. Fake-client integration reaches exact public SHA, resumes every phase, and performs each
external mutation once.

- [ ] **Step 6: Run the complete non-deploy verification**

Run: `npm run toolkit -- --help`

Run: `npm run toolkit -- content create unexplored-boss --spec toolkit/testing/fixtures/specs/unexplored-boss.yaml --dry-run`

Run: `npm run check-images && npm run check-asset-rights && npx tsc --noEmit && npm test`

Expected: All commands PASS; help exposes only test staging release; dry run leaves `git status --short`
unchanged. Do not run a real push, PR, merge, or deployment for this verification.

- [ ] **Step 7: Commit the completed staging release pipeline**

```bash
git add toolkit/cli/runtime.ts toolkit/cli/runtime.test.ts toolkit/core/taskState.ts toolkit/pipelines/stagingReleaseIntegration.test.ts docs/staging-release-flow.md
git commit -m "feat: complete toolkit staging release workflow"
```
