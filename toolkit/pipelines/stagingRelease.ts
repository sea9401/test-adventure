import { requireApproval } from "../core/approvals";
import type { ToolkitTaskState } from "../schemas/task";
import {
  validateReleaseRepository,
  type GitClient,
  type ReleaseRepositoryState,
} from "./git";
import type { GitHubClient, PullRequestRef } from "./github";
import {
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
