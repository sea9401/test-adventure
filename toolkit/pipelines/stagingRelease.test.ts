import { describe, expect, it } from "vitest";

import type { GitClient, ReleaseRepositoryState } from "./git";
import type { GitHubClient, PullRequestRef } from "./github";
import {
  ensureStagingPullRequest,
  pushVerifiedBranch,
  type StagingMutationContext,
} from "./stagingRelease";
import type { RepositoryState } from "./verification";
import type { ToolkitTaskState } from "../schemas/task";

function repository(): ReleaseRepositoryState {
  return {
    branch: "feat/echo-warden",
    headSha: "a".repeat(40),
    upstream: null,
    changedPaths: [],
    unmergedPaths: [],
    operation: null,
  };
}

function verification(): RepositoryState {
  return {
    headSha: "a".repeat(40),
    dirtyPaths: [],
    dirtyFileHashes: {},
    unrelatedDirtyPaths: [],
    plannedArtifactHashes: {},
    repositoryHash: "repo",
    specHash: "spec",
    checkGraphHash: "graph",
  };
}

function task(approved = true): ToolkitTaskState {
  return {
    schemaVersion: 1,
    taskId: "boss-echo-warden",
    adapterId: "unexplored-boss",
    adapterSpecVersion: 1,
    specPath: "boss.yaml",
    baseSha: "a".repeat(40),
    phase: "checkpoint",
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    steps: {},
    artifacts: [],
    approvals: approved
      ? [
          {
            action: "deploy-test",
            target: "staging",
            reason: "테스트 서버 배포 승인",
            approvedAt: "2026-09-02T00:00:00.000Z",
          },
        ]
      : [],
    manualPaths: [],
    fullVerification: {
      headSha: "a".repeat(40),
      repositoryHash: "repo",
      plannedArtifactHashes: {},
      specHash: "spec",
      checkGraphHash: "graph",
      completedAt: "2026-09-02T00:00:00.000Z",
      checks: {},
    },
  };
}

class FakeGit implements GitClient {
  mutableCalls: string[][] = [];
  async exec(_cwd: string, args: readonly string[]) {
    this.mutableCalls.push([...args]);
    return { exitCode: 0, stdout: "", stderr: "" };
  }
}

class FakeGitHub implements GitHubClient {
  created = 0;
  existing: PullRequestRef | null = null;
  async findPullRequest() {
    return this.existing;
  }
  async createPullRequest(input: {
    base: string;
    head: string;
    title: string;
    body: string;
  }) {
    this.created += 1;
    return {
      number: 2501,
      state: "OPEN" as const,
      baseRefName: input.base,
      headRefName: input.head,
      url: "https://github.com/sea9401/test-adventure/pull/2501",
    };
  }
  async viewPullRequest() {
    return (
      this.existing ?? {
        number: 2501,
        state: "OPEN" as const,
        baseRefName: "staging",
        headRefName: "feat/echo-warden",
        url: "https://github.com/sea9401/test-adventure/pull/2501",
      }
    );
  }
  async pullRequestChecks() {
    return [];
  }
  async listCommitRuns() {
    return [];
  }
  async mergePullRequest() {
    return { exitCode: 0 };
  }
  async listDeployRuns() {
    return [];
  }
}

function context(overrides: Partial<StagingMutationContext> = {}) {
  const git = new FakeGit();
  const github = new FakeGitHub();
  return {
    value: {
      projectRoot: "/project",
      task: task(),
      repository: repository(),
      verification: verification(),
      git,
      github,
      contentName: "메아리 감시자",
      imagePaths: [],
      ...overrides,
    } satisfies StagingMutationContext,
    git,
    github,
  };
}

describe("staging push and PR", () => {
  it("pushes the verified branch with an explicit refspec", async () => {
    const fixture = context();
    await expect(pushVerifiedBranch(fixture.value)).resolves.toEqual({
      branch: "feat/echo-warden",
      sha: "a".repeat(40),
    });
    expect(fixture.git.mutableCalls).toContainEqual([
      "push",
      "-u",
      "origin",
      "HEAD:refs/heads/feat/echo-warden",
    ]);
  });

  it("rejects missing approval, stale verification, and dirty state before push", async () => {
    await expect(
      pushVerifiedBranch(context({ task: task(false) }).value),
    ).rejects.toThrow("no approval covers push@staging");
    await expect(
      pushVerifiedBranch(
        context({ verification: { ...verification(), repositoryHash: "changed" } }).value,
      ),
    ).rejects.toThrow("full verification is stale");
    await expect(
      pushVerifiedBranch(
        context({ repository: { ...repository(), changedPaths: ["boss.yaml"] } }).value,
      ),
    ).rejects.toThrow("release push requires a clean worktree");
  });

  it("recovers an existing exact-head staging PR instead of creating another", async () => {
    const fixture = context();
    fixture.github.existing = {
      number: 2501,
      state: "OPEN",
      baseRefName: "staging",
      headRefName: "feat/echo-warden",
      url: "https://github.com/sea9401/test-adventure/pull/2501",
    };

    await expect(ensureStagingPullRequest(fixture.value)).resolves.toBe(
      fixture.github.existing,
    );
    expect(fixture.github.created).toBe(0);
  });

  it("rejects an existing PR with any base other than staging", async () => {
    const fixture = context();
    fixture.github.existing = {
      number: 2501,
      state: "OPEN",
      baseRefName: "main",
      headRefName: "feat/echo-warden",
      url: "https://github.com/sea9401/test-adventure/pull/2501",
    };
    await expect(ensureStagingPullRequest(fixture.value)).rejects.toThrow(
      "pull request base must be staging",
    );
  });
});
