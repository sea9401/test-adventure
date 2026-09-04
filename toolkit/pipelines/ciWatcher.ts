import { stableJson } from "../core/hashes";
import type {
  GitHubCheck,
  GitHubClient,
  WorkflowRun,
} from "./github";

export type PollClock = {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
};

const defaultClock: PollClock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("CI wait aborted"));
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("CI wait aborted"));
        },
        { once: true },
      );
    }),
};

export type CiWatcherOptions = {
  github: GitHubClient;
  clock?: PollClock;
  pollMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  persist?: (snapshot: unknown) => Promise<void>;
};

export type CiResult = {
  runId?: number;
  aggregateName: string;
  conclusion: "success";
  completedAt: string;
};

const FAILED = new Set<GitHubCheck["status"]>([
  "FAILURE",
  "CANCELLED",
  "TIMED_OUT",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
]);

async function changedPersistence(
  value: unknown,
  previous: string,
  persist: CiWatcherOptions["persist"],
): Promise<string> {
  const serialized = stableJson(value);
  if (serialized !== previous) await persist?.(value);
  return serialized;
}

function assertActive(options: CiWatcherOptions, startedAt: number): void {
  if (options.signal?.aborted) throw new Error("CI wait aborted");
  const clock = options.clock ?? defaultClock;
  if (clock.now() - startedAt >= (options.timeoutMs ?? 30 * 60_000)) {
    throw new Error("CI wait timed out");
  }
}

export async function waitForPullRequestChecks(
  prNumber: number,
  options: CiWatcherOptions,
): Promise<CiResult> {
  const clock = options.clock ?? defaultClock;
  const startedAt = clock.now();
  let previous = "";
  while (true) {
    assertActive(options, startedAt);
    const checks = await options.github.pullRequestChecks(prNumber);
    previous = await changedPersistence(checks, previous, options.persist);
    for (const check of checks) {
      if (FAILED.has(check.status)) {
        throw new Error(`required check failed: ${check.name}`);
      }
    }
    const aggregate = checks.find((check) => check.name === "check");
    if (
      aggregate?.status === "SUCCESS" &&
      checks.every((check) => check.status === "SUCCESS")
    ) {
      return {
        aggregateName: "check",
        conclusion: "success",
        completedAt: new Date(clock.now()).toISOString(),
      };
    }
    await clock.sleep(options.pollMs ?? 10_000, options.signal);
  }
}

function failedConclusion(run: WorkflowRun): boolean {
  return (
    run.status === "completed" &&
    run.conclusion !== null &&
    run.conclusion !== "success"
  );
}

export async function waitForCommitCi(
  sha: string,
  options: CiWatcherOptions,
): Promise<CiResult> {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("CI SHA must be full");
  const clock = options.clock ?? defaultClock;
  const startedAt = clock.now();
  let previous = "";
  while (true) {
    assertActive(options, startedAt);
    const exact = (await options.github.listCommitRuns(sha))
      .filter((run) => run.headSha === sha)
      .toSorted((left, right) => right.databaseId - left.databaseId);
    previous = await changedPersistence(exact, previous, options.persist);
    const run = exact[0];
    if (run !== undefined) {
      if (failedConclusion(run)) {
        throw new Error(`exact commit CI failed: ${run.databaseId}`);
      }
      if (run.status === "completed" && run.conclusion === "success") {
        return {
          runId: run.databaseId,
          aggregateName: "CI",
          conclusion: "success",
          completedAt: run.updatedAt ?? run.createdAt,
        };
      }
    }
    await clock.sleep(options.pollMs ?? 10_000, options.signal);
  }
}
