import { describe, expect, it } from "vitest";

import type { GitHubCheck, GitHubClient, WorkflowRun } from "./github";
import {
  waitForCommitCi,
  waitForPullRequestChecks,
} from "./ciWatcher";

class Clock {
  value = 0;
  now = () => this.value;
  sleep = async (ms: number) => {
    this.value += ms;
  };
}

function client(): GitHubClient & {
  checkResponses: GitHubCheck[][];
  runResponses: WorkflowRun[][];
} {
  return {
    checkResponses: [],
    runResponses: [],
    async pullRequestChecks() {
      return this.checkResponses.shift() ?? [];
    },
    async listCommitRuns() {
      return this.runResponses.shift() ?? [];
    },
    async findPullRequest() { return null; },
    async createPullRequest() { throw new Error("unused"); },
    async viewPullRequest() { throw new Error("unused"); },
    async mergePullRequest() { return { exitCode: 0 }; },
    async listDeployRuns() { return []; },
  };
}

describe("CI watchers", () => {
  it("waits through pending and requires aggregate check success", async () => {
    const github = client();
    github.checkResponses.push(
      [
        { name: "check", status: "PENDING" },
        { name: "unit", status: "SUCCESS" },
      ],
      [
        { name: "check", status: "SUCCESS" },
        { name: "unit", status: "SUCCESS" },
      ],
    );
    const result = await waitForPullRequestChecks(2501, {
      github,
      clock: new Clock(),
      pollMs: 10,
      timeoutMs: 100,
    });
    expect(result).toMatchObject({ aggregateName: "check", conclusion: "success" });
  });

  it("fails immediately on a completed required failure", async () => {
    const github = client();
    github.checkResponses.push([{ name: "check", status: "FAILURE" }]);
    await expect(
      waitForPullRequestChecks(2501, {
        github,
        clock: new Clock(),
        pollMs: 10,
        timeoutMs: 100,
      }),
    ).rejects.toThrow("required check failed: check");
  });

  it("selects the newest exact-SHA CI attempt and ignores wrong SHA", async () => {
    const github = client();
    const sha = "a".repeat(40);
    github.runResponses.push([
      {
        databaseId: 10,
        status: "completed",
        conclusion: "success",
        headSha: "b".repeat(40),
        url: "https://github.com/o/r/actions/runs/10",
        createdAt: "2026-09-02T00:00:00Z",
      },
      {
        databaseId: 12,
        status: "completed",
        conclusion: "success",
        headSha: sha,
        url: "https://github.com/o/r/actions/runs/12",
        createdAt: "2026-09-02T00:02:00Z",
      },
      {
        databaseId: 11,
        status: "completed",
        conclusion: "failure",
        headSha: sha,
        url: "https://github.com/o/r/actions/runs/11",
        createdAt: "2026-09-02T00:01:00Z",
      },
    ]);
    await expect(
      waitForCommitCi(sha, {
        github,
        clock: new Clock(),
        pollMs: 10,
        timeoutMs: 100,
      }),
    ).resolves.toMatchObject({ runId: 12, conclusion: "success" });
  });

  it("times out and honors abort", async () => {
    const github = client();
    github.checkResponses.push([], [], []);
    await expect(
      waitForPullRequestChecks(2501, {
        github,
        clock: new Clock(),
        pollMs: 10,
        timeoutMs: 20,
      }),
    ).rejects.toThrow("CI wait timed out");
    const controller = new AbortController();
    controller.abort();
    await expect(
      waitForPullRequestChecks(2501, {
        github,
        clock: new Clock(),
        signal: controller.signal,
      }),
    ).rejects.toThrow("CI wait aborted");
  });
});
