import { describe, expect, it } from "vitest";

import type { GitHubClient, WorkflowRun } from "./github";
import { waitForStagingDeploy } from "./deployWatcher";

class Clock {
  value = Date.parse("2026-09-02T00:10:00Z");
  now = () => this.value;
  sleep = async (ms: number) => { this.value += ms; };
}

function github(responses: WorkflowRun[][]): GitHubClient {
  return {
    async listDeployRuns() { return responses.shift() ?? []; },
    async findPullRequest() { return null; },
    async createPullRequest() { throw new Error("unused"); },
    async viewPullRequest() { throw new Error("unused"); },
    async pullRequestChecks() { return []; },
    async listCommitRuns() { return []; },
    async mergePullRequest() { return { exitCode: 0 }; },
  };
}

function run(databaseId: number, createdAt: string, conclusion: string | null): WorkflowRun {
  return {
    databaseId,
    status: conclusion === null ? "in_progress" : "completed",
    conclusion,
    headSha: "informational",
    url: `https://github.com/o/r/actions/runs/${databaseId}`,
    createdAt,
  };
}

describe("waitForStagingDeploy", () => {
  it("ignores stale runs and watches the oldest post-CI candidate", async () => {
    const result = await waitForStagingDeploy({
      github: github([
        [
          run(9000, "2026-09-02T00:00:00Z", "success"),
          run(9003, "2026-09-02T00:06:00Z", "success"),
          run(9002, "2026-09-02T00:05:00Z", "success"),
        ],
      ]),
      baselineRunId: 9000,
      stagingCiCompletedAt: "2026-09-02T00:04:00Z",
      clock: new Clock(),
      pollMs: 10,
      timeoutMs: 100,
    });
    expect(result.runId).toBe(9002);
    expect(result.candidateRunIds).toEqual([9002, 9003]);
  });

  it("stops on a failed candidate and times out without one", async () => {
    await expect(
      waitForStagingDeploy({
        github: github([[run(9001, "2026-09-02T00:05:00Z", "failure")]]),
        baselineRunId: 9000,
        stagingCiCompletedAt: "2026-09-02T00:04:00Z",
        clock: new Clock(),
      }),
    ).rejects.toThrow("staging deploy failed: 9001");
    await expect(
      waitForStagingDeploy({
        github: github([[], [], []]),
        baselineRunId: 9000,
        stagingCiCompletedAt: "2026-09-02T00:04:00Z",
        clock: new Clock(),
        pollMs: 10,
        timeoutMs: 20,
      }),
    ).rejects.toThrow("staging deploy wait timed out");
  });
});
