# Project Toolkit Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable CLI, task-state, artifact-writing, resume, and approval core used by every project toolkit adapter.

**Architecture:** A deterministic non-interactive CLI calls a workflow core through injected filesystem and command-runner boundaries. Adapters return immutable artifact and check plans; the core owns hashes, state persistence, conflict-safe writes, approvals, and resumable step execution. The interactive CLI is a thin wrapper over the same parsed command model.

**Tech Stack:** Node.js 20, TypeScript 5, `tsx` 4.21, `yaml` 2.9.0, Vitest 4.1

## Global Constraints

- Keep versioned implementation under `toolkit/`; keep local task data under ignored `.toolkit/work/`.
- Product runtime code must never import `toolkit/`.
- Every mutating command supports `--dry-run`; dry runs do not write task files, project files, Git, GitHub, or servers.
- The same spec and base SHA must produce an empty second diff.
- Never overwrite a project file changed outside a recorded toolkit-owned artifact.
- Store no tokens, SSH keys, complete environment values, or sensitive command output in task state.
- Local checkpoint commits may follow fast checks; push, PR, merge, and deployment remain separately approval-gated.
- Do not expose `main`, production deployment, maintenance-mode, rollback, or production-server commands.
- Existing user changes and unrelated worktrees must remain untouched.

---

### Task 1: Wire the toolkit entry point and command parser

**Files:**
- Modify: `package.json` scripts and devDependencies
- Modify: `package-lock.json`
- Modify: `vitest.config.ts` test include list
- Modify: `.gitignore` local toolkit state rule
- Create: `toolkit/cli/command.ts`
- Create: `toolkit/cli/command.test.ts`
- Create: `toolkit/cli/index.ts`

**Interfaces:**
- Produces: `parseToolkitCommand(argv: readonly string[]): ToolkitCommand`
- Produces: `ToolkitCommand` discriminated union with `content-create`, `task-resume`, `task-scope-add`,
  `task-approve`, `verify`, `release-pr`, and `release-deploy-test` variants.

- [ ] **Step 1: Add a failing parser test for deterministic commands**

```ts
import { describe, expect, it } from "vitest";
import { parseToolkitCommand } from "./command";

describe("parseToolkitCommand", () => {
  it("parses content creation without inventing defaults", () => {
    expect(parseToolkitCommand([
      "content", "create", "unexplored-boss",
      "--spec", "boss.yaml", "--dry-run",
    ])).toEqual({
      kind: "content-create",
      adapterId: "unexplored-boss",
      specPath: "boss.yaml",
      dryRun: true,
    });
  });

  it("rejects a missing spec path", () => {
    expect(() => parseToolkitCommand([
      "content", "create", "unexplored-boss",
    ])).toThrow("--spec is required");
  });
});
```

- [ ] **Step 2: Run the parser test and verify RED**

Run: `npx vitest run toolkit/cli/command.test.ts`

Expected: FAIL because the toolkit test is not discovered or `parseToolkitCommand` does not exist.

- [ ] **Step 3: Add direct YAML support and toolkit test discovery**

Run: `npm install --save-dev yaml@2.9.0`

Add `"toolkit": "node --import tsx toolkit/cli/index.ts"` to `scripts`. Add
`"toolkit/**/*.test.ts"` to `vitest.config.ts` `test.include`. Add `/.toolkit/work/`
to `.gitignore`.

- [ ] **Step 4: Implement the strict command union and parser**

```ts
export type ToolkitCommand =
  | { kind: "content-create"; adapterId: string; specPath: string; dryRun: boolean }
  | { kind: "task-resume"; taskId: string; dryRun: boolean }
  | { kind: "task-scope-add"; taskId: string; paths: readonly string[]; dryRun: boolean }
  | { kind: "task-approve"; taskId: string; action: string; target: string; reason: string; dryRun: boolean }
  | { kind: "verify"; level: "fast" | "full"; taskId: string; dryRun: boolean }
  | { kind: "release-pr"; taskId: string; dryRun: boolean }
  | { kind: "release-deploy-test"; taskId: string; dryRun: boolean };
```

