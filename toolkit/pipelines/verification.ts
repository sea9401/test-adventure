import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";

import type {
  AdapterContext,
  ToolkitAdapter,
} from "../core/adapter";
import type { CheckDefinition } from "../core/artifacts";
import { sha256Text, stableJson } from "../core/hashes";
import type {
  FullVerificationRecord,
  ToolkitTaskState,
} from "../schemas/task";

const execFileAsync = promisify(execFile);

export type RepositoryState = {
  headSha: string;
  dirtyPaths: readonly string[];
  dirtyFileHashes: Readonly<Record<string, string>>;
  unrelatedDirtyPaths: readonly string[];
  plannedArtifactHashes: Readonly<Record<string, string>>;
  repositoryHash: string;
  specHash: string;
  checkGraphHash: string;
};

export type RepositoryStateOptions = {
  specHash: string;
  checkGraphHash: string;
};

export type VerificationSelectionContext<TSpec = unknown> = {
  adapterContext: AdapterContext;
  spec: TSpec;
  changedPaths: readonly string[];
};

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function parseDirtyPaths(status: string): readonly string[] {
  const entries = status.split("\0");
  const paths: string[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === "") continue;
    const code = entry.slice(0, 2);
    paths.push(entry.slice(3));
    if (code.includes("R") || code.includes("C")) {
      const oldPath = entries[index + 1];
      if (oldPath !== undefined && oldPath !== "") paths.push(oldPath);
      index += 1;
    }
  }
  return [...new Set(paths)].sort();
}

async function fileHash(projectRoot: string, path: string): Promise<string> {
  const absolute = resolve(projectRoot, path);
  if (!isInside(resolve(projectRoot), absolute)) {
    throw new Error(`verification path escapes project: ${path}`);
  }
  try {
    return hashBytes(await readFile(absolute));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "<missing>";
    throw error;
  }
}

export async function repositoryState(
  projectRoot: string,
  task: ToolkitTaskState,
  options: RepositoryStateOptions,
): Promise<RepositoryState> {
  const [{ stdout: headOutput }, { stdout: statusOutput }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }),
    execFileAsync(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      { cwd: projectRoot, encoding: "utf8" },
    ),
  ]);
  const allowedPaths = new Set([
    task.specPath,
    ...task.manualPaths,
    ...task.artifacts
      .filter((artifact) => artifact.scope === "project")
      .map((artifact) => artifact.path),
  ]);
  const plannedArtifactHashes = Object.fromEntries(
    await Promise.all(
      [...allowedPaths].sort().map(async (path) => [
        path,
        await fileHash(projectRoot, path),
      ]),
    ),
  );
  const dirtyPaths = parseDirtyPaths(statusOutput).filter(
    (path) => path !== ".toolkit/work" && !path.startsWith(".toolkit/work/"),
  );
  const unrelatedDirtyPaths = dirtyPaths.filter((path) => !allowedPaths.has(path));
  const dirtyFileHashes = Object.fromEntries(
    await Promise.all(
      dirtyPaths.map(async (path) => [path, await fileHash(projectRoot, path)]),
    ),
  );
  const headSha = headOutput.trim();
  return {
    headSha,
    dirtyPaths,
    dirtyFileHashes,
    unrelatedDirtyPaths,
    plannedArtifactHashes,
    repositoryHash: sha256Text(
      stableJson({ headSha, dirtyFileHashes, plannedArtifactHashes }),
    ),
    specHash: options.specHash,
    checkGraphHash: options.checkGraphHash,
  };
}

export function verificationGraphHash(
  checks: readonly CheckDefinition[],
): string {
  return sha256Text(stableJson(checks));
}

export function recordFullVerification(
  task: ToolkitTaskState,
  snapshot: RepositoryState,
  checks: readonly CheckDefinition[],
  completedAt: string,
): ToolkitTaskState {
  if (snapshot.unrelatedDirtyPaths.length > 0) {
    throw new Error("full verification has unrelated dirty files");
  }
  if (snapshot.checkGraphHash !== verificationGraphHash(checks)) {
    throw new Error("full verification graph hash does not match");
  }
  const results: FullVerificationRecord["checks"] = Object.fromEntries(
    checks.map((check) => {
      const step = task.steps[check.id];
      if (step?.status !== "passed" || step.outputHash === undefined) {
        throw new Error("full verification graph is incomplete");
      }
      return [
        check.id,
        {
          inputHash: step.inputHash,
          outputHash: step.outputHash,
          ...(step.finishedAt === undefined ? {} : { finishedAt: step.finishedAt }),
          ...(step.logPath === undefined ? {} : { logPath: step.logPath }),
        },
      ];
    }),
  );
  return {
    ...task,
    phase: "checkpoint",
    updatedAt: completedAt,
    fullVerification: {
      headSha: snapshot.headSha,
      repositoryHash: snapshot.repositoryHash,
      plannedArtifactHashes: snapshot.plannedArtifactHashes,
      specHash: snapshot.specHash,
      checkGraphHash: snapshot.checkGraphHash,
      completedAt,
      checks: results,
    },
  };
}

