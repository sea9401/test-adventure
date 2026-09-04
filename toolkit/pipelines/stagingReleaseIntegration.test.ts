import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { TaskStateStore } from "../core/taskState";
import type { ToolkitTaskState } from "../schemas/task";
import type { PollClock } from "./ciWatcher";
import type { GitClient, ReleaseRepositoryState } from "./git";
import type {
  GitHubCheck,
  GitHubClient,
  PullRequestRef,
  WorkflowRun,
} from "./github";
import {
  runStagingRelease,
  type RunStagingReleaseDependencies,
} from "./stagingRelease";
import type { RepositoryState } from "./verification";

const VERIFIED_SHA = "a".repeat(40);
const STAGING_SHA = "c".repeat(40);
const BRANCH = "feat/echo-warden";

class ImmediateClock implements PollClock {
  now(): number {
    return Date.parse("2026-09-02T00:05:00.000Z");
  }

  async sleep(): Promise<void> {}
}

class FakeGit implements GitClient {
  readonly calls: string[][] = [];

  async exec(_cwd: string, args: readonly string[]) {
    this.calls.push([...args]);
    return {
      exitCode: 0,
      stdout: args[0] === "rev-parse" ? `${STAGING_SHA}\n` : "",
      stderr: "",
    };
  }
}

class FakeGitHub implements GitHubClient {
  created = 0;
  merged = 0;
  checksRead = 0;
  deployReads = 0;
  pauseDeployOnce = false;
  pr: PullRequestRef | null = null;

  async findPullRequest(): Promise<PullRequestRef | null> {
    return this.pr;
  }

  async createPullRequest(input: {
    base: string;
    head: string;
    title: string;
    body: string;
  }): Promise<PullRequestRef> {
    this.created += 1;
    this.pr = {
      number: 2501,
      state: "OPEN",
      baseRefName: input.base,
      headRefName: input.head,
      url: "https://github.com/sea9401/test-adventure/pull/2501",
      mergeable: "MERGEABLE",
    };
    return this.pr;
  }

  async viewPullRequest(): Promise<PullRequestRef> {
    if (this.pr === null) throw new Error("PR has not been created");
    return this.pr;
  }

  async pullRequestChecks(): Promise<readonly GitHubCheck[]> {
    this.checksRead += 1;
    return [
      { name: "check", status: "SUCCESS" },
      { name: "unit", status: "SUCCESS" },
    ];
  }

  async listCommitRuns(): Promise<readonly WorkflowRun[]> {
    return [
      {
        databaseId: 7001,
        status: "completed",
        conclusion: "success",
        headSha: STAGING_SHA,
        url: "https://github.com/sea9401/test-adventure/actions/runs/7001",
        createdAt: "2026-09-02T00:04:00.000Z",
        updatedAt: "2026-09-02T00:05:00.000Z",
      },
    ];
  }

  async mergePullRequest(): Promise<{ exitCode: number }> {
    if (this.pr === null) throw new Error("PR has not been created");
    this.merged += 1;
    this.pr = {
      ...this.pr,
      state: "MERGED",
      mergedAt: "2026-09-02T00:03:00.000Z",
      mergeCommitSha: STAGING_SHA,
    };
    return { exitCode: 0 };
  }

  async listDeployRuns(): Promise<readonly WorkflowRun[]> {
    this.deployReads += 1;
    if (this.deployReads === 1) return [];
    if (this.pauseDeployOnce) {
      this.pauseDeployOnce = false;
      throw new Error("simulated deploy API interruption");
    }
    return [
      {
        databaseId: 9001,
        status: "completed",
        conclusion: "success",
        headSha: STAGING_SHA,
        url: "https://github.com/sea9401/test-adventure/actions/runs/9001",
        createdAt: "2026-09-02T00:06:00.000Z",
        updatedAt: "2026-09-02T00:07:00.000Z",
      },
    ];
  }
}

function initialTask(action: "pr" | "deploy-test"): ToolkitTaskState {
  return {
    schemaVersion: 1,
    taskId: "boss-echo-warden",
    adapterId: "unexplored-boss",
    adapterSpecVersion: 1,
    specPath: "boss.yaml",
    baseSha: VERIFIED_SHA,
    phase: "verify",
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    steps: {},
    artifacts: [],
    approvals: [
      {
        action,
        target: "staging",
        reason: "테스트 서버 전용 릴리스 승인",
        approvedAt: "2026-09-02T00:00:00.000Z",
      },
    ],
    manualPaths: [],
    fullVerification: {
      headSha: VERIFIED_SHA,
      repositoryHash: "repo",
      plannedArtifactHashes: {},
      specHash: "spec",
      checkGraphHash: "graph",
      completedAt: "2026-09-02T00:00:00.000Z",
      checks: {},
    },
  };
}