Parse flags with an index loop, reject duplicate flags, unknown flags, missing values,
empty identifiers, and extra positional arguments. `--dry-run` is the only boolean flag.
`task scope add <task-id> --paths <comma-separated-project-paths>` splits, trims, deduplicates,
and rejects empty path segments.
`toolkit/cli/index.ts` must catch `ToolkitUsageError`, print one concise usage block to
stderr, and set `process.exitCode = 2`.

- [ ] **Step 5: Run the parser tests and typecheck**

Run: `npx vitest run toolkit/cli/command.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit the CLI foundation**

```bash
git add package.json package-lock.json vitest.config.ts .gitignore toolkit/cli
git commit -m "feat: add project toolkit cli foundation"
```

---

### Task 2: Define immutable adapter, artifact, and task-state contracts

**Files:**
- Create: `toolkit/core/adapter.ts`
- Create: `toolkit/core/artifacts.ts`
- Create: `toolkit/core/hashes.ts`
- Create: `toolkit/core/taskState.ts`
- Create: `toolkit/core/taskState.test.ts`
- Create: `toolkit/schemas/task.ts`

**Interfaces:**
- Produces: `ToolkitAdapter<TSpec>`, `AdapterContext`, `ArtifactPlan`, `CheckDefinition`, and `ValidationIssue`.
- Produces: `ToolkitTaskState`, `StepState`, `ArtifactRecord`, `ApprovalRecord`, `ToolkitPhase`, and `ExternalAction`.
- Produces: `sha256Text(value: string): string` and `stableJson(value: unknown): string`.
- Produces: `TaskStateStore.load(taskId)`, `.save(state)`, `.create(input)`, and `.invalidateChangedInputs(state, inputHashes)`.
- Produces: `recordManualPaths(state, projectRoot, paths): Promise<ToolkitTaskState>`.

- [ ] **Step 1: Write failing task-state tests**

```ts
it("invalidates the changed step and every dependent step", () => {
  const state = fixtureState({
    steps: {
      scaffold: passedStep("old-spec", []),
      images: passedStep("same-images", ["scaffold"]),
      verify: passedStep("same-checks", ["scaffold", "images"]),
    },
  });
  const next = invalidateChangedInputs(state, { scaffold: "new-spec" });
  expect(next.steps.scaffold.status).toBe("pending");
  expect(next.steps.images.status).toBe("pending");
  expect(next.steps.verify.status).toBe("pending");
});

it("rejects path traversal in task ids", async () => {
  await expect(store.load("../outside")).rejects.toThrow("invalid task id");
});
```

- [ ] **Step 2: Run the state test and verify RED**

Run: `npx vitest run toolkit/core/taskState.test.ts`

Expected: FAIL because the state contracts and store do not exist.

- [ ] **Step 3: Define the cross-plan contracts exactly once**

```ts
export type ExternalAction =
  | "asset-rights"
  | "push"
  | "pr"
  | "merge-staging"
  | "deploy-test";

export type ArtifactPlan = {
  scope: "project" | "task";
  path: string;
  operation: "create" | "replace-owned";
  content: string | Uint8Array;
  ownershipKey?: string;
};

export type CheckDefinition = {
  id: string;
  command: string;
  args: readonly string[];
  env?: Readonly<Record<string, string>>;
  dependsOn: readonly string[];
};

