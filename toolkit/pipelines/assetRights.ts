import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";

import type { AdapterContext } from "../core/adapter";
import { requireApproval } from "../core/approvals";
import type { ArtifactPlan } from "../core/artifacts";
import type { CommandRunnerLike } from "../core/commandRunner";
import {
  applyArtifactWrites,
  planArtifactWrites,
} from "../core/fileWriter";
import { sha256Text, stableJson } from "../core/hashes";
import { TaskStateStore } from "../core/taskState";
import { ToolkitWorkflow } from "../core/workflow";
import type {
  ImageReviewRole,
  ToolkitTaskState,
} from "../schemas/task";
import { updateLedgerForTask } from "../../scripts/asset-rights-lib.mjs";

const ROLE_ORDER: readonly ImageReviewRole[] = [
  "boss",
  "drop-30",
  "drop-10",
  "drop-rare",
];
const LEDGER_PATH = "docs/asset-rights.json";
const LEDGER_OWNERSHIP_KEY = "asset-rights:ledger-v1";

export type ImageRightsHash = {
  role: ImageReviewRole;
  path: string;
  sha256: string;
  rightsSource: string;
};

export type AssetRightsWorkflowDependencies = {
  store: TaskStateStore;
  runner: CommandRunnerLike;
  now?: () => string;
};

function approvalFor(task: ToolkitTaskState) {
  try {
    return requireApproval(task, "asset-rights", task.taskId);
  } catch (error) {
    throw new Error("asset-rights approval required for this task", {
      cause: error,
    });
  }
}

function evidenceDate(task: ToolkitTaskState): string {
  const approval = task.approvals.find(
    (candidate) =>
      candidate.action === "asset-rights" && candidate.target === task.taskId,
  );
  return (approval?.approvedAt ?? task.updatedAt).slice(0, 10);
}

export function assetProvenancePath(task: ToolkitTaskState): string {
  if (!/^boss-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(task.taskId)) {
    throw new Error(`cannot derive boss id from task: ${task.taskId}`);
  }
  return `docs/asset-provenance-${task.taskId.slice("boss-".length)}-${evidenceDate(task)}.md`;
}

function validateImageHashes(
  task: ToolkitTaskState,
  hashes: readonly ImageRightsHash[],
): readonly ImageRightsHash[] {
  if (hashes.length !== ROLE_ORDER.length) {
    throw new Error("exactly four image hashes are required");
  }
  const byRole = new Map<ImageReviewRole, ImageRightsHash>();
  for (const image of hashes) {
    if (!ROLE_ORDER.includes(image.role) || byRole.has(image.role)) {
      throw new Error(`duplicate or unknown image role: ${image.role}`);
    }
    if (
      image.path.includes("\\") ||
      image.path !== posix.normalize(image.path) ||
      !image.path.startsWith("public/images/") ||
      !image.path.endsWith(".webp")
    ) {
      throw new Error(`unsafe image rights path: ${image.path}`);
    }
    if (!/^[a-f0-9]{64}$/.test(image.sha256)) {
      throw new Error(`invalid image hash: ${image.path}`);
    }
    const artifact = task.artifacts.find(
      (candidate) =>
        candidate.scope === "project" && candidate.path === image.path,
    );
    if (artifact?.outputHash !== image.sha256) {
      throw new Error(`image artifact hash does not match: ${image.role}`);
    }
    const review = task.imageReviews?.[image.role];
    if (
      review?.decision !== "accept" ||
      review.contentHash !== image.sha256
    ) {
      throw new Error(`accepted image review does not match: ${image.role}`);
    }
    byRole.set(image.role, image);
  }
  return ROLE_ORDER.map((role) => {
    const image = byRole.get(role);
    if (image === undefined) {
      throw new Error(`missing image hash for role: ${role}`);
    }
    return image;
  });
}

function assertSafeApprovalStatement(reason: string): void {
  if (
    reason.includes("\n") ||
    reason.includes("\r") ||
    /https?:\/\//i.test(reason) ||
    /(?:\/tmp\/|\/home\/|[A-Za-z]:\\)/.test(reason)
  ) {
    throw new Error(
      "asset-rights approval reason cannot contain URLs or local paths",
    );
  }
}

