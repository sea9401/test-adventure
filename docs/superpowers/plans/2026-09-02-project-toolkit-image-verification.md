# Project Toolkit Image and Verification Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import approved generated images, maintain exact asset-rights evidence, and run cached fast or authoritative full verification through the toolkit task workflow.

**Architecture:** Image generation remains an operator-reviewed external creative step; the pipeline owns deterministic target mapping, import, optimization, rights-ledger updates, and validation after source files are supplied. Verification composes existing repository commands into a dependency graph whose success is cached by command, environment, and input hashes; only the full graph opens the PR/release gate.

**Tech Stack:** Node.js filesystem and crypto APIs, Sharp through existing image optimizer, existing image/rights scripts, TypeScript, Vitest, Next.js build commands

## Global Constraints

- Complete the core and unexplored-boss adapter plans first.
- Use existing `scripts/optimize-images.mjs`, `check-images.mjs`, and `check-asset-rights.mjs`; do not duplicate their image traversal or hashing rules.
- Never accept image files from network URLs; import only explicit local files supplied to the task.
- Do not declare rights clearance without an `asset-rights` approval recorded for the same task.
- Image paths must come from the validated content spec, not source filenames or directory discovery.
- Visual suitability remains a human decision; failed review pauses at `image-review-required` without automatic regeneration.
- Fast verification is feedback only. Only a current full verification pass permits PR creation or test deployment.
- Full verification uses 4 GiB Node heap for typecheck/build and enables `V2_UNEXPLORED=true` for the relevant build.
- Verification may reuse a result only when command, arguments, selected environment, tool version, and all declared input hashes match.

---

### Task 1: Add image-import commands and manifest validation

**Files:**
- Modify: `toolkit/cli/command.ts`
- Modify: `toolkit/cli/command.test.ts`
- Create: `toolkit/pipelines/images.ts`
- Create: `toolkit/pipelines/images.test.ts`

**Interfaces:**
- Extends `ToolkitCommand` with `{ kind: "images-import"; taskId; sourceDir; dryRun }` and
  `{ kind: "images-review"; taskId; role; decision: "accept" | "reject"; reason; dryRun }`.
- Produces: `planImageImport(context, specs, sourceDir): Promise<readonly ArtifactPlan[]>`.
- Produces: `inspectImageInputs(context, specs, sourceDir): Promise<readonly ImageInspection[]>`.

- [ ] **Step 1: Write failing image mapping tests**

```ts
it("maps each supplied image by declared role rather than discovery order", async () => {
  const plans = await planImageImport(context, imageSpecs(), sourceDir);
  expect(plans.map((plan) => plan.path)).toEqual([
    "public/images/equipment/unexplored-echo-blade.webp",
    "public/images/equipment/unexplored-echo-gloves.webp",
    "public/images/equipment/unexplored-echo-core.webp",
    "public/images/monster/v2/unexplored-boss-echo-warden.webp",
  ]);
});

it("rejects an undeclared extra source file", async () => {
  await writeFile(join(sourceDir, "extra.png"), validPng);
  await expect(planImageImport(context, imageSpecs(), sourceDir))
    .rejects.toThrow("undeclared image input: extra.png");
});
```

- [ ] **Step 2: Run image tests and verify RED**

Run: `npx vitest run toolkit/pipelines/images.test.ts toolkit/cli/command.test.ts`

Expected: FAIL because image import is not implemented.

- [ ] **Step 3: Define explicit source naming**

Require one source file per spec role named `<role>.png` or `<role>.webp`, where roles are `boss`,
`drop-30`, `drop-10`, and `drop-rare`. Reject duplicate extensions for one role, other files, symlinks,
zero-byte files, animated inputs, and decoded dimensions over 4096×4096. Require alpha for equipment when
`requiresAlpha` is true; the boss image may be opaque.

Parse `images review <task-id> --role <role> --decision <accept|reject> --reason <text>` with the same strict
unknown/duplicate flag rules. A review command records only the declared role's content hash, decision,
timestamp, and non-empty reason; changing that image hash invalidates the decision.

- [ ] **Step 4: Implement dry-run-safe import plans**

