import type { ArtifactOperation, ArtifactScope } from "../core/artifacts";

export type ExternalAction =
  | "asset-rights"
  | "push"
  | "pr"
  | "merge-staging"
  | "deploy-test";

export type ToolkitPhase =
  | "scaffold"
  | "images"
  | "verify"
  | "checkpoint"
  | "release";

export type StepStatus = "pending" | "running" | "passed" | "failed";

export type StepState = {
  status: StepStatus;
  inputHash: string;
  outputHash?: string;
  dependsOn: readonly string[];
  attempts: number;
  startedAt?: string;
  finishedAt?: string;
  logPath?: string;
  errorSummary?: string;
};

export type ArtifactRecord = {
  scope: ArtifactScope;
  path: string;
  operation: ArtifactOperation;
  ownershipKey?: string;
  outputHash: string;
  byteLength: number;
};

export type ApprovalRecord = {
  action: ExternalAction;
  target: string;
  reason: string;
  approvedAt: string;
};

export type ImageReviewRole = "boss" | "drop-30" | "drop-10" | "drop-rare";

export type ImageReviewRecord = {
  role: ImageReviewRole;
  contentHash: string;
  decision: "accept" | "reject";
  reason: string;
  reviewedAt: string;
};

export type FullVerificationCheckRecord = {
  inputHash: string;
  outputHash: string;
  finishedAt?: string;
  logPath?: string;
};

export type FullVerificationRecord = {
  headSha: string;
  repositoryHash: string;
  plannedArtifactHashes: Readonly<Record<string, string>>;
  specHash: string;
  checkGraphHash: string;
  completedAt: string;
  checks: Readonly<Record<string, FullVerificationCheckRecord>>;
};

export const STAGING_RELEASE_PHASES = [
  "verified",
  "pushed",
  "pr-open",
  "pr-ci-passed",
  "merged-staging",
  "staging-ci-passed",
  "deploy-passed",
  "public-verified",
] as const;

export type StagingReleasePhase = (typeof STAGING_RELEASE_PHASES)[number];

export type StagingReleaseState = {
  phase: StagingReleasePhase;
  branch: string;
  verifiedSha: string;
  phases: Partial<
    Record<StagingReleasePhase, Readonly<Record<string, unknown>>>
  >;
};

export type ToolkitTaskState = {
  schemaVersion: 1;
  taskId: string;
  adapterId: string;
  adapterSpecVersion: number;
  specPath: string;
  baseSha: string;
  phase: ToolkitPhase;
  createdAt: string;
  updatedAt: string;
  steps: Readonly<Record<string, StepState>>;
  artifacts: readonly ArtifactRecord[];
  approvals: readonly ApprovalRecord[];
  manualPaths: readonly string[];
  imageReviews?: Readonly<Partial<Record<ImageReviewRole, ImageReviewRecord>>>;
  fullVerification?: FullVerificationRecord;
  checkpointSha?: string;
  stagingRelease?: StagingReleaseState;
};