export type ToolkitAdapter<TSpec> = {
  id: string;
  specVersion: number;
  parseSpec(input: unknown): TSpec;
  plan(context: AdapterContext, spec: TSpec): Promise<readonly ArtifactPlan[]>;
  validateGenerated(context: AdapterContext, spec: TSpec): Promise<readonly ValidationIssue[]>;
  selectFastChecks(context: AdapterContext, spec: TSpec): readonly CheckDefinition[];
  selectFullChecks(context: AdapterContext, spec: TSpec): readonly CheckDefinition[];
};
```

Use only JSON-serializable values in `ToolkitTaskState`. Represent timestamps as ISO strings,
store long log file paths and hashes instead of full output, and validate `schemaVersion === 1`.
Store `manualPaths` as sorted unique project-relative paths. Reject absolute paths, traversal, `.git`,
`.toolkit`, `node_modules`, build output, nonexistent parent directories, and paths outside `src`, `scripts`,
`public`, `docs`, or root configuration files explicitly allowlisted by the adapter.

- [ ] **Step 4: Implement stable hashing and state persistence**

Sort object keys recursively in `stableJson`; preserve array order; reject `undefined`, functions,
symbols, non-finite numbers, and cyclic objects. Write state through a sibling temporary file and
`rename`. Validate task IDs with `/^[a-z0-9][a-z0-9-]{2,63}$/` before joining paths.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npx vitest run toolkit/core/taskState.test.ts && npx tsc --noEmit`

Expected: PASS, including corrupt JSON, unsupported schema, traversal, stable hash, and dependency invalidation cases.

- [ ] **Step 6: Commit the task-state contracts**

```bash
git add toolkit/core toolkit/schemas
git commit -m "feat: persist resumable toolkit task state"
```

---

### Task 3: Add conflict-safe, idempotent artifact writes

**Files:**
- Create: `toolkit/core/fileWriter.ts`
- Create: `toolkit/core/fileWriter.test.ts`
- Create: `toolkit/testing/fixtureWorkspace.ts`

**Interfaces:**
- Consumes: `ArtifactPlan`, `ArtifactRecord`, and `sha256Text` from Task 2.
- Produces: `planArtifactWrites(root, plans, previous): Promise<ArtifactWritePreview>`.
- Produces: `applyArtifactWrites(root, preview): Promise<readonly ArtifactRecord[]>`.

- [ ] **Step 1: Write failing idempotency and conflict tests**

```ts
it("returns an empty second write plan", async () => {
  const first = await planArtifactWrites(root, [createText("generated.ts", "export const n = 1;\n")], []);
  const records = await applyArtifactWrites(root, first);
  const second = await planArtifactWrites(root, first.plans, records);
  expect(second.changes).toEqual([]);
});

it("refuses to overwrite a user-edited generated file", async () => {
  const records = await seedGeneratedFile(root, "generated.ts", "first\n");
  await writeFile(join(root, "generated.ts"), "user edit\n");
  await expect(planArtifactWrites(root, [createText("generated.ts", "second\n")], records))
    .rejects.toThrow("generated.ts changed outside toolkit ownership");
});
```

- [ ] **Step 2: Run the writer test and verify RED**

Run: `npx vitest run toolkit/core/fileWriter.test.ts`

Expected: FAIL because the writer does not exist.

- [ ] **Step 3: Implement path and ownership validation**

Resolve every artifact against the supplied project root and reject absolute paths, `..`, symlink
escapes, duplicate target paths within a scope, and `replace-owned` without an ownership key. Resolve
`project` against the repository root and `task` against `.toolkit/work/<task-id>`; a task-scoped path can
never be staged or treated as a manual project path. A recorded artifact
may be replaced only when its current hash equals `ArtifactRecord.outputHash` and ownership keys match.

- [ ] **Step 4: Implement all-or-nothing writes**

