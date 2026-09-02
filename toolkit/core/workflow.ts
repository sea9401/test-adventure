import { join } from "node:path";

import type { CheckDefinition } from "./artifacts";
import type { CommandRunnerLike } from "./commandRunner";
import { sha256Text, stableJson } from "./hashes";
import { invalidateChangedInputs, TaskStateStore } from "./taskState";
import type { StepState, ToolkitTaskState } from "../schemas/task";

const CHECK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

export type WorkflowStepContext = {
  projectRoot: string;
  store: TaskStateStore;
  runner: CommandRunnerLike;
  state: ToolkitTaskState;
  now(): string;
};

export type ToolkitWorkflowOptions = {
  projectRoot: string;
  store: TaskStateStore;
  checks: readonly CheckDefinition[];
  now?: () => string;
};

function checkInputHash(check: CheckDefinition): string {
  return sha256Text(
    stableJson({
      id: check.id,
      command: check.command,
      args: check.args,
      env: check.env ?? {},
      dependsOn: check.dependsOn,
    }),
  );
}

function sortChecks(checks: readonly CheckDefinition[]): readonly CheckDefinition[] {
  const byId = new Map<string, CheckDefinition>();
  for (const check of checks) {
    if (!CHECK_ID_PATTERN.test(check.id)) {
      throw new Error(`invalid workflow check id: ${check.id}`);
    }
    if (byId.has(check.id)) {
      throw new Error(`duplicate workflow check: ${check.id}`);
    }
    byId.set(check.id, check);
  }
  for (const check of checks) {
    for (const dependency of check.dependsOn) {
      if (!byId.has(dependency)) {
        throw new Error(`unknown dependency ${dependency} for ${check.id}`);
      }
    }
  }

  const ordered: CheckDefinition[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (check: CheckDefinition): void => {
    if (visited.has(check.id)) {
      return;
    }
    if (visiting.has(check.id)) {
      throw new Error(`workflow dependency cycle at ${check.id}`);
    }
    visiting.add(check.id);
    for (const dependency of check.dependsOn) {
      visit(byId.get(dependency)!);
    }
    visiting.delete(check.id);
    visited.add(check.id);
    ordered.push(check);
  };
  for (const check of checks) {
    visit(check);
  }
  return ordered;
}

function replaceStep(
  state: ToolkitTaskState,
  stepId: string,
  step: StepState,
  updatedAt: string,
): ToolkitTaskState {
  return {
    ...state,
    updatedAt,
    steps: { ...state.steps, [stepId]: step },
  };
}

function prepareState(
  state: ToolkitTaskState,
  checks: readonly CheckDefinition[],
): ToolkitTaskState {
  const inputHashes = Object.fromEntries(
    checks.map((check) => [check.id, checkInputHash(check)]),
  );
  let next = invalidateChangedInputs(state, inputHashes);
  const steps = { ...next.steps };
  for (const check of checks) {
    const existing = steps[check.id];
    if (existing === undefined) {
      steps[check.id] = {
        status: "pending",
        inputHash: inputHashes[check.id],
        dependsOn: [...check.dependsOn],
        attempts: 0,
      };
      continue;
    }
    const cannotReuse =
      existing.status === "passed" && existing.outputHash === undefined;
    steps[check.id] = {
      ...(cannotReuse
        ? {
            status: "pending" as const,
            inputHash: inputHashes[check.id],
            attempts: existing.attempts,
          }
        : existing),
      dependsOn: [...check.dependsOn],
    };
  }
  next = { ...next, steps };
  return next;
}

export async function runWorkflowStep(
  context: WorkflowStepContext,
  definition: CheckDefinition,
): Promise<ToolkitTaskState> {
  const previous = context.state.steps[definition.id];
  if (previous === undefined) {
    throw new Error(`workflow step is not prepared: ${definition.id}`);
  }
  const attempt = previous.attempts + 1;
  const startedAt = context.now();
  const running: StepState = {
    status: "running",
    inputHash: previous.inputHash,
    dependsOn: [...definition.dependsOn],
    attempts: attempt,
    startedAt,
  };
  let state = replaceStep(context.state, definition.id, running, startedAt);
  await context.store.save(state);

  const relativeLogPath = `logs/${definition.id}-${attempt}.log`;
  try {
    const result = await context.runner.run({
      checkId: definition.id,
      command: definition.command,
      args: definition.args,
      cwd: context.projectRoot,
      env: definition.env,
      logPath: join(
        context.projectRoot,
        ".toolkit",
        "work",
        state.taskId,
        relativeLogPath,
      ),
    });
    const finishedAt = context.now();
    const passed = result.exitCode === 0 && result.signal === null;
    const completed: StepState = {
      status: passed ? "passed" : "failed",
      inputHash: previous.inputHash,
      outputHash: result.outputHash,
      dependsOn: [...definition.dependsOn],
      attempts: attempt,
      startedAt,
      finishedAt,
      logPath: relativeLogPath,
      ...(passed || result.tailLines.length === 0
        ? {}
        : { errorSummary: result.tailLines.join("\n") }),
    };
    state = replaceStep(state, definition.id, completed, finishedAt);
  } catch {
    const finishedAt = context.now();
    state = replaceStep(
      state,
      definition.id,
      {
        status: "failed",
        inputHash: previous.inputHash,
        dependsOn: [...definition.dependsOn],
        attempts: attempt,
        startedAt,
        finishedAt,
        logPath: relativeLogPath,
        errorSummary: `could not start check ${definition.id}`,
      },
      finishedAt,
    );
  }
  await context.store.save(state);
  return state;
}

export class ToolkitWorkflow {
  private readonly checks: readonly CheckDefinition[];
  private readonly now: () => string;

  constructor(private readonly options: ToolkitWorkflowOptions) {
    this.checks = sortChecks(options.checks);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async run(
    initialState: ToolkitTaskState,
    runner: CommandRunnerLike,
  ): Promise<ToolkitTaskState> {
    let state = prepareState(initialState, this.checks);
    for (const check of this.checks) {
      const step = state.steps[check.id];
      if (step.status === "passed") {
        continue;
      }
      const dependenciesPassed = check.dependsOn.every(
        (dependency) => state.steps[dependency]?.status === "passed",
      );
      if (!dependenciesPassed) {
        break;
      }
      state = await runWorkflowStep(
        {
          projectRoot: this.options.projectRoot,
          store: this.options.store,
          runner,
          state,
          now: this.now,
        },
        check,
      );
      if (state.steps[check.id].status !== "passed") {
        break;
      }
    }
    return state;
  }

  resume(
    state: ToolkitTaskState,
    runner: CommandRunnerLike,
  ): Promise<ToolkitTaskState> {
    return this.run(state, runner);
  }
}