PNG plans target the declared `.png` path temporarily so the existing optimizer performs conversion and
removal. WebP plans target the declared `.webp` path directly after metadata validation. The plan contains
bytes only; core `fileWriter` owns collision checks and writes.

- [ ] **Step 5: Run image and parser tests**

Run: `npx vitest run toolkit/pipelines/images.test.ts toolkit/cli/command.test.ts`

Expected: PASS for PNG, WebP, alpha, dimension, duplicate role, extra file, symlink, traversal, and dry-run cases.

- [ ] **Step 6: Commit image import planning**

```bash
git add toolkit/cli/command.ts toolkit/cli/command.test.ts toolkit/pipelines/images.ts toolkit/pipelines/images.test.ts
git commit -m "feat: plan toolkit image imports"
```

---

### Task 2: Optimize imported images and preserve resumable state

**Files:**
- Create: `toolkit/pipelines/imageWorkflow.ts`
- Create: `toolkit/pipelines/imageWorkflow.test.ts`
- Modify: `toolkit/core/taskState.ts`
- Modify: `toolkit/cli/runtime.ts`

**Interfaces:**
- Consumes: image plans, core workflow, task state, and command runner.
- Produces: `runImageWorkflow(task, sourceDir, dependencies): Promise<ToolkitTaskState>`.

- [ ] **Step 1: Write a failing workflow-order test**

```ts
it("imports, optimizes, then checks references without repeating unchanged work", async () => {
  const first = await runImageWorkflow(task, sourceDir, fakeDependencies());
  expect(first.steps["images:optimize"].status).toBe("passed");
  expect(fakeRunner.calls.map((call) => call.id)).toEqual([
    "images:optimize", "images:references",
  ]);
  await runImageWorkflow(first, sourceDir, fakeDependencies());
  expect(fakeRunner.calls).toHaveLength(2);
});
```

- [ ] **Step 2: Run the workflow test and verify RED**

Run: `npx vitest run toolkit/pipelines/imageWorkflow.test.ts`

Expected: FAIL because the workflow does not exist.

- [ ] **Step 3: Implement the image step graph**

Apply image artifacts, run `npm run optimize-images`, assert every declared final WebP exists and every
temporary PNG is absent, then run `npm run check-images`. Hash the final WebPs and the optimizer script as
step inputs. If optimization exits nonzero, preserve source hashes and resume from optimization.

- [ ] **Step 4: Add the runtime command handler**

`images-import` requires an existing task whose adapter declares image specs. Dry run prints source-to-target
mapping and planned commands without touching `.toolkit/work`. A real run records `image-review-required`
until all four visual inspections are marked accepted through `images review`; the interactive mode calls
that same command model and has no separate review write path.
Store reviews in task state keyed by image role with final content hash, decision, reason, and timestamp.

- [ ] **Step 5: Run workflow tests**

Run: `npx vitest run toolkit/pipelines/images.test.ts toolkit/pipelines/imageWorkflow.test.ts toolkit/cli/runtime.test.ts`

Expected: PASS for cache hit, changed source invalidation, optimizer failure, missing final WebP, rejected review,
and dry-run no-write cases.

- [ ] **Step 6: Commit the image workflow**

```bash
git add toolkit/pipelines/imageWorkflow.ts toolkit/pipelines/imageWorkflow.test.ts toolkit/core/taskState.ts toolkit/cli/runtime.ts
git commit -m "feat: optimize toolkit image tasks"
```

---

### Task 3: Generate and approve exact asset-rights evidence

**Files:**
- Create: `scripts/asset-rights-lib.mjs`
- Modify: `scripts/check-asset-rights.mjs`
- Create: `toolkit/pipelines/assetRightsLib.test.ts`
- Create: `toolkit/pipelines/assetRights.ts`
- Create: `toolkit/pipelines/assetRights.test.ts`
- Modify: `toolkit/pipelines/imageWorkflow.ts`

**Interfaces:**
- Produces: `planAssetRightsUpdate(context, task, imageHashes): ArtifactPlan`.
- Produces: `assetProvenancePath(task): string`.

- [ ] **Step 1: Write failing rights-approval tests**

