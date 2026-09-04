import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GITHUB_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(?:pull|actions\/runs)\/\d+$/;

export type ExternalCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type ExternalCommandClient = {
  exec(args: readonly string[]): Promise<ExternalCommandResult>;
};

class GhCommandClient implements ExternalCommandClient {
  async exec(args: readonly string[]): Promise<ExternalCommandResult> {
    try {
      const result = await execFileAsync("gh", [...args], {
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

export type PullRequestRef = {
  number: number;
  state: "OPEN" | "CLOSED" | "MERGED";
  baseRefName: string;
  headRefName: string;
  url: string;
  mergeable?: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  mergedAt?: string | null;
  mergeCommitSha?: string | null;
};

export type GitHubCheck = {
  name: string;
  status: "PENDING" | "SUCCESS" | "FAILURE" | "CANCELLED" | "TIMED_OUT" | "ACTION_REQUIRED" | "STARTUP_FAILURE";
  runId?: number;
};

export type WorkflowRun = {
  databaseId: number;
  status: "queued" | "in_progress" | "completed" | "waiting" | "requested" | "pending";
  conclusion: string | null;
  headSha: string;
  url: string;
  createdAt: string;
  updatedAt?: string;
};

export interface GitHubClient {
  findPullRequest(head: string): Promise<PullRequestRef | null>;
  createPullRequest(input: {
    base: string;
    head: string;
    title: string;
    body: string;
  }): Promise<PullRequestRef>;
  viewPullRequest(number: number): Promise<PullRequestRef>;
  pullRequestChecks(number: number): Promise<readonly GitHubCheck[]>;
  listCommitRuns(sha: string): Promise<readonly WorkflowRun[]>;
  mergePullRequest(number: number): Promise<{ exitCode: number }>;
  listDeployRuns(): Promise<readonly WorkflowRun[]>;
}

function json(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error("gh returned invalid JSON", { cause: error });
  }
}

function pull(value: unknown): PullRequestRef {
  if (value === null || typeof value !== "object") {
    throw new Error("invalid GitHub pull request");
  }
  const item = value as Record<string, unknown>;
  if (
    !Number.isInteger(item.number) ||
    Number(item.number) <= 0 ||
    !["OPEN", "CLOSED", "MERGED"].includes(String(item.state)) ||
    typeof item.baseRefName !== "string" ||
    typeof item.headRefName !== "string" ||
    typeof item.url !== "string" ||
    !GITHUB_URL.test(item.url)
  ) {
    throw new Error("invalid GitHub pull request");
  }
  const mergeCommit = item.mergeCommit as { oid?: unknown } | null | undefined;
  return {
    number: Number(item.number),
    state: item.state as PullRequestRef["state"],
    baseRefName: item.baseRefName,
    headRefName: item.headRefName,
    url: item.url,
    ...(item.mergeable === undefined
      ? {}
      : { mergeable: item.mergeable as PullRequestRef["mergeable"] }),
    ...(item.mergedAt === undefined
      ? {}
      : { mergedAt: item.mergedAt as string | null }),
    ...(mergeCommit === undefined
      ? {}
      : { mergeCommitSha: mergeCommit?.oid as string | null }),
  };
}

async function successful(
  client: ExternalCommandClient,
  args: readonly string[],
): Promise<string> {
  const result = await client.exec(args);
  if (result.exitCode !== 0) {
    throw new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

export class GhCliClient implements GitHubClient {
  constructor(private readonly command: ExternalCommandClient = new GhCommandClient()) {}

  async findPullRequest(head: string): Promise<PullRequestRef | null> {
    const output = await successful(this.command, [
      "pr",
      "list",
      "--head",
      head,
      "--state",
      "all",
      "--json",
      "number,state,baseRefName,headRefName,url",
    ]);
    const parsed = json(output);
    if (!Array.isArray(parsed)) throw new Error("invalid GitHub PR list");
    if (parsed.length > 1) throw new Error(`duplicate pull requests for ${head}`);
    return parsed.length === 0 ? null : pull(parsed[0]);
  }

  async createPullRequest(input: {
    base: string;
    head: string;
    title: string;
    body: string;
  }): Promise<PullRequestRef> {
    const output = (
      await successful(this.command, [
        "pr",
        "create",
        "--base",
        input.base,
        "--head",
        input.head,
        "--title",
        input.title,
        "--body",
        input.body,
      ])
    ).trim();
    if (!GITHUB_URL.test(output)) throw new Error("gh returned invalid PR URL");
    const number = Number(output.split("/").at(-1));
    return {
      number,
      state: "OPEN",
      baseRefName: input.base,
      headRefName: input.head,
      url: output,
    };
  }

  async viewPullRequest(number: number): Promise<PullRequestRef> {
    return pull(
      json(
        await successful(this.command, [
          "pr",
          "view",
          String(number),
          "--json",
          "number,state,baseRefName,headRefName,url,mergeable,mergedAt,mergeCommit",
        ]),
      ),
    );
  }

  async pullRequestChecks(number: number): Promise<readonly GitHubCheck[]> {
    const parsed = json(
      await successful(this.command, [
        "pr",
        "checks",
        String(number),
        "--json",
        "name,state",
      ]),
    );
    if (!Array.isArray(parsed)) throw new Error("invalid GitHub check list");
    return parsed.map((entry) => {
      const item = entry as Record<string, unknown>;
      if (typeof item.name !== "string" || typeof item.state !== "string") {
        throw new Error("invalid GitHub check");
      }
      return { name: item.name, status: item.state as GitHubCheck["status"] };
    });
  }

  private async runs(args: readonly string[]): Promise<readonly WorkflowRun[]> {
    const parsed = json(await successful(this.command, args));
    if (!Array.isArray(parsed)) throw new Error("invalid GitHub run list");
    return parsed.map((entry) => {
      const item = entry as Record<string, unknown>;
      if (
        !Number.isInteger(item.databaseId) ||
        typeof item.status !== "string" ||
        typeof item.headSha !== "string" ||
        typeof item.url !== "string" ||
        !GITHUB_URL.test(item.url) ||
        typeof item.createdAt !== "string"
      ) {
        throw new Error("invalid GitHub workflow run");
      }
      return item as WorkflowRun;
    });
  }

  listCommitRuns(sha: string): Promise<readonly WorkflowRun[]> {
    return this.runs([
      "run",
      "list",
      "--commit",
      sha,
      "--workflow",
      "CI",
      "--json",
      "databaseId,status,conclusion,headSha,url,createdAt,updatedAt",
      "--limit",
      "10",
    ]);
  }

  async mergePullRequest(number: number): Promise<{ exitCode: number }> {
    const result = await this.command.exec([
      "pr",
      "merge",
      String(number),
      "--squash",
    ]);
    return { exitCode: result.exitCode };
  }

  listDeployRuns(): Promise<readonly WorkflowRun[]> {
    return this.runs([
      "run",
      "list",
      "--workflow",
      "deploy-staging.yml",
      "--event",
      "workflow_run",
      "--json",
      "databaseId,status,conclusion,headSha,url,createdAt,updatedAt",
      "--limit",
      "50",
    ]);
  }
}
