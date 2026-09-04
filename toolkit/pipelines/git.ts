import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";

import type { ToolkitTaskState } from "../schemas/task";

const execFileAsync = promisify(execFile);
const SHA_PATTERN = /^[a-f0-9]{40}$/;

export type GitResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export interface GitClient {
  exec(cwd: string, args: readonly string[]): Promise<GitResult>;
}

export class CliGitClient implements GitClient {
  async exec(cwd: string, args: readonly string[]): Promise<GitResult> {
    try {
      const result = await execFileAsync("git", [...args], {
        cwd,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      });
      return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      const failure = error as Error & {
        code?: number;
        stdout?: string;
        stderr?: string;
      };
      return {
        exitCode: typeof failure.code === "number" ? failure.code : 1,
        stdout: failure.stdout ?? "",
        stderr: failure.stderr ?? failure.message,
      };
    }
  }
}

export type ReleaseRepositoryState = {
  branch: string | null;
  headSha: string;
  upstream: string | null;
  changedPaths: readonly string[];
  unmergedPaths: readonly string[];
  operation: "merge" | "rebase" | "cherry-pick" | null;
};

function nulPaths(output: string): readonly string[] {
  return output.split("\0").filter(Boolean).sort();
}

async function required(client: GitClient, root: string, args: readonly string[]) {
  const result = await client.exec(root, args);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

async function operationAt(root: string, client: GitClient) {
  const candidates = [
    ["merge", "MERGE_HEAD"],
    ["cherry-pick", "CHERRY_PICK_HEAD"],
    ["rebase", "rebase-merge"],
    ["rebase", "rebase-apply"],
  ] as const;
  for (const [operation, marker] of candidates) {
    const path = (
      await required(client, root, ["rev-parse", "--git-path", marker])
    ).trim();
    try {
      await lstat(isAbsolute(path) ? path : join(root, path));
      return operation;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return null;
}

export async function readRepositoryState(
  root: string,
  client: GitClient = new CliGitClient(),
): Promise<ReleaseRepositoryState> {
  await required(client, root, ["status", "--porcelain=v2", "-z", "--branch"]);
  const headSha = (await required(client, root, ["rev-parse", "HEAD"])).trim();
  const branchResult = await client.exec(root, [
    "symbolic-ref",
    "--quiet",
    "--short",
    "HEAD",
  ]);
  const upstreamResult = await client.exec(root, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}",
  ]);
  const tracked = nulPaths(
    await required(client, root, ["diff", "--name-only", "-z", "HEAD"]),
  );
  const untracked = nulPaths(
    await required(client, root, [
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
    ]),
  );
  const unmergedPaths = nulPaths(
    await required(client, root, [
      "diff",
      "--name-only",
      "--diff-filter=U",
      "-z",
    ]),
  );
  return {
    branch: branchResult.exitCode === 0 ? branchResult.stdout.trim() : null,
    headSha,
    upstream:
      upstreamResult.exitCode === 0 ? upstreamResult.stdout.trim() : null,
    changedPaths: [...new Set([...tracked, ...untracked])].sort(),
    unmergedPaths,
    operation: await operationAt(root, client),
  };
}

export function validateReleaseRepository(
  task: ToolkitTaskState,
  repository: ReleaseRepositoryState,
): void {
  if (repository.branch === null) {
    throw new Error("release repository is detached");
  }
  if (repository.branch === "main" || repository.branch === "staging") {
    throw new Error(`release branch must not be ${repository.branch}`);
  }
  if (!SHA_PATTERN.test(repository.headSha)) {
    throw new Error("release repository HEAD must be a full SHA");
  }
  if (repository.operation !== null) {
    throw new Error(
      `release repository has an in-progress ${repository.operation}`,
    );
  }
  if (repository.unmergedPaths.length > 0) {
    throw new Error("release repository has unmerged paths");
  }
  const allowed = new Set([
    task.specPath,
    ...task.manualPaths,
    ...task.artifacts
      .filter((artifact) => artifact.scope === "project")
      .map((artifact) => artifact.path),
  ]);
  for (const path of repository.changedPaths) {
    if (!allowed.has(path)) {
      throw new Error(`unplanned changed path: ${path}`);
    }
  }
}

export async function createTaskCheckpoint(
  task: ToolkitTaskState,
  root: string,
  client: GitClient,
  message: string,
  dryRun: boolean,
  report?: (message: string) => void,
): Promise<ToolkitTaskState> {
  if (message.trim() === "") {
    throw new Error("checkpoint message is required");
  }
  const hasVerification = Object.entries(task.steps).some(
    ([id, step]) =>
      step.status === "passed" &&
      id !== "scaffold" &&
      !id.startsWith("images:"),
  );
  if (!hasVerification) {
    throw new Error("checkpoint requires a successful fast verification");
  }
  const repository = await readRepositoryState(root, client);
  validateReleaseRepository(task, repository);
  if (repository.changedPaths.length === 0) {
    throw new Error("checkpoint has no task changes");
  }
  for (const path of repository.changedPaths) report?.(`stage:${path}`);
  report?.(`commit:${message.trim()}`);
  if (dryRun) return task;

  let result = await client.exec(root, [
    "add",
    "--",
    ...repository.changedPaths,
  ]);
  if (result.exitCode !== 0) throw new Error("git add failed for checkpoint");
  const cached = nulPaths(
    await required(client, root, ["diff", "--cached", "--name-only", "-z"]),
  );
  if (JSON.stringify(cached) !== JSON.stringify([...repository.changedPaths].sort())) {
    throw new Error("checkpoint staged paths do not match task scope");
  }
  result = await client.exec(root, ["diff", "--cached", "--check"]);
  if (result.exitCode !== 0) throw new Error("checkpoint staged diff check failed");
  result = await client.exec(root, ["commit", "-m", message.trim()]);
  if (result.exitCode !== 0) throw new Error("checkpoint commit failed");
  const checkpointSha = (
    await required(client, root, ["rev-parse", "HEAD"])
  ).trim();
  if (!SHA_PATTERN.test(checkpointSha)) {
    throw new Error("checkpoint commit did not produce a full SHA");
  }
  const { fullVerification: _stale, ...withoutVerification } = task;
  return {
    ...withoutVerification,
    phase: "checkpoint",
    checkpointSha,
    updatedAt: new Date().toISOString(),
  };
}
