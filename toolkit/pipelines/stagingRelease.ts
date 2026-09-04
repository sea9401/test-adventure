import { requireApproval } from "../core/approvals";
import { TaskStateStore } from "../core/taskState";
import type {
  StagingReleasePhase,
  StagingReleaseState,
  ToolkitTaskState,
} from "../schemas/task";
import { STAGING_RELEASE_PHASES } from "../schemas/task";
import {
  waitForCommitCi,
  waitForPullRequestChecks,
  type PollClock,
} from "./ciWatcher";
import { waitForStagingDeploy } from "./deployWatcher";
import {
  CliGitClient,
  readRepositoryState,
  validateReleaseRepository,
  type GitClient,
  type ReleaseRepositoryState,
} from "./git";
import {
  GhCliClient,
  type GitHubClient,
  type PullRequestRef,
  type WorkflowRun,
} from "./github";
import { nextReleasePhase } from "./releaseState";
import {
  verifyTestDeployment,
  type PublicVerificationDependencies,
  type PublicVerificationResult,
} from "./publicVerification";
import {
  repositoryState,
  requireCurrentFullVerification,
  type RepositoryState,
} from "./verification";

export type StagingMutationContext = {
  projectRoot: string;
  task: ToolkitTaskState;
  repository: ReleaseRepositoryState;
  verification: RepositoryState;
  git: GitClient;
  github: GitHubClient;
  contentName: string;
  imagePaths: readonly string[];
};

function assertVerified(context: StagingMutationContext): void {
  requireCurrentFullVerification(context.task, context.verification);
  validateReleaseRepository(context.task, context.repository);
  if (context.repository.headSha !== context.task.fullVerification?.headSha) {
    throw new Error("release repository HEAD does not match verification");
  }
}

export async function pushVerifiedBranch(
  context: StagingMutationContext,
): Promise<{ branch: string; sha: string }> {
  assertVerified(context);
  requireApproval(context.task, "push", "staging");
  if (context.repository.changedPaths.length > 0) {
    throw new Error("release push requires a clean worktree");
  }
  const branch = context.repository.branch!;
  const result = await context.git.exec(context.projectRoot, [
    "push",
    "-u",
    "origin",
    `HEAD:refs/heads/${branch}`,
  ]);
  if (result.exitCode !== 0) throw new Error("verified branch push failed");
  return { branch, sha: context.repository.headSha };
}

function assertStagingPr(pr: PullRequestRef, branch: string): void {
  if (pr.baseRefName !== "staging") {
    throw new Error("pull request base must be staging");
  }
  if (pr.headRefName !== branch) {
    throw new Error("pull request head does not match task branch");
  }
}

export async function ensureStagingPullRequest(
  context: StagingMutationContext,
): Promise<PullRequestRef> {
  assertVerified(context);
  requireApproval(context.task, "pr", "staging");
  const branch = context.repository.branch!;
  const existing = await context.github.findPullRequest(branch);
  if (existing !== null) {
    assertStagingPr(existing, branch);
    if (existing.state === "CLOSED") {
      throw new Error("existing staging pull request is closed without merge");
    }
    return existing;
  }
  const verification = context.task.fullVerification!;
  const body = [
    "Test-server-only staging change.",
    "",
    `- Task: ${context.task.taskId}`,
    `- Spec hash: ${verification.specHash}`,
    `- Verified SHA: ${verification.headSha}`,
    `- Checks: ${Object.keys(verification.checks).sort().join(", ")}`,
    `- Images: ${context.imagePaths.join(", ") || "none"}`,
    "- Scope: staging and test server only",
  ].join("\n");
  const created = await context.github.createPullRequest({
    base: "staging",
    head: branch,
    title: `${context.contentName} (${context.task.taskId})`,
    body,
  });
  assertStagingPr(created, branch);
  return created;
}

