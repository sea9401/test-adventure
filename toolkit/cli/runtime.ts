import { isAbsolute, relative, resolve } from "node:path";

import { unexploredBossAdapter } from "../adapters/unexplored-boss/adapter";
import type { AdapterContext, ValidationIssue } from "../core/adapter";
import { AdapterRegistry } from "../core/adapterRegistry";
import { recordApproval } from "../core/approvals";
import type { CommandRunnerLike } from "../core/commandRunner";
import {
  applyArtifactWrites,
  planArtifactWrites,
  verifyArtifactRecords,
} from "../core/fileWriter";
import { sha256Text, stableJson } from "../core/hashes";
import { loadYamlSpec } from "../core/specFile";
import { recordManualPaths, TaskStateStore } from "../core/taskState";
import { runChecks } from "../pipelines/checkCache";
import {
  recordImageReview,
  runImageWorkflow,
} from "../pipelines/imageWorkflow";
import { inspectImageInputs } from "../pipelines/images";
import {
  recordFullVerification,
  repositoryState,
  selectFastChecks,
  selectFullChecks,
  verificationGraphHash,
  type RepositoryState,
  type RepositoryStateOptions,
} from "../pipelines/verification";
import type {
  ExternalAction,
  ToolkitTaskState,
} from "../schemas/task";
import { ToolkitUsageError, type ToolkitCommand } from "./command";

const EXTERNAL_ACTIONS: readonly ExternalAction[] = [
  "asset-rights",
  "push",
  "pr",
  "merge-staging",
  "deploy-test",
];

export type ReleaseHandlers = {
  pr?(taskId: string, dryRun: boolean): Promise<number>;
  deployTest?(taskId: string, dryRun: boolean): Promise<number>;
};

export type ToolkitRuntimeDependencies = {
  projectRoot: string;
  registry: AdapterRegistry;
  store: TaskStateStore;
  runner: CommandRunnerLike;
  resolveBaseSha(): Promise<string>;
  now?: () => Date;
  report?: (message: string) => void;
  inspectRepository?: (
    projectRoot: string,
    state: ToolkitTaskState,
    options: RepositoryStateOptions,
  ) => Promise<RepositoryState>;
  releaseHandlers?: ReleaseHandlers;
};

export function createDefaultAdapterRegistry(): AdapterRegistry {
  return new AdapterRegistry().register(unexploredBossAdapter);
}

function projectPath(projectRoot: string, path: string): string {
  if (isAbsolute(path)) {
    throw new ToolkitUsageError("toolkit paths must be project-relative");
  }
  const absolute = resolve(projectRoot, path);
  const projectRelative = relative(resolve(projectRoot), absolute);
  if (
    projectRelative === ".." ||
    projectRelative.startsWith("../") ||
    isAbsolute(projectRelative)
  ) {
    throw new ToolkitUsageError("toolkit path escapes the project root");
  }
  return absolute;
}

function taskIdFromSpec(spec: unknown): string {
  if (
    spec === null ||
    typeof spec !== "object" ||
    !("taskId" in spec) ||
    typeof spec.taskId !== "string" ||
    spec.taskId.trim() === ""
  ) {
    throw new ToolkitUsageError("adapter spec must provide a taskId");
  }
  return spec.taskId;
}

function externalAction(value: string): ExternalAction {
  if (!EXTERNAL_ACTIONS.includes(value as ExternalAction)) {
    throw new ToolkitUsageError(`unknown external action: ${value}`);
  }
  return value as ExternalAction;
}

function contextFor(
  dependencies: ToolkitRuntimeDependencies,
  state: Pick<ToolkitTaskState, "taskId" | "baseSha">,
): AdapterContext {
  return {
    projectRoot: dependencies.projectRoot,
    taskId: state.taskId,
    taskRoot: resolve(
      dependencies.projectRoot,
      ".toolkit",
      "work",
      state.taskId,
    ),
    baseSha: state.baseSha,
  };
}

