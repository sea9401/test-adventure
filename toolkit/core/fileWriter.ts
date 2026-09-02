import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rmdir,
  unlink,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
} from "node:path";

import type { ArtifactPlan } from "./artifacts";
import type { ArtifactRecord } from "../schemas/task";

const TASK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;

type PlannedArtifact = {
  plan: ArtifactPlan;
  targetPath: string;
  bytes: Buffer;
  outputHash: string;
  previousBytes: Buffer | null;
  mode: number;
};

export type ArtifactWriteChange = PlannedArtifact;

export type ArtifactWritePreview = {
  projectRoot: string;
  taskId?: string;
  plans: readonly ArtifactPlan[];
  changes: readonly ArtifactWriteChange[];
  entries: readonly PlannedArtifact[];
  records: readonly ArtifactRecord[];
};

export type PlanArtifactWriteOptions = {
  taskId?: string;
};

export type FileWriterOperations = {
  rename(source: string, target: string): Promise<void>;
};

export const nodeFileWriterOperations: FileWriterOperations = { rename };

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function artifactKey(scope: string, path: string): string {
  return `${scope}:${path}`;
}

function assertRelativeArtifactPath(path: string): void {
  if (
    path.trim() === "" ||
    path.includes("\\") ||
    isAbsolute(path) ||
    path !== posix.normalize(path) ||
    path === "." ||
    path === ".." ||
    path.startsWith("../") ||
    path.includes("/../")
  ) {
    throw new Error(`unsafe artifact path: ${path}`);
  }
}

function isPathInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function assertNoSymlinkEscape(
  canonicalProjectRoot: string,
  scopeRoot: string,
  artifactPath: string,
  scope: "project" | "task",
): Promise<void> {
  const segments = artifactPath.split("/");
  const pathSegments = [
    ...relative(canonicalProjectRoot, scopeRoot).split("/").filter(Boolean),
    ...segments.slice(0, -1),
  ];
  let cursor = canonicalProjectRoot;

  for (const segment of pathSegments) {
    cursor = join(cursor, segment);
    if (!(await pathExists(cursor))) {
      continue;
    }
    const stat = await lstat(cursor);
    if (!stat.isSymbolicLink()) {
      continue;
    }
    const destination = await realpath(cursor);
    const allowedRoot = scope === "task" ? scopeRoot : canonicalProjectRoot;
    if (!isPathInside(allowedRoot, destination)) {
      throw new Error(
        `artifact path escapes its root through a symlink: ${artifactPath}`,
      );
    }
    cursor = destination;
  }

  const target = resolve(scopeRoot, artifactPath);
  if (await pathExists(target)) {
    const stat = await lstat(target);
    if (stat.isSymbolicLink()) {
      throw new Error(`artifact target cannot be a symlink: ${artifactPath}`);
    }
  }
}