export async function mergePullRequestToStaging(
  context: StagingMutationContext,
  prNumber: number,
): Promise<{
  prNumber: number;
  stagingSha: string;
  mergedAt: string;
}> {
  assertVerified(context);
  requireApproval(context.task, "merge-staging", "staging");
  let pr = await context.github.viewPullRequest(prNumber);
  assertStagingPr(pr, context.repository.branch!);
  if (pr.state !== "MERGED") {
    if (pr.state !== "OPEN") throw new Error("staging pull request is not open");
    if (pr.mergeable !== "MERGEABLE") {
      throw new Error("staging pull request is not mergeable");
    }
    const merge = await context.github.mergePullRequest(prNumber);
    pr = await context.github.viewPullRequest(prNumber);
    if (merge.exitCode !== 0 && pr.state !== "MERGED") {
      throw new Error("staging squash merge failed");
    }
  }
  if (
    pr.state !== "MERGED" ||
    pr.baseRefName !== "staging" ||
    pr.mergeCommitSha === null ||
    pr.mergeCommitSha === undefined ||
    !/^[a-f0-9]{40}$/.test(pr.mergeCommitSha) ||
    typeof pr.mergedAt !== "string"
  ) {
    throw new Error("merged staging PR data is incomplete");
  }
  let result = await context.git.exec(context.projectRoot, [
    "fetch",
    "origin",
    "staging",
  ]);
  if (result.exitCode !== 0) throw new Error("could not fetch origin staging");
  result = await context.git.exec(context.projectRoot, [
    "rev-parse",
    "origin/staging",
  ]);
  const stagingSha = result.stdout.trim();
  if (result.exitCode !== 0 || stagingSha !== pr.mergeCommitSha) {
    throw new Error("origin staging SHA does not match PR merge commit");
  }
  return { prNumber, stagingSha, mergedAt: pr.mergedAt };
}

export type StagingReleaseTarget = "pr-open" | "public-verified";

export type RunStagingReleaseDependencies = {
  projectRoot: string;
  store: TaskStateStore;
  git?: GitClient;
  github?: GitHubClient;
  readReleaseRepository?: (
    root: string,
    git: GitClient,
  ) => Promise<ReleaseRepositoryState>;
  inspectRepository?: typeof repositoryState;
  verifyPublic?: (
    sha: string,
    dependencies?: PublicVerificationDependencies,
  ) => Promise<PublicVerificationResult>;
  publicDependencies?: PublicVerificationDependencies;
  clock?: PollClock;
  report?: (message: string) => void;
};

function phaseData(
  release: StagingReleaseState,
  phase: StagingReleasePhase,
): Readonly<Record<string, unknown>> {
  const data = release.phases[phase];
  if (data === undefined) throw new Error(`release phase data is missing: ${phase}`);
  return data;
}

function numberField(data: Readonly<Record<string, unknown>>, key: string): number {
  const value = data[key];
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`release phase field is invalid: ${key}`);
  }
  return Number(value);
}

function nonNegativeNumberField(
  data: Readonly<Record<string, unknown>>,
  key: string,
): number {
  const value = data[key];
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`release phase field is invalid: ${key}`);
  }
  return Number(value);
}

function stringField(data: Readonly<Record<string, unknown>>, key: string): string {
  const value = data[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`release phase field is invalid: ${key}`);
  }
  return value;
}

function successfulRun(
  runs: readonly WorkflowRun[],
  runId: number,
  label: string,
  expectedSha?: string,
): WorkflowRun {
  const run = runs.find((candidate) => candidate.databaseId === runId);
  if (
    run === undefined ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    (expectedSha !== undefined && run.headSha !== expectedSha)
  ) {
    throw new Error(`persisted ${label} run is no longer successful`);
  }
  return run;
}

function assertReleaseIdentity(
  release: StagingReleaseState,
  context: StagingMutationContext,
): void {
  if (
    release.branch !== context.repository.branch ||
    release.verifiedSha !== context.repository.headSha ||
    release.verifiedSha !== context.task.fullVerification?.headSha
  ) {
    throw new Error("persisted release identity no longer matches verification");
  }
}

async function saveRelease(
  task: ToolkitTaskState,
  release: StagingReleaseState,
  dependencies: RunStagingReleaseDependencies,
): Promise<ToolkitTaskState> {
  const next = {
    ...task,
    phase: "release" as const,
    updatedAt: new Date().toISOString(),
    stagingRelease: release,
  };
  await dependencies.store.save(next);
  dependencies.report?.(`release:${release.phase}`);
  return next;
}