async function loadOptionalState(
  store: TaskStateStore,
  taskId: string,
): Promise<ToolkitTaskState | null> {
  try {
    return await store.load(taskId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function assertMatchingTask(
  state: ToolkitTaskState,
  adapterId: string,
  adapterSpecVersion: number,
  specPath: string,
  baseSha: string,
): void {
  if (
    state.adapterId !== adapterId ||
    state.adapterSpecVersion !== adapterSpecVersion ||
    state.specPath !== specPath ||
    state.baseSha !== baseSha
  ) {
    throw new Error(`existing task ${state.taskId} does not match this invocation`);
  }
}

function assertNoGeneratedErrors(issues: readonly ValidationIssue[]): void {
  const errors = issues.filter(
    (issue) =>
      issue.severity === "error" && issue.blockingPhase !== "release",
  );
  if (errors.length > 0) {
    throw new Error(
      `generated content validation failed: ${errors
        .map((issue) => `${issue.code}: ${issue.message}`)
        .join("; ")}`,
    );
  }
}

function reportDryRunTargets(
  dependencies: ToolkitRuntimeDependencies,
  artifacts: readonly { scope: "project" | "task"; path: string }[],
  externalTargets: readonly string[],
): void {
  for (const artifact of artifacts) {
    dependencies.report?.(`${artifact.scope}:${artifact.path}`);
  }
  for (const path of externalTargets) {
    dependencies.report?.(`external:${path}`);
  }
}

async function loadTaskSpec(
  state: ToolkitTaskState,
  dependencies: ToolkitRuntimeDependencies,
): Promise<{
  adapter: ReturnType<AdapterRegistry["require"]>;
  spec: unknown;
  context: AdapterContext;
}> {
  const adapter = dependencies.registry.require(
    state.adapterId,
    state.adapterSpecVersion,
  );
  const source = await loadYamlSpec(
    projectPath(dependencies.projectRoot, state.specPath),
  );
  const spec = adapter.parseSpec(source);
  return { adapter, spec, context: contextFor(dependencies, state) };
}

async function createContent(
  command: Extract<ToolkitCommand, { kind: "content-create" }>,
  dependencies: ToolkitRuntimeDependencies,
): Promise<number> {
  const specPath = relative(
    resolve(dependencies.projectRoot),
    projectPath(dependencies.projectRoot, command.specPath),
  ).replaceAll("\\", "/");
  const adapter = dependencies.registry.require(command.adapterId);
  const source = await loadYamlSpec(
    projectPath(dependencies.projectRoot, command.specPath),
  );
  const spec = adapter.parseSpec(source);
  const taskId = taskIdFromSpec(spec);
  const specHash = sha256Text(stableJson(spec));
  const baseSha = await dependencies.resolveBaseSha();
  let state = await loadOptionalState(dependencies.store, taskId);
  if (state !== null) {
    assertMatchingTask(
      state,
      adapter.id,
      adapter.specVersion,
      specPath,
      baseSha,
    );
    if (
      state.steps.scaffold?.inputHash === specHash &&
      state.artifacts.length > 0
    ) {
      await verifyArtifactRecords(
        dependencies.projectRoot,
        taskId,
        state.artifacts,
      );
      if (command.dryRun) {
        const context = contextFor(dependencies, state);
        reportDryRunTargets(
          dependencies,
          state.artifacts,
          adapter.listExternalTargets?.(context, spec) ?? [],
        );
        return 0;
      }
      const context = contextFor(dependencies, state);
      assertNoGeneratedErrors(await adapter.validateGenerated(context, spec));
      if (state.steps.scaffold.status !== "passed") {
        const now = (dependencies.now?.() ?? new Date()).toISOString();
        state = {
          ...state,
          updatedAt: now,
          steps: {
            ...state.steps,
            scaffold: {
              ...state.steps.scaffold,
              status: "passed",
              finishedAt: now,
            },
          },
        };
        await dependencies.store.save(state);
      }
      return 0;
    }
  }
  const context = contextFor(dependencies, { taskId, baseSha });
  const plans = await adapter.plan(context, spec);
  const preview = await planArtifactWrites(
    dependencies.projectRoot,
    plans,
    state?.artifacts ?? [],
    { taskId },
  );
  if (command.dryRun) {
    reportDryRunTargets(
      dependencies,
      preview.entries.map((entry) => entry.plan),
      adapter.listExternalTargets?.(context, spec) ?? [],
    );
    return 0;
  }
  if (state === null) {
    state = await dependencies.store.create({
      taskId,
      adapterId: adapter.id,
      adapterSpecVersion: adapter.specVersion,
      specPath,
      baseSha,
      now: (dependencies.now?.() ?? new Date()).toISOString(),
    });
  }
  const artifacts = await applyArtifactWrites(dependencies.projectRoot, preview);
  state = {
    ...state,
    artifacts,
    updatedAt: (dependencies.now?.() ?? new Date()).toISOString(),
  };
  await dependencies.store.save(state);
  assertNoGeneratedErrors(await adapter.validateGenerated(context, spec));
  const completedAt = (dependencies.now?.() ?? new Date()).toISOString();
  state = {
    ...state,
    updatedAt: completedAt,
    steps: {
      ...state.steps,
      scaffold: {
        status: "passed",
        inputHash: specHash,
        outputHash: sha256Text(stableJson(artifacts)),
        dependsOn: [],
        attempts: (state.steps.scaffold?.attempts ?? 0) + 1,
        startedAt: completedAt,
        finishedAt: completedAt,
      },
    },
  };
  await dependencies.store.save(state);
  return 0;
}

async function verifyTask(
  state: ToolkitTaskState,
  level: "fast" | "full",
  dryRun: boolean,
  dependencies: ToolkitRuntimeDependencies,
): Promise<number> {
  const { adapter, spec, context } = await loadTaskSpec(state, dependencies);
  if (level === "full") {
    const errors = (await adapter.validateGenerated(context, spec)).filter(
      (issue) => issue.severity === "error",
    );
    if (errors.length > 0) {
      throw new Error(
        `full verification blocked: ${errors
          .map((issue) => `${issue.code}: ${issue.message}`)
          .join("; ")}`,
      );
    }
  }
  const specHash = sha256Text(stableJson(spec));
  const inspect = dependencies.inspectRepository ?? repositoryState;
  const initialSnapshot = await inspect(dependencies.projectRoot, state, {
    specHash,
    checkGraphHash: "",
  });
  const selectionContext = {
    adapterContext: context,
    spec,
    changedPaths: initialSnapshot.dirtyPaths,
  };
  const checks =
    level === "fast"
      ? selectFastChecks(selectionContext, adapter)
      : selectFullChecks(selectionContext, adapter);
  const checkGraphHash = verificationGraphHash(checks);
  const snapshot: RepositoryState = {
    ...initialSnapshot,
    specHash,
    checkGraphHash,
  };
  for (const check of checks) {
    dependencies.report?.(`check:${check.id}`);
    dependencies.report?.(`reason:${check.id}:${check.reason ?? "selected"}`);
  }
  if (dryRun) {
    return 0;
  }
  if (level === "full" && snapshot.unrelatedDirtyPaths.length > 0) {
    throw new Error(
      `full verification has unrelated dirty files: ${snapshot.unrelatedDirtyPaths.join(", ")}`,
    );
  }
  const sharedInputs = {
    ...snapshot.plannedArtifactHashes,
    "@head": snapshot.headSha,
    "@repository": snapshot.repositoryHash,
    "@spec": snapshot.specHash,
    "@graph": snapshot.checkGraphHash,
  };
  const inputsByCheck = Object.fromEntries(
    checks.map((check) => [check.id, sharedInputs]),
  );
  const priorAttempts = Object.fromEntries(
    checks.map((check) => [check.id, state.steps[check.id]?.attempts ?? 0]),
  );
  let executionState = state;
  if (level === "full" && state.fullVerification !== undefined) {
    const { fullVerification: _previous, ...withoutPrevious } = state;
    executionState = withoutPrevious;
  }
  let result = await runChecks(executionState, checks, {
    projectRoot: dependencies.projectRoot,
    store: dependencies.store,
    runner: dependencies.runner,
    inputsByCheck,
    now: () => (dependencies.now?.() ?? new Date()).toISOString(),
  });
  const passed = checks.every(
    (check) => result.steps[check.id]?.status === "passed",
  );
  const updatedAt = (dependencies.now?.() ?? new Date()).toISOString();
  result = { ...result, phase: "verify", updatedAt };
  if (level === "full" && passed) {
    result = recordFullVerification(result, snapshot, checks, updatedAt);
  }
  await dependencies.store.save(result);
  for (const check of checks) {
    const step = result.steps[check.id];
    const elapsedMs =
      step.startedAt === undefined || step.finishedAt === undefined
        ? 0
        : Math.max(
            0,
            Date.parse(step.finishedAt) - Date.parse(step.startedAt),
          );
    const cache = step.attempts === priorAttempts[check.id] ? "hit" : "miss";
    dependencies.report?.(
      `result:${check.id}:${step.status}:cache=${cache}:elapsedMs=${elapsedMs}:log=${step.logPath ?? "none"}`,
    );
  }
  return passed ? 0 : 1;
}

export async function executeToolkitCommand(
  command: ToolkitCommand,
  dependencies: ToolkitRuntimeDependencies,
): Promise<number> {
  switch (command.kind) {
    case "content-create":
      return createContent(command, dependencies);
    case "task-resume": {
      const state = await dependencies.store.load(command.taskId);
      if (command.dryRun) {
        return 0;
      }
      return verifyTask(state, "fast", false, dependencies);
    }
    case "task-scope-add": {
      const state = await dependencies.store.load(command.taskId);
      const next = await recordManualPaths(
        state,
        dependencies.projectRoot,
        command.paths,
      );
      if (!command.dryRun) {
        await dependencies.store.save(next);
      }
      return 0;
    }
    case "task-approve": {
      const state = await dependencies.store.load(command.taskId);
      const now = dependencies.now?.() ?? new Date();
      const next = recordApproval(
        state,
        {
          action: externalAction(command.action),
          target: command.target,
          reason: command.reason,
          approvedAt: now.toISOString(),
        },
        now,
      );
      if (!command.dryRun) {
        await dependencies.store.save(next);
      }
      return 0;
    }
    case "verify": {
      const state = await dependencies.store.load(command.taskId);
      return verifyTask(state, command.level, command.dryRun, dependencies);
    }
    case "images-import": {
      const state = await dependencies.store.load(command.taskId);
      const { adapter, spec, context } = await loadTaskSpec(state, dependencies);
      const specs = adapter.listImageSpecs?.(context, spec);
      if (specs === undefined || specs.length === 0) {
        throw new ToolkitUsageError(
          `adapter ${adapter.id} does not declare image inputs`,
        );
      }
      const sourceDir = resolve(dependencies.projectRoot, command.sourceDir);
      if (command.dryRun) {
        const inspections = await inspectImageInputs(context, specs, sourceDir);
        for (const inspection of inspections) {
          dependencies.report?.(
            `${inspection.sourceName} -> ${inspection.importTarget}`,
          );
        }
        dependencies.report?.("command:npm run optimize-images");
        dependencies.report?.("command:npm run check-images");
        return 0;
      }
      const result = await runImageWorkflow(state, sourceDir, {
        projectRoot: dependencies.projectRoot,
        store: dependencies.store,
        runner: dependencies.runner,
        specs,
        now: () => (dependencies.now?.() ?? new Date()).toISOString(),
      });
      dependencies.report?.(
        `images:review:${result.steps["images:review"]?.status ?? "pending"}`,
      );
      return result.steps["images:optimize"]?.status === "passed" &&
        result.steps["images:references"]?.status === "passed"
        ? 0
        : 1;
    }
    case "images-review": {
      const state = await dependencies.store.load(command.taskId);
      const { adapter, spec, context } = await loadTaskSpec(state, dependencies);
      const specs = adapter.listImageSpecs?.(context, spec);
      if (specs === undefined || specs.length === 0) {
        throw new ToolkitUsageError(
          `adapter ${adapter.id} does not declare image inputs`,
        );
      }
      const next = await recordImageReview(state, {
        projectRoot: dependencies.projectRoot,
        store: dependencies.store,
        specs,
        role: command.role,
        decision: command.decision,
        reason: command.reason,
        now: () => (dependencies.now?.() ?? new Date()).toISOString(),
        persist: !command.dryRun,
      });
      dependencies.report?.(
        `images:review:${next.steps["images:review"].status}`,
      );
      return 0;
    }
    case "release-pr":
      if (dependencies.releaseHandlers?.pr === undefined) {
        throw new ToolkitUsageError("release PR pipeline is not registered");
      }
      return dependencies.releaseHandlers.pr(command.taskId, command.dryRun);
    case "release-deploy-test":
      if (dependencies.releaseHandlers?.deployTest === undefined) {
        throw new ToolkitUsageError(
          "test deployment pipeline is not registered",
        );
      }
      return dependencies.releaseHandlers.deployTest(
        command.taskId,
        command.dryRun,
      );
  }
}
