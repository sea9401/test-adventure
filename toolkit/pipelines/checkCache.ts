import { join } from "node:path";

import type { CheckDefinition } from "../core/artifacts";
import type {
  CommandResult,
  CommandRunnerLike,
} from "../core/commandRunner";
import { sha256Text, stableJson } from "../core/hashes";
import { invalidateChangedInputs, TaskStateStore } from "../core/taskState";
import type { StepState, ToolkitTaskState } from "../schemas/task";

const CHECK_ID_PATTERN = /^(?=.{2,64}$)[a-z0-9][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)*$/;

export type CheckInputs = Readonly<Record<string, string>>;

export type RunChecksDependencies = {
  projectRoot: string;
  store: TaskStateStore;
  runner: CommandRunnerLike;
  inputsByCheck: Readonly<Record<string, CheckInputs>>;
  environment?: Readonly<Record<string, string>>;
  now?: () => string;
};

export function checkCacheKey(
  check: CheckDefinition,
  inputs: CheckInputs,
  selectedEnvironment: Readonly<Record<string, string>>,
): string {
  return sha256Text(
    stableJson({
      id: check.id,
      command: check.command,
      args: check.args,
      environment: selectedEnvironment,
      inputs,
      explicitInputHash: check.inputHash ?? "",
      toolVersion: check.toolVersion ?? "project-toolkit-check-v1",
    }),
  );
}

function validateChecks(checks: readonly CheckDefinition[]): void {
  const byId = new Map<string, CheckDefinition>();
  for (const check of checks) {
    if (!CHECK_ID_PATTERN.test(check.id)) {
      throw new Error(`invalid verification check id: ${check.id}`);
    }
    if (byId.has(check.id)) {
      throw new Error(`duplicate verification check: ${check.id}`);
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
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`verification dependency cycle at ${id}`);
    }
    visiting.add(id);
    for (const dependency of byId.get(id)!.dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
}

function environmentFor(
  check: CheckDefinition,
  base: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return { ...base, ...(check.env ?? {}) };
}

function preparedState(
  state: ToolkitTaskState,
  checks: readonly CheckDefinition[],
  dependencies: RunChecksDependencies,
): ToolkitTaskState {
  const inputHashes = Object.fromEntries(
    checks.map((check) => [
      check.id,
      checkCacheKey(
        check,
        dependencies.inputsByCheck[check.id] ?? {},
        environmentFor(check, dependencies.environment ?? {}),
      ),
    ]),
  );
  const invalidated = invalidateChangedInputs(state, inputHashes);
  const steps = { ...invalidated.steps };
  for (const check of checks) {
    const existing = steps[check.id];
    if (existing === undefined) {
      steps[check.id] = {
        status: "pending",
        inputHash: inputHashes[check.id],
        dependsOn: [...check.dependsOn],
        attempts: 0,
      };
    } else {
      steps[check.id] = {
        ...existing,
        inputHash: inputHashes[check.id],
        dependsOn: [...check.dependsOn],
      };
    }
  }
  return { ...invalidated, steps };
}

type CompletedCheck = {
  check: CheckDefinition;
  step: StepState;
};

async function runOne(
  state: ToolkitTaskState,
  check: CheckDefinition,
  startedAt: string,
  dependencies: RunChecksDependencies,
): Promise<CompletedCheck> {
  const previous = state.steps[check.id];
  const attempt = previous.attempts + 1;
  const relativeLogPath = `logs/${check.id}-${attempt}.log`;
  let result: CommandResult | null = null;
  try {
    result = await dependencies.runner.run({
      checkId: check.id,
      command: check.command,
      args: check.args,
      cwd: dependencies.projectRoot,
      env: environmentFor(check, dependencies.environment ?? {}),
      logPath: join(
        dependencies.projectRoot,
        ".toolkit",
        "work",
        state.taskId,
        relativeLogPath,
      ),
    });
  } catch {
    // Converted to a persisted failure below.
  }
  const finishedAt = dependencies.now?.() ?? new Date().toISOString();
  const passed =
    result !== null && result.exitCode === 0 && result.signal === null;
  return {
    check,
    step: {
      status: passed ? "passed" : "failed",
      inputHash: previous.inputHash,
      ...(result === null ? {} : { outputHash: result.outputHash }),
      dependsOn: [...check.dependsOn],
      attempts: attempt,
      startedAt,
      finishedAt,
      logPath: relativeLogPath,
      ...(!passed
        ? {
            errorSummary:
              result === null || result.tailLines.length === 0
                ? `could not complete check ${check.id}`
                : result.tailLines.join("\n"),
          }
        : {}),
    },
  };
}

export async function runChecks(
  initialState: ToolkitTaskState,
  checks: readonly CheckDefinition[],
  dependencies: RunChecksDependencies,
): Promise<ToolkitTaskState> {
  validateChecks(checks);
  let state = preparedState(initialState, checks, dependencies);
  const attempted = new Set<string>();

  while (true) {
    const ready = checks.filter((check) => {
      const step = state.steps[check.id];
      return (
        step.status !== "passed" &&
        !attempted.has(check.id) &&
        check.dependsOn.every(
          (dependency) => state.steps[dependency]?.status === "passed",
        )
      );
    });
    if (ready.length === 0) break;
    const startedAt = dependencies.now?.() ?? new Date().toISOString();
    state = {
      ...state,
      updatedAt: startedAt,
      steps: {
        ...state.steps,
        ...Object.fromEntries(
          ready.map((check) => {
            const previous = state.steps[check.id];
            return [
              check.id,
              {
                status: "running" as const,
                inputHash: previous.inputHash,
                dependsOn: [...check.dependsOn],
                attempts: previous.attempts + 1,
                startedAt,
              },
            ];
          }),
        ),
      },
    };
    await dependencies.store.save(state);
    const completed = await Promise.all(
      ready.map((check) => {
        attempted.add(check.id);
        const running = state.steps[check.id];
        const executionState = {
          ...state,
          steps: {
            ...state.steps,
            [check.id]: { ...running, attempts: running.attempts - 1 },
          },
        };
        return runOne(executionState, check, startedAt, dependencies);
      }),
    );
    const finishedAt = dependencies.now?.() ?? new Date().toISOString();
    state = {
      ...state,
      updatedAt: finishedAt,
      steps: {
        ...state.steps,
        ...Object.fromEntries(completed.map(({ check, step }) => [check.id, step])),
      },
    };
    await dependencies.store.save(state);
  }
  return state;
}