async function saveObservation(
  task: ToolkitTaskState,
  release: StagingReleaseState,
  key: string,
  value: unknown,
  dependencies: RunStagingReleaseDependencies,
): Promise<{ task: ToolkitTaskState; release: StagingReleaseState }> {
  const phase = release.phase;
  const nextRelease: StagingReleaseState = {
    ...release,
    phases: {
      ...release.phases,
      [phase]: { ...phaseData(release, phase), [key]: structuredClone(value) },
    },
  };
  return {
    task: await saveRelease(task, nextRelease, dependencies),
    release: nextRelease,
  };
}

async function mutationContext(
  task: ToolkitTaskState,
  dependencies: RunStagingReleaseDependencies,
): Promise<StagingMutationContext> {
  const git = dependencies.git ?? new CliGitClient();
  const repository = await (
    dependencies.readReleaseRepository ?? readRepositoryState
  )(dependencies.projectRoot, git);
  const token = task.fullVerification;
  if (token === undefined) throw new Error("full verification is stale");
  const verification = await (
    dependencies.inspectRepository ?? repositoryState
  )(dependencies.projectRoot, task, {
    specHash: token.specHash,
    checkGraphHash: token.checkGraphHash,
  });
  return {
    projectRoot: dependencies.projectRoot,
    task,
    repository,
    verification,
    git,
    github: dependencies.github ?? new GhCliClient(),
    contentName: task.taskId,
    imagePaths: task.artifacts
      .filter(
        (artifact) =>
          artifact.scope === "project" && artifact.path.startsWith("public/images/"),
      )
      .map((artifact) => artifact.path),
  };
}