export function requireCurrentFullVerification(
  task: ToolkitTaskState,
  current: RepositoryState,
): FullVerificationRecord {
  const token = task.fullVerification;
  const stale =
    token === undefined ||
    current.unrelatedDirtyPaths.length > 0 ||
    token.headSha !== current.headSha ||
    token.repositoryHash !== current.repositoryHash ||
    token.specHash !== current.specHash ||
    token.checkGraphHash !== current.checkGraphHash ||
    stableJson(token.plannedArtifactHashes) !==
      stableJson(current.plannedArtifactHashes);
  if (stale) {
    throw new Error("full verification is stale");
  }
  return token;
}

function withReason(check: CheckDefinition, reason: string): CheckDefinition {
  return { ...check, reason };
}

function fastReason(checkId: string): string {
  switch (checkId) {
    case "adapter-tests":
      return "adapter schema and generation contracts are always checked";
    case "catalog-tests":
      return "adapter-declared affected product catalogs must remain consistent";
    case "targeted-lint":
      return "changed toolkit and generated product paths require targeted lint";
    case "boss-simulation":
      return "the completed boss mechanic requires a seeded smoke simulation";
    default:
      return `adapter-selected check: ${checkId}`;
  }
}

function visualPath(path: string): boolean {
  return (
    path.startsWith("public/images/") ||
    path === "docs/asset-rights.json" ||
    path.startsWith("docs/asset-provenance-")
  );
}

export function selectFastChecks<TSpec>(
  context: VerificationSelectionContext<TSpec>,
  adapter: ToolkitAdapter<TSpec>,
): readonly CheckDefinition[] {
  const visualChanged = context.changedPaths.some(visualPath);
  const base = adapter
    .selectFastChecks(context.adapterContext, context.spec)
    .filter((check) => check.id !== "images")
    .map((check) =>
      withReason(
        {
          ...check,
          dependsOn: check.dependsOn.map((dependency) =>
            dependency === "images"
              ? visualChanged
                ? "images:references"
                : "targeted-lint"
              : dependency,
          ),
        },
        fastReason(check.id),
      ),
    );
  if (!visualChanged) return base;

  const imageChecks: readonly CheckDefinition[] = [
    {
      id: "images:references",
      command: "npm",
      args: ["run", "check-images"],
      dependsOn: [],
      reason: "visual files changed, so image references and orphans must be checked",
    },
    {
      id: "images:rights",
      command: "npm",
      args: ["run", "check-asset-rights", "--", "--strict"],
      dependsOn: ["images:references"],
      reason: "visual files changed, so exact rights hashes must be current",
    },
  ];
  return [...base, ...imageChecks];
}

function bossId(spec: unknown): string {
  if (
    spec === null ||
    typeof spec !== "object" ||
    !("id" in spec) ||
    typeof spec.id !== "string" ||
    spec.id.trim() === ""
  ) {
    throw new Error("full verification requires a boss id");
  }
  return spec.id;
}

export function selectFullChecks<TSpec>(
  context: VerificationSelectionContext<TSpec>,
  adapter: ToolkitAdapter<TSpec>,
): readonly CheckDefinition[] {
  if (
    !adapter
      .selectFastChecks(context.adapterContext, context.spec)
      .some((check) => check.id === "boss-simulation")
  ) {
    throw new Error("mechanic implementation blocks full verification");
  }
  const id = bossId(context.spec);
  return [
    {
      id: "images",
      command: "npm",
      args: ["run", "check-images"],
      dependsOn: [],
      reason: "authoritative verification checks every image reference",
    },
    {
      id: "rights",
      command: "npm",
      args: ["run", "check-asset-rights", "--", "--strict"],
      dependsOn: ["images"],
      reason: "authoritative verification requires cleared exact asset hashes",
    },
    {
      id: "typecheck",
      command: "npx",
      args: ["tsc", "--noEmit"],
      env: { NODE_OPTIONS: "--max-old-space-size=4096" },
      dependsOn: [],
      reason: "all TypeScript contracts must compile with the supported heap",
    },
    {
      id: "lint",
      command: "npm",
      args: ["run", "lint"],
      dependsOn: [],
      reason: "the full repository lint policy is authoritative",
    },
    {
      id: "unit",
      command: "npm",
      args: ["test"],
      dependsOn: ["rights", "typecheck", "lint"],
      reason: "all repository unit and integration tests must pass",
    },
    {
      id: "simulation",
      command: "npm",
      args: [
        "run",
        "sim:coop-boss",
        "--",
        "--trials=50",
        "--seed=20260902",
        `--boss=${id}`,
        "--json",
      ],
      dependsOn: ["unit"],
      reason: "a 50-trial seeded boss simulation is required for release",
    },
    {
      id: "build",
      command: "npm",
      args: ["run", "build"],
      env: {
        NODE_OPTIONS: "--max-old-space-size=4096",
        V2_UNEXPLORED: "true",
      },
      dependsOn: ["simulation"],
      reason: "the unexplored-enabled production build must complete",
    },
    {
      id: "diff",
      command: "git",
      args: ["diff", "--check"],
      dependsOn: ["build"],
      reason: "the final patch must contain no whitespace errors",
    },
  ];
}
