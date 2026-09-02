import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";

import type {
  ArtifactRecord,
  ApprovalRecord,
  ImageReviewRecord,
  StepState,
  ToolkitPhase,
  ToolkitTaskState,
} from "../schemas/task";

const TASK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
const ROOT_PATH_PREFIXES = ["src/", "scripts/", "public/", "docs/"];

export type CreateTaskStateInput = {
  taskId: string;
  adapterId: string;
  adapterSpecVersion: number;
  specPath: string;
  baseSha: string;
  now?: string;
};

function assertTaskId(taskId: string): void {
  if (!TASK_ID_PATTERN.test(taskId)) {
    throw new Error(`invalid task id: ${taskId}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isStepState(value: unknown): value is StepState {
  if (!isRecord(value)) {
    return false;
  }
  return (
    ["pending", "running", "passed", "failed"].includes(String(value.status)) &&
    typeof value.inputHash === "string" &&
    isStringArray(value.dependsOn) &&
    Number.isInteger(value.attempts) &&
    Number(value.attempts) >= 0 &&
    (value.outputHash === undefined || typeof value.outputHash === "string") &&
    (value.startedAt === undefined || typeof value.startedAt === "string") &&
    (value.finishedAt === undefined || typeof value.finishedAt === "string") &&
    (value.logPath === undefined || typeof value.logPath === "string") &&
    (value.errorSummary === undefined || typeof value.errorSummary === "string")
  );
}

function isArtifactRecord(value: unknown): value is ArtifactRecord {
  if (!isRecord(value)) {
    return false;
  }
  return (
    ["project", "task"].includes(String(value.scope)) &&
    typeof value.path === "string" &&
    ["create", "replace-owned"].includes(String(value.operation)) &&
    (value.ownershipKey === undefined || typeof value.ownershipKey === "string") &&
    typeof value.outputHash === "string" &&
    Number.isInteger(value.byteLength) &&
    Number(value.byteLength) >= 0
  );
}

function isApprovalRecord(value: unknown): value is ApprovalRecord {
  if (!isRecord(value)) {
    return false;
  }
  return (
    ["asset-rights", "push", "pr", "merge-staging", "deploy-test"].includes(
      String(value.action),
    ) &&
    typeof value.target === "string" &&
    typeof value.reason === "string" &&
    typeof value.approvedAt === "string"
  );
}

function isImageReviewRecord(value: unknown): value is ImageReviewRecord {
  if (!isRecord(value)) {
    return false;
  }
  return (
    ["boss", "drop-30", "drop-10", "drop-rare"].includes(String(value.role)) &&
    typeof value.contentHash === "string" &&
    ["accept", "reject"].includes(String(value.decision)) &&
    typeof value.reason === "string" &&
    typeof value.reviewedAt === "string"
  );
}

function isImageReviews(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  const roles = new Set(["boss", "drop-30", "drop-10", "drop-rare"]);
  return Object.entries(value).every(
    ([role, review]) =>
      roles.has(role) && isImageReviewRecord(review) && review.role === role,
  );
}

function validateTaskState(value: unknown): ToolkitTaskState {
  if (!isRecord(value)) {
    throw new Error("invalid task state");
  }
  if (value.schemaVersion !== 1) {
    throw new Error(`unsupported task state schema: ${String(value.schemaVersion)}`);
  }

  const phases: readonly ToolkitPhase[] = [
    "scaffold",
    "images",
    "verify",
    "checkpoint",
    "release",
  ];
  const steps = value.steps;
  const valid =
    typeof value.taskId === "string" &&
    typeof value.adapterId === "string" &&
    Number.isInteger(value.adapterSpecVersion) &&
    Number(value.adapterSpecVersion) > 0 &&
    typeof value.specPath === "string" &&
    typeof value.baseSha === "string" &&
    phases.includes(value.phase as ToolkitPhase) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    isRecord(steps) &&
    Object.values(steps).every(isStepState) &&
    Array.isArray(value.artifacts) &&
    value.artifacts.every(isArtifactRecord) &&
    Array.isArray(value.approvals) &&
    value.approvals.every(isApprovalRecord) &&
    isStringArray(value.manualPaths) &&
    isImageReviews(value.imageReviews);

  if (!valid) {
    throw new Error("invalid task state");
  }
  assertTaskId(value.taskId as string);
  return value as ToolkitTaskState;
}

function resetStep(step: StepState, inputHash = step.inputHash): StepState {
  return {
    status: "pending",
    inputHash,
    dependsOn: [...step.dependsOn],
    attempts: step.attempts,
  };
}

export function invalidateChangedInputs(
  state: ToolkitTaskState,
  inputHashes: Readonly<Record<string, string>>,
): ToolkitTaskState {
  const invalid = new Set<string>();
  for (const [stepId, inputHash] of Object.entries(inputHashes)) {
    const step = state.steps[stepId];
    if (step !== undefined && step.inputHash !== inputHash) {
      invalid.add(stepId);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [stepId, step] of Object.entries(state.steps)) {
      if (
        !invalid.has(stepId) &&
        step.dependsOn.some((dependency) => invalid.has(dependency))
      ) {
        invalid.add(stepId);
        changed = true;
      }
    }
  }

  if (invalid.size === 0) {
    return state;
  }

  const steps = Object.fromEntries(
    Object.entries(state.steps).map(([stepId, step]) => [
      stepId,
      invalid.has(stepId)
        ? resetStep(step, inputHashes[stepId] ?? step.inputHash)
        : step,
    ]),
  );
  return { ...state, steps };
}

function recoverInterruptedSteps(state: ToolkitTaskState): ToolkitTaskState {
  let changed = false;
  const steps = Object.fromEntries(
    Object.entries(state.steps).map(([stepId, step]) => {
      if (step.status !== "running") {
        return [stepId, step];
      }
      changed = true;
      return [stepId, resetStep(step)];
    }),
  );
  return changed ? { ...state, steps } : state;
}

export class TaskStateStore {
  constructor(private readonly projectRoot: string) {}

  private statePath(taskId: string): string {
    assertTaskId(taskId);
    return join(this.projectRoot, ".toolkit", "work", taskId, "state.json");
  }

  async load(taskId: string): Promise<ToolkitTaskState> {
    const path = this.statePath(taskId);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`invalid task state JSON: ${path}`, { cause: error });
      }
      throw error;
    }
    const state = validateTaskState(parsed);
    if (state.taskId !== taskId) {
      throw new Error(`task state id mismatch: expected ${taskId}`);
    }
    return recoverInterruptedSteps(state);
  }

  async save(state: ToolkitTaskState): Promise<void> {
    const validated = validateTaskState(state);
    const path = this.statePath(validated.taskId);
    await mkdir(dirname(path), { recursive: true });
    const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(validated, null, 2)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      await rename(temporaryPath, path);
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  async create(input: CreateTaskStateInput): Promise<ToolkitTaskState> {
    assertTaskId(input.taskId);
    const now = input.now ?? new Date().toISOString();
    const state: ToolkitTaskState = {
      schemaVersion: 1,
      taskId: input.taskId,
      adapterId: input.adapterId,
      adapterSpecVersion: input.adapterSpecVersion,
      specPath: input.specPath,
      baseSha: input.baseSha,
      phase: "scaffold",
      createdAt: now,
      updatedAt: now,
      steps: {},
      artifacts: [],
      approvals: [],
      manualPaths: [],
      imageReviews: {},
    };
    await this.save(state);
    return state;
  }

  invalidateChangedInputs(
    state: ToolkitTaskState,
    inputHashes: Readonly<Record<string, string>>,
  ): ToolkitTaskState {
    return invalidateChangedInputs(state, inputHashes);
  }
}

function assertSafeManualPath(
  path: string,
  allowedRootFiles: ReadonlySet<string>,
): string {
  if (
    path.trim() === "" ||
    path.includes("\\") ||
    isAbsolute(path) ||
    path !== posix.normalize(path) ||
    path === "." ||
    path.startsWith("../") ||
    path.includes("/../") ||
    path === ".git" ||
    path.startsWith(".git/") ||
    path === ".toolkit" ||
    path.startsWith(".toolkit/") ||
    path === "node_modules" ||
    path.startsWith("node_modules/") ||
    path === ".next" ||
    path.startsWith(".next/") ||
    path === "out" ||
    path.startsWith("out/") ||
    path === "build" ||
    path.startsWith("build/") ||
    (!ROOT_PATH_PREFIXES.some((prefix) => path.startsWith(prefix)) &&
      !allowedRootFiles.has(path))
  ) {
    throw new Error(`unsafe manual path: ${path}`);
  }
  return path;
}

export async function recordManualPaths(
  state: ToolkitTaskState,
  projectRoot: string,
  paths: readonly string[],
  allowedRootFiles: ReadonlySet<string> = new Set(),
): Promise<ToolkitTaskState> {
  const canonicalRoot = await realpath(projectRoot);
  const validated: string[] = [];

  for (const candidate of paths) {
    const path = assertSafeManualPath(candidate, allowedRootFiles);
    const parent = dirname(resolve(projectRoot, path));
    try {
      const parentStat = await lstat(parent);
      if (!parentStat.isDirectory()) {
        throw new Error("not a directory");
      }
    } catch (error) {
      throw new Error(`manual path parent directory does not exist: ${path}`, {
        cause: error,
      });
    }
    const canonicalParent = await realpath(parent);
    const relativeParent = relative(canonicalRoot, canonicalParent);
    if (
      relativeParent === ".." ||
      relativeParent.startsWith(`..${posix.sep}`) ||
      isAbsolute(relativeParent)
    ) {
      throw new Error(`unsafe manual path outside project: ${path}`);
    }
    validated.push(path);
  }

  return {
    ...state,
    updatedAt: new Date().toISOString(),
    manualPaths: [...new Set([...state.manualPaths, ...validated])].sort(),
  };
}