export async function runStagingRelease(
  taskId: string,
  target: StagingReleaseTarget,
  dryRun: boolean,
  dependencies: RunStagingReleaseDependencies,
): Promise<ToolkitTaskState> {
  let task = await dependencies.store.load(taskId);
  requireApproval(
    task,
    target === "pr-open" ? "pr" : "deploy-test",
    "staging",
  );
  let context = await mutationContext(task, dependencies);
  requireCurrentFullVerification(task, context.verification);
  validateReleaseRepository(task, context.repository);
  if (context.repository.changedPaths.length > 0) {
    throw new Error("staging release requires a clean worktree");
  }
  const plannedPhases =
    target === "pr-open"
      ? ["pushed", "pr-open"]
      : [
          "pushed",
          "pr-open",
          "pr-ci-passed",
          "merged-staging",
          "staging-ci-passed",
          "deploy-passed",
          "public-verified",
        ];
  if (dryRun) {
    for (const phase of plannedPhases) dependencies.report?.(`release-plan:${phase}`);
    return task;
  }
  let release: StagingReleaseState;
  if (task.stagingRelease === undefined) {
    release = {
      phase: "verified",
      branch: context.repository.branch!,
      verifiedSha: context.repository.headSha,
      phases: { verified: { sha: context.repository.headSha } },
    };
    task = await saveRelease(task, release, dependencies);
  } else {
    release = task.stagingRelease;
  }
  assertReleaseIdentity(release, context);

  if (
    STAGING_RELEASE_PHASES.indexOf(release.phase) >=
    STAGING_RELEASE_PHASES.indexOf(target)
  ) {
    return task;
  }

  while (release.phase !== target) {
    context = await mutationContext(task, dependencies);
    assertReleaseIdentity(release, context);
    switch (release.phase) {
      case "verified": {
        const pushed = await pushVerifiedBranch(context);
        release = nextReleasePhase(release, { phase: "pushed", data: pushed });
        break;
      }
      case "pushed": {
        const pr = await ensureStagingPullRequest(context);
        release = nextReleasePhase(release, {
          phase: "pr-open",
          data: { prNumber: pr.number, url: pr.url },
        });
        break;
      }
      case "pr-open": {
        const data = phaseData(release, "pr-open");
        const prNumber = numberField(data, "prNumber");
        const pr = await context.github.viewPullRequest(prNumber);
        assertStagingPr(pr, release.branch);
        if (pr.number !== prNumber || pr.url !== stringField(data, "url")) {
          throw new Error("persisted staging PR no longer matches GitHub");
        }
        const ci = await waitForPullRequestChecks(prNumber, {
          github: context.github,
          clock: dependencies.clock,
          persist: async (checks) => {
            ({ task, release } = await saveObservation(
              task,
              release,
              "lastChecks",
              checks,
              dependencies,
            ));
          },
        });
        release = nextReleasePhase(release, {
          phase: "pr-ci-passed",
          data: { prNumber, completedAt: ci.completedAt },
        });
        break;
      }
      case "pr-ci-passed": {
        let data = phaseData(release, "pr-ci-passed");
        const prNumber = numberField(
          data,
          "prNumber",
        );
        if (prNumber !== numberField(phaseData(release, "pr-open"), "prNumber")) {
          throw new Error("persisted staging PR number changed between phases");
        }
        if (data.baselineRunId === undefined) {
          const existingDeploys = await context.github.listDeployRuns();
          const observedBaseline = Math.max(
            0,
            ...existingDeploys.map((run) => run.databaseId),
          );
          ({ task, release } = await saveObservation(
            task,
            release,
            "baselineRunId",
            observedBaseline,
            dependencies,
          ));
          data = phaseData(release, "pr-ci-passed");
        }
        const baselineRunId = nonNegativeNumberField(data, "baselineRunId");
        const merged = await mergePullRequestToStaging(context, prNumber);
        release = nextReleasePhase(release, {
          phase: "merged-staging",
          data: { ...merged, baselineRunId },
        });
        break;
      }
      case "merged-staging": {
        const data = phaseData(release, "merged-staging");
        const stagingSha = stringField(data, "stagingSha");
        const fetchResult = await context.git.exec(context.projectRoot, [
          "fetch",
          "origin",
          "staging",
        ]);
        const shaResult = await context.git.exec(context.projectRoot, [
          "rev-parse",
          "origin/staging",
        ]);
        if (
          fetchResult.exitCode !== 0 ||
          shaResult.exitCode !== 0 ||
          shaResult.stdout.trim() !== stagingSha
        ) {
          throw new Error("persisted staging SHA no longer matches origin");
        }
        const ci = await waitForCommitCi(stagingSha, {
          github: context.github,
          clock: dependencies.clock,
          persist: async (runs) => {
            ({ task, release } = await saveObservation(
              task,
              release,
              "lastRuns",
              runs,
              dependencies,
            ));
          },
        });
        release = nextReleasePhase(release, {
          phase: "staging-ci-passed",
          data: {
            stagingSha,
            runId: ci.runId!,
            completedAt: ci.completedAt,
            baselineRunId: nonNegativeNumberField(data, "baselineRunId"),
          },
        });
        break;
      }
      case "staging-ci-passed": {
        const data = phaseData(release, "staging-ci-passed");
        const stagingSha = stringField(data, "stagingSha");
        successfulRun(
          await context.github.listCommitRuns(stagingSha),
          numberField(data, "runId"),
          "staging CI",
          stagingSha,
        );
        const deploy = await waitForStagingDeploy({
          github: context.github,
          baselineRunId: nonNegativeNumberField(data, "baselineRunId"),
          stagingCiCompletedAt: stringField(data, "completedAt"),
          clock: dependencies.clock,
          persist: async (runs) => {
            ({ task, release } = await saveObservation(
              task,
              release,
              "deployCandidates",
              runs,
              dependencies,
            ));
          },
        });
        release = nextReleasePhase(release, {
          phase: "deploy-passed",
          data: {
            stagingSha,
            runId: deploy.runId,
            candidateRunIds: deploy.candidateRunIds,
          },
        });
        break;
      }
      case "deploy-passed": {
        const data = phaseData(release, "deploy-passed");
        const stagingSha = stringField(data, "stagingSha");
        successfulRun(
          await context.github.listDeployRuns(),
          numberField(data, "runId"),
          "staging deploy",
        );
        const publicResult = await (
          dependencies.verifyPublic ?? verifyTestDeployment
        )(stagingSha, dependencies.publicDependencies);
        release = nextReleasePhase(release, {
          phase: "public-verified",
          data: {
            stagingSha,
            buildId: publicResult.buildId,
            verifiedAt: publicResult.verifiedAt,
          },
        });
        break;
      }
      case "public-verified":
        return task;
    }
    task = await saveRelease(task, release, dependencies);
  }
  return task;
}