```ts
it("refuses to clear assets without same-task rights approval", async () => {
  await expect(planAssetRightsUpdate(context, taskWithoutApproval, hashes))
    .rejects.toThrow("asset-rights approval required");
});

it("adds one sorted ledger entry per final image and one evidence document", async () => {
  const plan = await planAssetRightsUpdate(context, approvedTask, hashes);
  expect(textOf(plan)).toContain("docs/asset-provenance-echo-warden-2026-09-02.md");
  expect(parseLedger(textOf(plan)).assets.filter((a) => a.path.includes("echo"))).toHaveLength(4);
});
```

- [ ] **Step 2: Run rights tests and verify RED**

Run: `npx vitest run toolkit/pipelines/assetRights.test.ts`

Expected: FAIL because rights planning does not exist.

- [ ] **Step 3: Render a deterministic provenance document**

Create `docs/asset-provenance-<kebab-boss-id>-<approval-date>.md` containing task ID, four final paths and
SHA-256 hashes, generator session ownership statement from the recorded approval reason, any declared
repository reference assets, inspection acceptance timestamps, and the exact rights source ID. Do not include
prompt secrets, local temporary paths, or external image URLs.

- [ ] **Step 4: Extract and reuse the existing ledger authority**

Move scanning, source selection, hashing, and deterministic ledger construction into exported functions in
`scripts/asset-rights-lib.mjs`; keep `check-asset-rights.mjs` as a thin CLI with byte-for-byte equivalent output.
The toolkit calls the pure library to build an `ArtifactPlan` rather than letting a command mutate the ledger.
Set `reviewedAt` to the approval date, append the provenance path once to
`operator-cleared-game-art.evidence`, and sort evidence and assets. After the core writer applies both the
provenance and ledger plans atomically, run `npm run check-asset-rights -- --strict`. Reject unknown rights
source, duplicate path with different hash, or changes to assets outside the current task.

- [ ] **Step 5: Run rights tests**

Run: `npx vitest run toolkit/pipelines/assetRightsLib.test.ts toolkit/pipelines/assetRights.test.ts toolkit/pipelines/imageWorkflow.test.ts`

Expected: PASS for approval missing, wrong task, duplicate evidence, changed hash, unrelated ledger delta,
strict-check failure, and resumable success.

- [ ] **Step 6: Commit rights automation**

```bash
git add scripts/asset-rights-lib.mjs scripts/check-asset-rights.mjs toolkit/pipelines/assetRightsLib.test.ts toolkit/pipelines/assetRights.ts toolkit/pipelines/assetRights.test.ts toolkit/pipelines/imageWorkflow.ts
git commit -m "feat: register toolkit image rights evidence"
```

---

### Task 4: Select and cache fast verification checks

**Files:**
- Create: `toolkit/pipelines/verification.ts`
- Create: `toolkit/pipelines/verification.test.ts`
- Create: `toolkit/pipelines/checkCache.ts`
- Create: `toolkit/pipelines/checkCache.test.ts`

**Interfaces:**
- Produces: `selectFastChecks(context, adapter): readonly CheckDefinition[]`.
- Produces: `selectFullChecks(context, adapter): readonly CheckDefinition[]`.
- Produces: `runChecks(task, checks, dependencies): Promise<ToolkitTaskState>`.

- [ ] **Step 1: Write failing selection and cache tests**

```ts
it("adds image checks only when image inputs changed", () => {
  expect(selectFastChecks(context({ changed: ["toolkit/core/taskState.ts"] }), adapter)
    .map((check) => check.id)).not.toContain("images:references");
  expect(selectFastChecks(context({ changed: ["public/images/equipment/new.webp"] }), adapter)
    .map((check) => check.id)).toContain("images:references");
});

it("invalidates a cached check when selected environment changes", () => {
  expect(checkCacheKey(check, inputs, { V2_UNEXPLORED: "true" }))
    .not.toBe(checkCacheKey(check, inputs, { V2_UNEXPLORED: "false" }));
});
```

- [ ] **Step 2: Run verification tests and verify RED**

Run: `npx vitest run toolkit/pipelines/verification.test.ts toolkit/pipelines/checkCache.test.ts`

Expected: FAIL because verification selection and cache do not exist.

- [ ] **Step 3: Implement fast checks from changed paths**

