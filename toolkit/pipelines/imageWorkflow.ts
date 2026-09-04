import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { AdapterImageSpec } from "../core/adapter";
import type { CheckDefinition } from "../core/artifacts";
import type { CommandRunnerLike } from "../core/commandRunner";
import {
  applyArtifactWrites,
  planArtifactWrites,
  verifyArtifactRecords,
} from "../core/fileWriter";
import { sha256Text, stableJson } from "../core/hashes";
import { TaskStateStore } from "../core/taskState";
import {
  ToolkitWorkflow,
  workflowCheckInputHash,
} from "../core/workflow";
import type {
  ArtifactRecord,
  ImageReviewRecord,
  ImageReviewRole,
  StepState,
  ToolkitTaskState,
} from "../schemas/task";
import {
  runAssetRightsWorkflow,
  type ImageRightsHash,
} from "./assetRights";
import {
  inspectImageInputs,
  planInspectedImageImport,
  type ImageInspection,
} from "./images";

export type ImageWorkflowDependencies = {
  projectRoot: string;
  store: TaskStateStore;
  runner: CommandRunnerLike;
  specs: readonly AdapterImageSpec[];
  now?: () => string;
};

export type RecordImageReviewOptions = {
  projectRoot: string;
  store: TaskStateStore;
  specs: readonly AdapterImageSpec[];
  role: ImageReviewRole;
  decision: "accept" | "reject";
  reason: string;
  now?: () => string;
  persist?: boolean;
};

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function nowOf(now: (() => string) | undefined): string {
  return now?.() ?? new Date().toISOString();
}

function contextFor(state: ToolkitTaskState, projectRoot: string) {
  return {
    projectRoot,
    taskId: state.taskId,
    taskRoot: join(projectRoot, ".toolkit", "work", state.taskId),
    baseSha: state.baseSha,
  };
}

function mergeArtifactRecords(
  existing: readonly ArtifactRecord[],
  replacementPaths: ReadonlySet<string>,
  replacements: readonly ArtifactRecord[],
): readonly ArtifactRecord[] {
  return [
    ...existing.filter(
      (record) =>
        record.scope !== "project" || !replacementPaths.has(record.path),
    ),
    ...replacements,
  ].toSorted((left, right) =>
    `${left.scope}:${left.path}`.localeCompare(`${right.scope}:${right.path}`),
  );
}

function optimizeCheck(sourceHash: string, optimizerHash: string): CheckDefinition {
  return {
    id: "images:optimize",
    command: "npm",
    args: ["run", "optimize-images"],
    inputHash: sha256Text(stableJson({ sourceHash, optimizerHash })),
    dependsOn: [],
  };
}

function referencesCheck(finalHash: string): CheckDefinition {
  return {
    id: "images:references",
    command: "npm",
    args: ["run", "check-images"],
    inputHash: finalHash,
    dependsOn: ["images:optimize"],
  };
}