function releaseRepository(): ReleaseRepositoryState {
  return {
    branch: BRANCH,
    headSha: VERIFIED_SHA,
    upstream: null,
    changedPaths: [],
    unmergedPaths: [],
    operation: null,
  };
}

function verification(): RepositoryState {
  return {
    headSha: VERIFIED_SHA,
    dirtyPaths: [],
    dirtyFileHashes: {},
    unrelatedDirtyPaths: [],
    plannedArtifactHashes: {},
    repositoryHash: "repo",
    specHash: "spec",
    checkGraphHash: "graph",
  };
}

const roots: string[] = [];

async function setup(action: "pr" | "deploy-test") {
  const root = await mkdtemp(join(tmpdir(), "toolkit-staging-release-"));
  roots.push(root);
  const store = new TaskStateStore(root);
  await store.save(initialTask(action));
  const git = new FakeGit();
  const github = new FakeGitHub();
  let publicReads = 0;
  const dependencies: RunStagingReleaseDependencies = {
    projectRoot: root,
    store,
    git,
    github,
    readReleaseRepository: async () => releaseRepository(),
    inspectRepository: async () => verification(),
    verifyPublic: async (sha) => {
      publicReads += 1;
      return {
        ok: true,
        expectedSha: sha,
        buildId: sha,
        healthLatencyMs: 1,
        versionLatencyMs: 1,
        verifiedAt: "2026-09-02T00:08:00.000Z",
      };
    },
    clock: new ImmediateClock(),
  };
  return {
    store,
    git,
    github,
    dependencies,
    publicReads: () => publicReads,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("staging release integration", () => {
  it("persists every test-only phase and resumes without duplicate mutations", async () => {
    const fixture = await setup("deploy-test");
    fixture.github.pauseDeployOnce = true;

    await expect(
      runStagingRelease(
        "boss-echo-warden",
        "public-verified",
        false,
        fixture.dependencies,
      ),
    ).rejects.toThrow("simulated deploy API interruption");
    expect(
      (await fixture.store.load("boss-echo-warden")).stagingRelease?.phase,
    ).toBe("staging-ci-passed");
    expect(fixture.github.created).toBe(1);
    expect(fixture.github.merged).toBe(1);

    const completed = await runStagingRelease(
      "boss-echo-warden",
      "public-verified",
      false,
      fixture.dependencies,
    );

    expect(completed.stagingRelease).toMatchObject({
      phase: "public-verified",
      branch: BRANCH,
      verifiedSha: VERIFIED_SHA,
      phases: {
        pushed: { branch: BRANCH, sha: VERIFIED_SHA },
        "pr-open": { prNumber: 2501 },
        "merged-staging": { stagingSha: STAGING_SHA },
        "deploy-passed": { runId: 9001 },
        "public-verified": { stagingSha: STAGING_SHA, buildId: STAGING_SHA },
      },
    });
    expect(
      completed.stagingRelease?.phases["pr-open"]?.lastChecks,
    ).toHaveLength(2);
    expect(
      completed.stagingRelease?.phases["merged-staging"]?.lastRuns,
    ).toHaveLength(1);
    expect(
      completed.stagingRelease?.phases["staging-ci-passed"]?.deployCandidates,
    ).toHaveLength(1);
    expect(fixture.github.created).toBe(1);
    expect(fixture.github.merged).toBe(1);
    expect(fixture.publicReads()).toBe(1);

    const calls = fixture.git.calls.length;
    await expect(
      runStagingRelease(
        "boss-echo-warden",
        "public-verified",
        false,
        fixture.dependencies,
      ),
    ).resolves.toMatchObject({
      stagingRelease: { phase: "public-verified" },
    });
    expect(fixture.github.created).toBe(1);
    expect(fixture.github.merged).toBe(1);
    expect(fixture.publicReads()).toBe(1);
    expect(fixture.git.calls).toHaveLength(calls);
  });

  it("stops at a staging PR and leaves merge and deployment untouched", async () => {
    const fixture = await setup("pr");

    const result = await runStagingRelease(
      "boss-echo-warden",
      "pr-open",
      false,
      fixture.dependencies,
    );

    expect(result.stagingRelease?.phase).toBe("pr-open");
    expect(fixture.github.created).toBe(1);
    expect(fixture.github.checksRead).toBe(0);
    expect(fixture.github.merged).toBe(0);
    expect(fixture.github.deployReads).toBe(0);
    expect(fixture.publicReads()).toBe(0);
  });

  it("plans the release without persisting or mutating external state", async () => {
    const fixture = await setup("deploy-test");

    await runStagingRelease(
      "boss-echo-warden",
      "public-verified",
      true,
      fixture.dependencies,
    );

    expect((await fixture.store.load("boss-echo-warden")).stagingRelease).toBeUndefined();
    expect(fixture.git.calls).toEqual([]);
    expect(fixture.github.created).toBe(0);
    expect(fixture.github.merged).toBe(0);
    expect(fixture.publicReads()).toBe(0);
  });
});