Build every output in memory, verify every conflict before writing, create sibling files named
`.toolkit-<taskId>-<basename>.tmp`, fsync and rename them. If any rename fails, restore previously
existing bytes from the preview snapshot and remove only temporary files created by this call.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run toolkit/core/fileWriter.test.ts`

Expected: PASS for create, empty second plan, user edit, symlink escape, duplicate path, dry preview,
binary content, and simulated mid-apply failure rollback.

- [ ] **Step 6: Commit artifact writing**

```bash
git add toolkit/core/fileWriter.ts toolkit/core/fileWriter.test.ts toolkit/testing/fixtureWorkspace.ts
git commit -m "feat: write toolkit artifacts safely"
```

---

### Task 4: Add injected command execution and resumable workflow steps

**Files:**
- Create: `toolkit/core/commandRunner.ts`
- Create: `toolkit/core/commandRunner.test.ts`
- Create: `toolkit/core/workflow.ts`
- Create: `toolkit/core/workflow.test.ts`
- Create: `toolkit/core/adapterRegistry.ts`

**Interfaces:**
- Consumes: state and adapter contracts from Task 2 and artifact writer from Task 3.
- Produces: `CommandRunner.run(request): Promise<CommandResult>`.
- Produces: `runWorkflowStep(context, definition): Promise<ToolkitTaskState>`.
- Produces: `AdapterRegistry.register(adapter)` and `.require(adapterId)`.

- [ ] **Step 1: Write failing resume tests with a fake runner**

```ts
it("resumes from the failed step without rerunning a valid predecessor", async () => {
  const runner = new FakeCommandRunner()
    .succeed("schema")
    .fail("verify", 1)
    .succeed("verify");
  const first = await workflow.run(task, runner);
  expect(first.steps.schema.attempts).toBe(1);
  expect(first.steps.verify.status).toBe("failed");
  const resumed = await workflow.resume(first, runner);
  expect(resumed.steps.schema.attempts).toBe(1);
  expect(resumed.steps.verify.attempts).toBe(2);
  expect(resumed.steps.verify.status).toBe("passed");
});
```

- [ ] **Step 2: Run workflow tests and verify RED**

Run: `npx vitest run toolkit/core/commandRunner.test.ts toolkit/core/workflow.test.ts`

Expected: FAIL because command execution and workflow orchestration do not exist.

- [ ] **Step 3: Implement the real and fake command runners**

Use `spawn` with `shell: false`, an explicit argument array, project-root cwd, and a minimal inherited
environment plus `CheckDefinition.env`. Stream stdout/stderr to a task log file while retaining at most
the last 200 sanitized lines for error summaries. Never interpolate command strings through a shell.

- [ ] **Step 4: Implement step lifecycle and adapter registry**

Persist `running` before invoking a step; persist `passed` or `failed` after completion. A stale `running`
step becomes `pending` on load. Reuse `passed` only when input and output hashes still match. Reject duplicate
adapter IDs and mismatched `specVersion`.

- [ ] **Step 5: Run workflow tests**

Run: `npx vitest run toolkit/core/commandRunner.test.ts toolkit/core/workflow.test.ts`

Expected: PASS for success, exit failure, spawn failure, output sanitization, interruption recovery,
dependency order, cached pass, and duplicate adapter cases.

- [ ] **Step 6: Commit workflow execution**

```bash
git add toolkit/core/commandRunner.ts toolkit/core/commandRunner.test.ts toolkit/core/workflow.ts toolkit/core/workflow.test.ts toolkit/core/adapterRegistry.ts
git commit -m "feat: resume toolkit workflow steps"
```

---

### Task 5: Record scoped approvals and expose core CLI commands

**Files:**
- Create: `toolkit/core/approvals.ts`
- Create: `toolkit/core/approvals.test.ts`
- Create: `toolkit/core/specFile.ts`
- Create: `toolkit/cli/runtime.ts`
- Create: `toolkit/cli/runtime.test.ts`
- Modify: `toolkit/cli/index.ts`

**Interfaces:**
- Produces: `recordApproval(state, request): ToolkitTaskState`.
- Produces: `requireApproval(state, action, target): ApprovalRecord`.
- Produces: `loadYamlSpec(path): Promise<unknown>`.
- Produces: `executeToolkitCommand(command, dependencies): Promise<number>`.

- [ ] **Step 1: Write failing approval-scope tests**

```ts
it("lets a staging deploy approval cover only its required staging actions", () => {
  const approved = recordApproval(state, {
    action: "deploy-test",
    target: "staging",
    reason: "사용자가 테스트 서버 배포를 명시적으로 요청함",
    approvedAt: "2026-09-02T00:00:00.000Z",
  });
  expect(requireApproval(approved, "push", "staging")).toBeDefined();
  expect(requireApproval(approved, "pr", "staging")).toBeDefined();
  expect(requireApproval(approved, "merge-staging", "staging")).toBeDefined();
  expect(() => requireApproval(approved, "deploy-test", "production"))
    .toThrow("approval does not cover production");
});
```

- [ ] **Step 2: Run approval tests and verify RED**

Run: `npx vitest run toolkit/core/approvals.test.ts toolkit/cli/runtime.test.ts`

Expected: FAIL because approval and runtime modules do not exist.

- [ ] **Step 3: Implement exact approval implications**

`deploy-test@staging` implies `push@staging`, `pr@staging`, `merge-staging@staging`, and
`deploy-test@staging` for the same task only. `pr@staging` implies only `push@staging` and
`pr@staging`. `asset-rights` covers only its own task assets. No action implies a production target.
Reject empty reasons and timestamps more than five minutes in the future.

- [ ] **Step 4: Implement YAML loading and core command dispatch**

Use `yaml.parseDocument` with unique keys required. Reject aliases, merge keys, custom tags, parse warnings,
and more than 200 aliases. `content-create` loads the adapter, parses its spec, creates task state, previews
artifacts, and applies only when not dry-run. `task-resume` reloads state and invokes workflow resume.
`task-scope-add` records local manual-edit scope without granting generated-file ownership.
Release variants return a usage error until Plan 4 registers their pipeline handlers.

- [ ] **Step 5: Run focused tests and a CLI smoke test**

Run: `npx vitest run toolkit/core/approvals.test.ts toolkit/cli/runtime.test.ts && npm run toolkit -- --help`

Expected: PASS; help lists no production command.

- [ ] **Step 6: Commit approvals and runtime dispatch**

```bash
git add toolkit/core/approvals.ts toolkit/core/approvals.test.ts toolkit/core/specFile.ts toolkit/cli
git commit -m "feat: gate toolkit external actions"
```

---

### Task 6: Add the interactive wrapper and core integration gate

**Files:**
- Create: `toolkit/cli/interactive.ts`
- Create: `toolkit/cli/interactive.test.ts`
- Create: `toolkit/core/coreIntegration.test.ts`
- Modify: `toolkit/cli/index.ts`

**Interfaces:**
- Consumes: `ToolkitCommand` and `executeToolkitCommand` from earlier tasks.
- Produces: `promptForToolkitCommand(io): Promise<ToolkitCommand | null>`.

- [ ] **Step 1: Write a failing scripted-interaction test**

```ts
it("maps guided answers to the same deterministic command", async () => {
  const command = await promptForToolkitCommand(scriptedIo([
    "콘텐츠 생성", "미개척지 개인 보스", "boss.yaml", "dry-run",
  ]));
  expect(command).toEqual({
    kind: "content-create",
    adapterId: "unexplored-boss",
    specPath: "boss.yaml",
    dryRun: true,
  });
});
```

- [ ] **Step 2: Run the interaction test and verify RED**

Run: `npx vitest run toolkit/cli/interactive.test.ts toolkit/core/coreIntegration.test.ts`

Expected: FAIL because the interactive wrapper does not exist.

- [ ] **Step 3: Implement a thin interactive wrapper**

Use `node:readline/promises`; present only commands registered in the runtime; always display target and
dry-run state before returning. EOF or `취소` returns `null` without creating task state. Do not prompt in
CI or when positional CLI arguments were supplied.

- [ ] **Step 4: Add end-to-end fixture tests**

Create a fake adapter that emits one file and one check. Assert create, apply, empty second diff, external
user edit conflict, failed check, resume, approval record, and secret redaction through the public runtime.

- [ ] **Step 5: Run the core plan verification**

Run: `npx vitest run toolkit && npx tsc --noEmit && npx eslint toolkit vitest.config.ts`

Expected: PASS with no project-runtime import of `toolkit/` and no production command in CLI help.

- [ ] **Step 6: Commit the completed core**

```bash
git add toolkit package.json package-lock.json vitest.config.ts .gitignore
git commit -m "feat: complete reusable project toolkit core"
```