async function readExistingBytes(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function makeRecord(entry: PlannedArtifact): ArtifactRecord {
  return {
    scope: entry.plan.scope,
    path: entry.plan.path,
    operation: entry.plan.operation,
    ...(entry.plan.ownershipKey === undefined
      ? {}
      : { ownershipKey: entry.plan.ownershipKey }),
    outputHash: entry.outputHash,
    byteLength: entry.bytes.byteLength,
  };
}

export async function planArtifactWrites(
  projectRoot: string,
  plans: readonly ArtifactPlan[],
  previous: readonly ArtifactRecord[],
  options: PlanArtifactWriteOptions = {},
): Promise<ArtifactWritePreview> {
  const canonicalProjectRoot = await realpath(projectRoot);
  if (options.taskId !== undefined && !TASK_ID_PATTERN.test(options.taskId)) {
    throw new Error(`invalid task id: ${options.taskId}`);
  }

  const previousByPath = new Map<string, ArtifactRecord>();
  for (const record of previous) {
    const key = artifactKey(record.scope, record.path);
    if (previousByPath.has(key)) {
      throw new Error(`duplicate previous artifact record: ${record.path}`);
    }
    previousByPath.set(key, record);
  }

  const seen = new Set<string>();
  const entries: PlannedArtifact[] = [];
  for (const plan of plans) {
    assertRelativeArtifactPath(plan.path);
    if (
      plan.operation === "replace-owned" &&
      (plan.ownershipKey === undefined || plan.ownershipKey.trim() === "")
    ) {
      throw new Error(`replace-owned requires an ownership key: ${plan.path}`);
    }
    const key = artifactKey(plan.scope, plan.path);
    if (seen.has(key)) {
      throw new Error(`duplicate artifact path: ${plan.scope}:${plan.path}`);
    }
    seen.add(key);

    if (plan.scope === "task" && options.taskId === undefined) {
      throw new Error(`task-scoped artifact requires a task id: ${plan.path}`);
    }
    const scopeRoot =
      plan.scope === "project"
        ? canonicalProjectRoot
        : join(canonicalProjectRoot, ".toolkit", "work", options.taskId!);
    const targetPath = resolve(scopeRoot, plan.path);
    if (!isPathInside(scopeRoot, targetPath)) {
      throw new Error(`unsafe artifact path: ${plan.path}`);
    }
    await assertNoSymlinkEscape(
      canonicalProjectRoot,
      scopeRoot,
      plan.path,
      plan.scope,
    );

    const bytes =
      typeof plan.content === "string"
        ? Buffer.from(plan.content, "utf8")
        : Buffer.from(plan.content);
    const outputHash = hashBytes(bytes);
    const previousBytes = await readExistingBytes(targetPath);
    const mode =
      previousBytes === null ? 0o644 : (await lstat(targetPath)).mode & 0o777;
    const record = previousByPath.get(key);

    if (
      record === undefined &&
      previousBytes !== null &&
      plan.operation !== "replace-owned"
    ) {
      throw new Error(
        `${plan.path} already exists without toolkit ownership`,
      );
    }
    if (record !== undefined) {
      if (previousBytes === null || hashBytes(previousBytes) !== record.outputHash) {
        throw new Error(`${plan.path} changed outside toolkit ownership`);
      }
      if (record.ownershipKey !== plan.ownershipKey) {
        throw new Error(`${plan.path} toolkit ownership key does not match`);
      }
    }

    entries.push({ plan, targetPath, bytes, outputHash, previousBytes, mode });
  }

  return {
    projectRoot: canonicalProjectRoot,
    ...(options.taskId === undefined ? {} : { taskId: options.taskId }),
    plans: [...plans],
    entries,
    changes: entries.filter(
      (entry) =>
        entry.previousBytes === null ||
        hashBytes(entry.previousBytes) !== entry.outputHash,
    ),
    records: entries.map(makeRecord),
  };
}

export async function verifyArtifactRecords(
  projectRoot: string,
  taskId: string,
  records: readonly ArtifactRecord[],
): Promise<void> {
  const canonicalProjectRoot = await realpath(projectRoot);
  if (!TASK_ID_PATTERN.test(taskId)) {
    throw new Error(`invalid task id: ${taskId}`);
  }
  const seen = new Set<string>();
  for (const record of records) {
    assertRelativeArtifactPath(record.path);
    const key = artifactKey(record.scope, record.path);
    if (seen.has(key)) {
      throw new Error(`duplicate artifact record: ${record.scope}:${record.path}`);
    }
    seen.add(key);
    const scopeRoot =
      record.scope === "project"
        ? canonicalProjectRoot
        : join(canonicalProjectRoot, ".toolkit", "work", taskId);
    const targetPath = resolve(scopeRoot, record.path);
    if (!isPathInside(scopeRoot, targetPath)) {
      throw new Error(`unsafe artifact path: ${record.path}`);
    }
    await assertNoSymlinkEscape(
      canonicalProjectRoot,
      scopeRoot,
      record.path,
      record.scope,
    );
    const bytes = await readExistingBytes(targetPath);
    if (bytes === null || hashBytes(bytes) !== record.outputHash) {
      throw new Error(`${record.path} changed outside toolkit ownership`);
    }
  }
}

async function verifyPreviewStillCurrent(
  preview: ArtifactWritePreview,
): Promise<void> {
  for (const entry of preview.entries) {
    const current = await readExistingBytes(entry.targetPath);
    const unchanged =
      current === null
        ? entry.previousBytes === null
        : entry.previousBytes !== null && current.equals(entry.previousBytes);
    if (!unchanged) {
      throw new Error(`${entry.plan.path} changed after toolkit preview`);
    }
  }
}

async function missingParentDirectories(
  root: string,
  targetPath: string,
): Promise<readonly string[]> {
  const missing: string[] = [];
  let cursor = dirname(targetPath);
  while (cursor !== root && isPathInside(root, cursor)) {
    if (await pathExists(cursor)) {
      break;
    }
    missing.push(cursor);
    cursor = dirname(cursor);
  }
  return missing;
}

async function writeSynchronizedFile(
  path: string,
  bytes: Uint8Array,
  mode: number,
): Promise<void> {
  const handle = await open(path, "wx", mode);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    await unlink(path).catch(() => undefined);
    throw error;
  } finally {
    await handle.close();
  }
}