function renderProvenance(
  task: ToolkitTaskState,
  approvalReason: string,
  hashes: readonly ImageRightsHash[],
): string {
  const lines = [
    `# ${task.taskId} asset provenance`,
    "",
    `- Task: \`${task.taskId}\``,
    `- Rights source: \`operator-cleared-game-art\``,
    `- Approval date: \`${evidenceDate(task)}\``,
    `- Operator statement: ${JSON.stringify(approvalReason)}`,
    "- Repository reference assets: none declared by the version-one adapter spec.",
    "",
    "## Accepted final images",
    "",
  ];
  for (const image of hashes) {
    const review = task.imageReviews?.[image.role];
    lines.push(
      `- \`${image.role}\` — \`${image.path}\` — SHA-256 \`${image.sha256}\` — accepted \`${review?.reviewedAt}\``,
    );
  }
  lines.push(
    "",
    "All listed images were supplied from an operator-controlled generation session, visually inspected for this task, and imported from local files. No external image URL is recorded.",
    "",
  );
  return lines.join("\n");
}

export async function planAssetRightsUpdate(
  context: AdapterContext,
  task: ToolkitTaskState,
  imageHashes: readonly ImageRightsHash[],
): Promise<readonly ArtifactPlan[]> {
  if (context.taskId !== task.taskId) {
    throw new Error("asset-rights context does not match task");
  }
  const approval = approvalFor(task);
  assertSafeApprovalStatement(approval.reason);
  const images = validateImageHashes(task, imageHashes);
  const ledger = JSON.parse(
    await readFile(join(context.projectRoot, LEDGER_PATH), "utf8"),
  );
  const sourceIds = new Set(
    Array.isArray(ledger.sources)
      ? ledger.sources.map((source: { id?: unknown }) => source.id)
      : [],
  );
  for (const image of images) {
    if (!sourceIds.has(image.rightsSource)) {
      throw new Error(`unknown rights source: ${image.rightsSource}`);
    }
    if (image.rightsSource !== "operator-cleared-game-art") {
      throw new Error(`unsupported task rights source: ${image.rightsSource}`);
    }
  }
  const provenancePath = assetProvenancePath(task);
  const updatedLedger = updateLedgerForTask(ledger, {
    sourceId: "operator-cleared-game-art",
    reviewedAt: evidenceDate(task),
    evidencePath: provenancePath,
    assets: images.map((image) => ({
      path: image.path,
      sha256: image.sha256,
      source: image.rightsSource,
    })),
  });
  return [
    {
      scope: "project",
      path: provenancePath,
      operation: "create",
      content: renderProvenance(task, approval.reason, images),
    },
    {
      scope: "project",
      path: LEDGER_PATH,
      operation: "replace-owned",
      ownershipKey: LEDGER_OWNERSHIP_KEY,
      content: `${JSON.stringify(updatedLedger, null, 2)}\n`,
    },
  ];
}

export async function runAssetRightsWorkflow(
  context: AdapterContext,
  task: ToolkitTaskState,
  imageHashes: readonly ImageRightsHash[],
  dependencies: AssetRightsWorkflowDependencies,
): Promise<ToolkitTaskState> {
  const plans = await planAssetRightsUpdate(context, task, imageHashes);
  const preview = await planArtifactWrites(
    context.projectRoot,
    plans,
    task.artifacts,
    { taskId: task.taskId },
  );
  const rightsRecords = await applyArtifactWrites(context.projectRoot, preview);
  const rightsPaths = new Set(rightsRecords.map((record) => record.path));
  const updatedAt = dependencies.now?.() ?? new Date().toISOString();
  let state: ToolkitTaskState = {
    ...task,
    updatedAt,
    artifacts: [
      ...task.artifacts.filter(
        (record) =>
          record.scope !== "project" || !rightsPaths.has(record.path),
      ),
      ...rightsRecords,
    ].toSorted((left, right) =>
      `${left.scope}:${left.path}`.localeCompare(`${right.scope}:${right.path}`),
    ),
  };
  await dependencies.store.save(state);
  const inputHash = sha256Text(
    stableJson(
      rightsRecords.map(({ path, outputHash }) => ({ path, outputHash })),
    ),
  );
  state = await new ToolkitWorkflow({
    projectRoot: context.projectRoot,
    store: dependencies.store,
    checks: [
      {
        id: "images:rights",
        command: "npm",
        args: ["run", "check-asset-rights", "--", "--strict"],
        inputHash,
        dependsOn: [],
      },
    ],
    now: dependencies.now,
  }).run(state, dependencies.runner);
  return state;
}
