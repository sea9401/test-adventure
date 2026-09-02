import type { PollClock } from "./ciWatcher";
import type { GitHubClient, WorkflowRun } from "./github";

const defaultClock: PollClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export type StagingDeployWatcherOptions = {
  github: GitHubClient;
  baselineRunId: number;
  stagingCiCompletedAt: string;
  clock?: PollClock;
  pollMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  persist?: (runs: readonly WorkflowRun[]) => Promise<void>;
};

export type DeployResult = {
  runId: number;
  conclusion: "success";
  createdAt: string;
  candidateRunIds: readonly number[];
};

export async function waitForStagingDeploy(
  options: StagingDeployWatcherOptions,
): Promise<DeployResult> {
  const clock = options.clock ?? defaultClock;
  const startedAt = clock.now();
  const ciTime = Date.parse(options.stagingCiCompletedAt);
  while (true) {
    if (options.signal?.aborted) throw new Error("staging deploy wait aborted");
    if (clock.now() - startedAt >= (options.timeoutMs ?? 40 * 60_000)) {
      throw new Error("staging deploy wait timed out");
    }
    const candidates = (await options.github.listDeployRuns())
      .filter(
        (run) =>
          run.databaseId > options.baselineRunId &&
          Date.parse(run.createdAt) >= ciTime,
      )
      .toSorted(
        (left, right) =>
          Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
          left.databaseId - right.databaseId,
      );
    await options.persist?.(candidates);
    const candidate = candidates[0];
    if (candidate !== undefined) {
      if (
        candidate.status === "completed" &&
        candidate.conclusion !== "success"
      ) {
        throw new Error(`staging deploy failed: ${candidate.databaseId}`);
      }
      if (
        candidate.status === "completed" &&
        candidate.conclusion === "success"
      ) {
        return {
          runId: candidate.databaseId,
          conclusion: "success",
          createdAt: candidate.createdAt,
          candidateRunIds: candidates.map((run) => run.databaseId),
        };
      }
    }
    await clock.sleep(options.pollMs ?? 10_000, options.signal);
  }
}