export async function applyArtifactWrites(
  projectRoot: string,
  preview: ArtifactWritePreview,
  operations: FileWriterOperations = nodeFileWriterOperations,
): Promise<readonly ArtifactRecord[]> {
  const canonicalProjectRoot = await realpath(projectRoot);
  if (canonicalProjectRoot !== preview.projectRoot) {
    throw new Error("artifact preview belongs to a different project root");
  }
  await verifyPreviewStillCurrent(preview);
  if (preview.changes.length === 0) {
    return preview.records;
  }

  const taskLabel = preview.taskId ?? "project";
  const temporaryPaths = new Map<PlannedArtifact, string>();
  const createdDirectories = new Set<string>();
  const applied: PlannedArtifact[] = [];

  try {
    for (const [index, entry] of preview.changes.entries()) {
      const missing = await missingParentDirectories(
        canonicalProjectRoot,
        entry.targetPath,
      );
      for (const directory of missing) {
        createdDirectories.add(directory);
      }
      await mkdir(dirname(entry.targetPath), { recursive: true });
      const temporaryPath = join(
        dirname(entry.targetPath),
        `.toolkit-${taskLabel}-${basename(entry.targetPath)}.${process.pid}.${index}.tmp`,
      );
      await writeSynchronizedFile(temporaryPath, entry.bytes, entry.mode);
      temporaryPaths.set(entry, temporaryPath);
    }

    await verifyPreviewStillCurrent(preview);
    for (const entry of preview.changes) {
      await operations.rename(temporaryPaths.get(entry)!, entry.targetPath);
      temporaryPaths.delete(entry);
      applied.push(entry);
    }
    return preview.records;
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const entry of [...applied].reverse()) {
      try {
        if (entry.previousBytes === null) {
          await unlink(entry.targetPath);
        } else {
          const rollbackPath = join(
            dirname(entry.targetPath),
            `.toolkit-${taskLabel}-${basename(entry.targetPath)}.${process.pid}.rollback.tmp`,
          );
          await unlink(rollbackPath).catch(() => undefined);
          await writeSynchronizedFile(
            rollbackPath,
            entry.previousBytes,
            entry.mode,
          );
          await operations.rename(rollbackPath, entry.targetPath);
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    await Promise.all(
      [...temporaryPaths.values()].map((path) =>
        unlink(path).catch(() => undefined),
      ),
    );
    for (const directory of [...createdDirectories].sort().reverse()) {
      await rmdir(directory).catch(() => undefined);
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        `artifact apply failed and rollback was incomplete: ${String(error)}`,
      );
    }
    throw error;
  }
}