function relevantRecords(
  state: ToolkitTaskState,
  paths: ReadonlySet<string>,
): readonly ArtifactRecord[] {
  return state.artifacts.filter(
    (record) => record.scope === "project" && paths.has(record.path),
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function assertPngFinalOwnership(
  state: ToolkitTaskState,
  projectRoot: string,
  inspections: readonly ImageInspection[],
): Promise<void> {
  for (const inspection of inspections) {
    if (inspection.format !== "png") continue;
    const finalPath = join(projectRoot, inspection.target);
    if (!(await pathExists(finalPath))) continue;
    const record = state.artifacts.find(
      (candidate) =>
        candidate.scope === "project" && candidate.path === inspection.target,
    );
    if (record === undefined) {
      throw new Error(
        `${inspection.target} already exists without toolkit ownership`,
      );
    }
    await verifyArtifactRecords(projectRoot, state.taskId, [record]);
  }
}

async function finalImageRecords(
  projectRoot: string,
  inspections: readonly ImageInspection[],
): Promise<readonly ArtifactRecord[]> {
  const records: ArtifactRecord[] = [];
  for (const inspection of inspections) {
    if (
      inspection.importTarget !== inspection.target &&
      (await pathExists(join(projectRoot, inspection.importTarget)))
    ) {
      throw new Error(`temporary image remains after optimization: ${inspection.importTarget}`);
    }
    const targetPath = join(projectRoot, inspection.target);
    let bytes: Buffer;
    try {
      const stat = await lstat(targetPath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error("not a regular file");
      }
      bytes = await readFile(targetPath);
    } catch (error) {
      throw new Error(`optimized image is missing: ${inspection.target}`, {
        cause: error,
      });
    }
    records.push({
      scope: "project",
      path: inspection.target,
      operation: "create",
      outputHash: hashBytes(bytes),
      byteLength: bytes.byteLength,
    });
  }
  return records.toSorted((left, right) => left.path.localeCompare(right.path));
}

function reviewStep(
  state: ToolkitTaskState,
  records: readonly ArtifactRecord[],
  specs: readonly AdapterImageSpec[],
  updatedAt: string,
): StepState {
  const hashByPath = new Map(records.map((record) => [record.path, record.outputHash]));
  const currentReviews = state.imageReviews ?? {};
  const reviewValues = Object.values(currentReviews);
  const inputHash = sha256Text(stableJson(Object.fromEntries(hashByPath)));
  const currentReviewFor = (spec: AdapterImageSpec) => {
    const review = currentReviews[spec.role];
    return review?.contentHash === hashByPath.get(spec.target) ? review : undefined;
  };
  const rejected = specs.some(
    (spec) => currentReviewFor(spec)?.decision === "reject",
  );
  const allAccepted = specs.length === 4 && specs.every(
    (spec) => currentReviewFor(spec)?.decision === "accept",
  );
  return {
    status: rejected ? "failed" : allAccepted ? "passed" : "pending",
    inputHash,
    ...(allAccepted
      ? { outputHash: sha256Text(stableJson(currentReviews)) }
      : {}),
    dependsOn: ["images:references"],
    attempts: reviewValues.length,
    ...(allAccepted ? { finishedAt: updatedAt } : {}),
    ...(!allAccepted
      ? { errorSummary: rejected ? "image-review-rejected" : "image-review-required" }
      : {}),
  };
}

function currentReviews(
  state: ToolkitTaskState,
  specs: readonly AdapterImageSpec[],
  records: readonly ArtifactRecord[],
): ToolkitTaskState["imageReviews"] {
  const hashByPath = new Map(records.map((record) => [record.path, record.outputHash]));
  const specByRole = new Map(specs.map((spec) => [spec.role, spec]));
  return Object.fromEntries(
    Object.entries(state.imageReviews ?? {}).filter(([role, review]) => {
      const spec = specByRole.get(role as ImageReviewRole);
      return (
        spec !== undefined &&
        review !== undefined &&
        hashByPath.get(spec.target) === review.contentHash
      );
    }),
  );
}

async function failOptimizeValidation(
  state: ToolkitTaskState,
  store: TaskStateStore,
  message: string,
  now: string,
): Promise<ToolkitTaskState> {
  const previous = state.steps["images:optimize"];
  const next = {
    ...state,
    updatedAt: now,
    steps: {
      ...state.steps,
      "images:optimize": {
        ...previous,
        status: "failed" as const,
        finishedAt: now,
        errorSummary: message,
      },
    },
  };
  await store.save(next);
  return next;
}

export async function runImageWorkflow(
  initialState: ToolkitTaskState,
  sourceDir: string,
  dependencies: ImageWorkflowDependencies,
): Promise<ToolkitTaskState> {
  const context = contextFor(initialState, dependencies.projectRoot);
  const inspections = await inspectImageInputs(
    context,
    dependencies.specs,
    sourceDir,
  );
  const sourceHash = sha256Text(
    stableJson(
      inspections.map(({ role, contentHash, target }) => ({
        role,
        contentHash,
        target,
      })),
    ),
  );
  const optimizerHash = hashBytes(
    await readFile(join(dependencies.projectRoot, "scripts/optimize-images.mjs")),
  );
  const optimize = optimizeCheck(sourceHash, optimizerHash);
  const expectedOptimizeHash = workflowCheckInputHash(optimize);
  const finalPaths = new Set(inspections.map((inspection) => inspection.target));
  let state = initialState;
  const reusable =
    state.steps[optimize.id]?.status === "passed" &&
    state.steps[optimize.id]?.inputHash === expectedOptimizeHash;

  if (reusable) {
    const records = relevantRecords(state, finalPaths);
    if (records.length !== inspections.length) {
      throw new Error("cached image artifacts are incomplete");
    }
    await verifyArtifactRecords(
      dependencies.projectRoot,
      state.taskId,
      records,
    );
  } else {
    await assertPngFinalOwnership(state, dependencies.projectRoot, inspections);
    const plans = planInspectedImageImport(inspections);
    const preview = await planArtifactWrites(
      dependencies.projectRoot,
      plans,
      state.artifacts,
      { taskId: state.taskId },
    );
    const imported = await applyArtifactWrites(dependencies.projectRoot, preview);
    const importedPaths = new Set(imported.map((record) => record.path));
    const updatedAt = nowOf(dependencies.now);
    state = {
      ...state,
      phase: "images",
      updatedAt,
      artifacts: mergeArtifactRecords(state.artifacts, importedPaths, imported),
    };
    await dependencies.store.save(state);
    state = await new ToolkitWorkflow({
      projectRoot: dependencies.projectRoot,
      store: dependencies.store,
      checks: [optimize],
      now: dependencies.now,
    }).run(state, dependencies.runner);
    if (state.steps[optimize.id].status !== "passed") {
      return state;
    }
  }

  let finalRecords: readonly ArtifactRecord[];
  try {
    finalRecords = await finalImageRecords(dependencies.projectRoot, inspections);
  } catch (error) {
    return failOptimizeValidation(
      state,
      dependencies.store,
      error instanceof Error ? error.message : String(error),
      nowOf(dependencies.now),
    );
  }
  const allImagePaths = new Set(
    inspections.flatMap((inspection) => [inspection.importTarget, inspection.target]),
  );
  const updatedAt = nowOf(dependencies.now);
  state = {
    ...state,
    phase: "images",
    updatedAt,
    artifacts: mergeArtifactRecords(state.artifacts, allImagePaths, finalRecords),
    imageReviews: currentReviews(state, dependencies.specs, finalRecords),
  };
  await dependencies.store.save(state);

  const finalHash = sha256Text(
    stableJson(finalRecords.map(({ path, outputHash }) => ({ path, outputHash }))),
  );
  state = await new ToolkitWorkflow({
    projectRoot: dependencies.projectRoot,
    store: dependencies.store,
    checks: [optimize, referencesCheck(finalHash)],
    now: dependencies.now,
  }).run(state, dependencies.runner);
  const reviewUpdatedAt = nowOf(dependencies.now);
  state = {
    ...state,
    updatedAt: reviewUpdatedAt,
    steps: {
      ...state.steps,
      "images:review": reviewStep(
        state,
        finalRecords,
        dependencies.specs,
        reviewUpdatedAt,
      ),
    },
  };
  await dependencies.store.save(state);
  const hasRightsApproval = state.approvals.some(
    (approval) =>
      approval.action === "asset-rights" && approval.target === state.taskId,
  );
  if (
    state.steps["images:review"].status === "passed" &&
    hasRightsApproval
  ) {
    const rightsHashes: ImageRightsHash[] = dependencies.specs.map((spec) => {
      const record = state.artifacts.find(
        (candidate) =>
          candidate.scope === "project" && candidate.path === spec.target,
      );
      if (record === undefined) {
        throw new Error(`image artifact is missing for rights: ${spec.role}`);
      }
      return {
        role: spec.role,
        path: spec.target,
        sha256: record.outputHash,
        rightsSource: spec.rightsSource,
      };
    });
    return runAssetRightsWorkflow(context, state, rightsHashes, {
      store: dependencies.store,
      runner: dependencies.runner,
      now: dependencies.now,
    });
  }
  return state;
}

export async function recordImageReview(
  state: ToolkitTaskState,
  options: RecordImageReviewOptions,
): Promise<ToolkitTaskState> {
  if (options.reason.trim() === "") {
    throw new Error("image review reason is required");
  }
  const spec = options.specs.find((candidate) => candidate.role === options.role);
  if (spec === undefined) {
    throw new Error(`image role is not declared: ${options.role}`);
  }
  const record = state.artifacts.find(
    (candidate) => candidate.scope === "project" && candidate.path === spec.target,
  );
  if (record === undefined) {
    throw new Error(`image has not been imported: ${options.role}`);
  }
  const records = relevantRecords(
    state,
    new Set(options.specs.map((image) => image.target)),
  );
  if (records.length !== options.specs.length) {
    throw new Error("imported image artifacts are incomplete");
  }
  await verifyArtifactRecords(options.projectRoot, state.taskId, records);
  const reviewedAt = nowOf(options.now);
  const review: ImageReviewRecord = {
    role: options.role,
    contentHash: record.outputHash,
    decision: options.decision,
    reason: options.reason,
    reviewedAt,
  };
  const { fullVerification: _previousVerification, ...withoutVerification } =
    state;
  let next: ToolkitTaskState = {
    ...withoutVerification,
    updatedAt: reviewedAt,
    imageReviews: { ...(state.imageReviews ?? {}), [options.role]: review },
  };
  next = {
    ...next,
    steps: {
      ...next.steps,
      "images:review": reviewStep(next, records, options.specs, reviewedAt),
    },
  };
  if (options.persist !== false) {
    await options.store.save(next);
  }
  return next;
}