Always run toolkit adapter/schema tests and targeted ESLint. Add affected product Vitest files from the
adapter. Add image and rights checks for visual changes. Add a 10-trial seeded coop-boss simulation only after
the mechanic blocker is absent. Keep a stable, printed reason beside every selected check.

- [ ] **Step 4: Implement the authoritative full graph**

Create checks in this dependency order:

```ts
[
  check("images", "npm", ["run", "check-images"]),
  check("rights", "npm", ["run", "check-asset-rights", "--", "--strict"]),
  check("typecheck", "npx", ["tsc", "--noEmit"], { NODE_OPTIONS: "--max-old-space-size=4096" }),
  check("lint", "npm", ["run", "lint"]),
  check("unit", "npm", ["test"]),
  check("simulation", "npm", ["run", "sim:coop-boss", "--", "--trials=50", "--seed=20260902", `--boss=${bossId}`, "--json"]),
  check("build", "npm", ["run", "build"], { NODE_OPTIONS: "--max-old-space-size=4096", V2_UNEXPLORED: "true" }),
  check("diff", "git", ["diff", "--check"]),
];
```

Run independent checks concurrently only when their `dependsOn` lists are satisfied. Cancel no already-running
check after another fails; collect all independent failures in the same layer.

- [ ] **Step 5: Run verification tests**

Run: `npx vitest run toolkit/pipelines/verification.test.ts toolkit/pipelines/checkCache.test.ts`

Expected: PASS for path selection, dependency order, cache hit, changed source, changed script, changed env,
failure aggregation, blocker, and full-graph completeness.

- [ ] **Step 6: Commit verification selection and caching**

```bash
git add toolkit/pipelines/verification.ts toolkit/pipelines/verification.test.ts toolkit/pipelines/checkCache.ts toolkit/pipelines/checkCache.test.ts
git commit -m "feat: cache toolkit verification checks"
```

---

### Task 5: Connect verification commands and release gates

**Files:**
- Modify: `toolkit/cli/runtime.ts`
- Modify: `toolkit/cli/runtime.test.ts`
- Modify: `toolkit/core/taskState.ts`
- Create: `toolkit/pipelines/verificationIntegration.test.ts`

**Interfaces:**
- Consumes: `verify fast|full` commands from core CLI and verification graph from Task 4.
- Produces: `requireCurrentFullVerification(task, repositoryState): StepState` for Plan 4.

- [ ] **Step 1: Write a failing stale-full-verification test**

```ts
it("blocks release after any tracked input changes", async () => {
  const verified = await runFullVerification(task, fakeDependencies());
  await writeFile(join(root, "src/changed.ts"), "export const changed = true;\n");
  await expect(requireCurrentFullVerification(verified, await repositoryState(root)))
    .rejects.toThrow("full verification is stale");
});
```

- [ ] **Step 2: Run integration tests and verify RED**

Run: `npx vitest run toolkit/pipelines/verificationIntegration.test.ts toolkit/cli/runtime.test.ts`

Expected: FAIL because runtime verification and release gate are not connected.

- [ ] **Step 3: Implement verify runtime handlers**

Fast and full commands print selected checks, reasons, cache hits, elapsed times, and log paths. Dry run prints
the graph without running commands or changing state. A failed check saves every completed sibling and one
resume command.

- [ ] **Step 4: Implement the full-verification release token**

On success, store `fullVerification` with repository HEAD, tracked/untracked planned artifact hashes, spec hash,
check graph hash, completion time, and every check result. `requireCurrentFullVerification` recomputes all of
them and rejects dirty unrelated files, changed planned files, changed HEAD, changed spec, or an incomplete graph.

- [ ] **Step 5: Run the complete image/verification suite**

Run: `npx vitest run toolkit/pipelines toolkit/cli/runtime.test.ts && npx tsc --noEmit && npx eslint toolkit`

Expected: PASS. `npm run toolkit -- verify full <fixture-task> --dry-run` lists all eight authoritative checks
and makes no filesystem change.

- [ ] **Step 6: Commit the completed pipelines**

```bash
git add toolkit/cli/runtime.ts toolkit/cli/runtime.test.ts toolkit/core/taskState.ts toolkit/pipelines
git commit -m "feat: complete toolkit image and verification pipelines"
```
