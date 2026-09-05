import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { ToolkitUsageError } from "../cli/command";
import { CliGitClient, type GitClient } from "./git";

const FULL_SHA = /^[a-f0-9]{40}$/;
const RELEASE_BRANCH = /^release\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const ISO_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export type PromotionRecord = {
  stagingSha: string;
  mainSha: string;
  promotedAt: string;
  pullRequest: number;
  contentRecord: string;
  patchNotes?: string;
};

export type PromotionHistory = {
  schemaVersion: 1;
  promotions: PromotionRecord[];
};

export type PromotionPathWarnings = {
  migrations: readonly string[];
  deploymentOrEnvironment: readonly string[];
  featureFlags: readonly string[];
  images: readonly string[];
  testOnlyCandidates: readonly string[];
};

export type PromotionAudit = {
  generatedAt: string;
  stagingRange: { from: string; to: string };
  mainRange: { from: string; to: string };
  stagingCommits: readonly { sha: string; subject: string }[];
  stagingPaths: readonly string[];
  mainOnlyPaths: readonly string[];
  overlappingPaths: readonly string[];
  warnings: PromotionPathWarnings;
};

export type PrepareStagingPromotionInput = {
  worktreePath: string;
  branch: string;
  stagingSha?: string;
  historyPath: string;
  dryRun: boolean;
};

export type RecordStagingPromotionInput = PromotionRecord & {
  historyPath: string;
  dryRun: boolean;
};

export type ProductionPromotionDependencies = {
  projectRoot: string;
  git?: GitClient;
  refreshRemoteRefs?: () => Promise<void>;
  now?: () => Date;
  report?: (message: string) => void;
};

function fullSha(value: unknown, label: string): string {
  if (typeof value !== "string" || !FULL_SHA.test(value)) {
    throw new ToolkitUsageError(`${label} must be a lowercase 40-character SHA`);
  }
  return value;
}

function validIsoTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_TIME.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function projectPath(projectRoot: string, path: string, label: string): string {
  if (isAbsolute(path) || path.trim() === "") {
    throw new ToolkitUsageError(`${label} must be a project-relative path`);
  }
  const root = resolve(projectRoot);
  const absolute = resolve(root, path);
  const local = relative(root, absolute);
  if (local === ".." || local.startsWith("../") || isAbsolute(local)) {
    throw new ToolkitUsageError(`${label} escapes the project root`);
  }
  return absolute;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function parseRecord(value: unknown, index: number): PromotionRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`promotion history entry ${index} must be an object`);
  }
  const entry = value as Record<string, unknown>;
  const promotedAt = entry.promotedAt;
  if (!validIsoTime(promotedAt)) {
    throw new Error(`promotion history entry ${index} has an invalid time`);
  }
  if (
    !Number.isSafeInteger(entry.pullRequest) ||
    (entry.pullRequest as number) <= 0
  ) {
    throw new Error(`promotion history entry ${index} has an invalid PR number`);
  }
  if (
    typeof entry.contentRecord !== "string" ||
    entry.contentRecord.trim() === ""
  ) {
    throw new Error(`promotion history entry ${index} has no content record`);
  }
  if (
    entry.patchNotes !== undefined &&
    (typeof entry.patchNotes !== "string" || entry.patchNotes.trim() === "")
  ) {
    throw new Error(`promotion history entry ${index} has invalid patch notes`);
  }
  return {
    stagingSha: fullSha(entry.stagingSha, `promotion history entry ${index} staging SHA`),
    mainSha: fullSha(entry.mainSha, `promotion history entry ${index} main SHA`),
    promotedAt,
    pullRequest: entry.pullRequest as number,
    contentRecord: entry.contentRecord,
    ...(typeof entry.patchNotes === "string"
      ? { patchNotes: entry.patchNotes }
      : {}),
  };
}

export async function loadPromotionHistory(
  projectRoot: string,
  historyPath: string,
): Promise<PromotionHistory> {
  const absolute = projectPath(projectRoot, historyPath, "promotion history");
  let value: unknown;
  try {
    value = JSON.parse(await readFile(absolute, "utf8"));
  } catch (error) {
    throw new Error(`could not read promotion history: ${historyPath}`, {
      cause: error,
    });
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("promotion history must be an object");
  }
  const history = value as Record<string, unknown>;
  if (history.schemaVersion !== 1 || !Array.isArray(history.promotions)) {
    throw new Error("promotion history must use schema version 1");
  }
  if (history.promotions.length === 0) {
    throw new Error("promotion history must contain a baseline entry");
  }
  const promotions = history.promotions.map(parseRecord);
  for (let index = 1; index < promotions.length; index += 1) {
    if (
      Date.parse(promotions[index].promotedAt) <=
      Date.parse(promotions[index - 1].promotedAt)
    ) {
      throw new Error("promotion history times must be strictly increasing");
    }
  }
  return { schemaVersion: 1, promotions };
}

function uniqueSorted(paths: readonly string[]): readonly string[] {
  return [...new Set(paths)].sort();
}

export function classifyPromotionPaths(
  paths: readonly string[],
): PromotionPathWarnings {
  const normalized = uniqueSorted(paths);
  return {
    migrations: normalized.filter(
      (path) => path.startsWith("drizzle/") || path.startsWith("migrations/"),
    ),
    deploymentOrEnvironment: normalized.filter((path) => {
      const lower = path.toLowerCase();
      return (
        lower.startsWith(".github/workflows/") ||
        lower.startsWith("deploy/") ||
        lower.startsWith(".env") ||
        lower.includes("/environment") ||
        /(^|\/)(next|vitest|playwright|eslint)\.config\./.test(lower)
      );
    }),
    featureFlags: normalized.filter((path) => {
      const lower = path.toLowerCase();
      return (
        lower.includes("featureflag") ||
        lower.includes("feature-flag") ||
        lower.includes("feature_flag") ||
        lower.includes("/flags/")
      );
    }),
    images: normalized.filter((path) => path.startsWith("public/images/")),
    testOnlyCandidates: normalized.filter((path) => {
      const lower = path.toLowerCase();
      return (
        lower.startsWith("e2e/") ||
        lower.startsWith("tests/") ||
        lower.startsWith("src/app/dev/") ||
        lower.includes("/__tests__/") ||
        /\.(test|spec)\.[^/]+$/.test(lower)
      );
    }),
  };
}

async function required(
  git: GitClient,
  cwd: string,
  args: readonly string[],
): Promise<string> {
  return (await requiredRaw(git, cwd, args)).trim();
}

async function requiredRaw(
  git: GitClient,
  cwd: string,
  args: readonly string[],
): Promise<string> {
  const result = await git.exec(cwd, args);
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args[0]} failed${result.stderr.trim() === "" ? "" : `: ${result.stderr.trim()}`}`,
    );
  }
  return result.stdout;
}

async function resolveCommit(
  git: GitClient,
  root: string,
  revision: string,
): Promise<string> {
  const sha = await required(git, root, [
    "rev-parse",
    "--verify",
    `${revision}^{commit}`,
  ]);
  return fullSha(sha, revision);
}

async function assertAncestor(
  git: GitClient,
  root: string,
  ancestor: string,
  descendant: string,
  label: string,
): Promise<void> {
  const result = await git.exec(root, [
    "merge-base",
    "--is-ancestor",
    ancestor,
    descendant,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`${label} is not an ancestor of the current branch`);
  }
}

async function changedPaths(
  git: GitClient,
  root: string,
  from: string,
  to: string,
): Promise<readonly string[]> {
  const output = await requiredRaw(git, root, [
    "diff",
    "--name-only",
    "-z",
    from,
    to,
    "--",
  ]);
  return uniqueSorted(output.split("\0").filter(Boolean));
}

async function unmergedPaths(
  git: GitClient,
  root: string,
): Promise<readonly string[]> {
  const output = await requiredRaw(git, root, [
    "diff",
    "--name-only",
    "--diff-filter=U",
    "-z",
  ]);
  return uniqueSorted(output.split("\0").filter(Boolean));
}

async function commits(
  git: GitClient,
  root: string,
  from: string,
  to: string,
): Promise<readonly { sha: string; subject: string }[]> {
  const output = await required(git, root, [
    "log",
    "--reverse",
    "--format=%H%x00%s%x00",
    `${from}..${to}`,
  ]);
  const parts = output.split("\0").filter(Boolean);
  const result: Array<{ sha: string; subject: string }> = [];
  for (let index = 0; index < parts.length; index += 2) {
    result.push({ sha: parts[index], subject: parts[index + 1] ?? "" });
  }
  return result;
}

async function refresh(
  dependencies: ProductionPromotionDependencies,
  git: GitClient,
): Promise<void> {
  if (dependencies.refreshRemoteRefs !== undefined) {
    await dependencies.refreshRemoteRefs();
    return;
  }
  await required(git, dependencies.projectRoot, [
    "fetch",
    "--prune",
    "origin",
    "main",
    "staging",
  ]);
}

function reportAudit(
  audit: PromotionAudit,
  report?: (message: string) => void,
): void {
  report?.(`staging:${audit.stagingRange.to}`);
  report?.(`main:${audit.mainRange.to}`);
  report?.(`staging-range:${audit.stagingRange.from}..${audit.stagingRange.to}`);
  report?.(`main-range:${audit.mainRange.from}..${audit.mainRange.to}`);
  report?.(`staging-commits:${audit.stagingCommits.length}`);
  report?.(`staging-paths:${audit.stagingPaths.length}`);
  report?.(`main-only-paths:${audit.mainOnlyPaths.length}`);
  report?.(`overlapping-paths:${audit.overlappingPaths.length}`);
  for (const commit of audit.stagingCommits) {
    report?.(`staging-commit:${commit.sha}:${commit.subject}`);
  }
  for (const path of audit.stagingPaths) report?.(`staging-path:${path}`);
  for (const path of audit.mainOnlyPaths) report?.(`main-only-path:${path}`);
  for (const path of audit.overlappingPaths) report?.(`overlap:${path}`);
  for (const path of audit.warnings.migrations) report?.(`warning:migration:${path}`);
  for (const path of audit.warnings.deploymentOrEnvironment) {
    report?.(`warning:deployment-or-environment:${path}`);
  }
  for (const path of audit.warnings.featureFlags) {
    report?.(`warning:feature-flag:${path}`);
  }
  for (const path of audit.warnings.images) report?.(`warning:image:${path}`);
  for (const path of audit.warnings.testOnlyCandidates) {
    report?.(`warning:test-only-candidate:${path}`);
  }
}

async function auditPromotion(
  input: PrepareStagingPromotionInput,
  dependencies: ProductionPromotionDependencies,
  git: GitClient,
): Promise<PromotionAudit> {
  const history = await loadPromotionHistory(
    dependencies.projectRoot,
    input.historyPath,
  );
  const previous = history.promotions.at(-1)!;
  const currentMain = await resolveCommit(git, dependencies.projectRoot, "origin/main");
  const remoteStaging = await resolveCommit(
    git,
    dependencies.projectRoot,
    "origin/staging",
  );
  if (input.stagingSha !== undefined) {
    fullSha(input.stagingSha, "selected staging SHA");
    if (input.stagingSha !== remoteStaging) {
      throw new Error(
        `selected staging SHA does not match origin/staging (${remoteStaging})`,
      );
    }
  }
  await assertAncestor(
    git,
    dependencies.projectRoot,
    previous.stagingSha,
    remoteStaging,
    "last promoted staging SHA",
  );
  await assertAncestor(
    git,
    dependencies.projectRoot,
    previous.mainSha,
    currentMain,
    "last promoted main SHA",
  );
  const stagingPaths = await changedPaths(
    git,
    dependencies.projectRoot,
    previous.stagingSha,
    remoteStaging,
  );
  const mainOnlyPaths = await changedPaths(
    git,
    dependencies.projectRoot,
    previous.mainSha,
    currentMain,
  );
  const mainSet = new Set(mainOnlyPaths);
  const audit: PromotionAudit = {
    generatedAt: (dependencies.now?.() ?? new Date()).toISOString(),
    stagingRange: { from: previous.stagingSha, to: remoteStaging },
    mainRange: { from: previous.mainSha, to: currentMain },
    stagingCommits: await commits(
      git,
      dependencies.projectRoot,
      previous.stagingSha,
      remoteStaging,
    ),
    stagingPaths,
    mainOnlyPaths,
    overlappingPaths: stagingPaths.filter((path) => mainSet.has(path)),
    warnings: classifyPromotionPaths(stagingPaths),
  };
  reportAudit(audit, dependencies.report);
  if (stagingPaths.length === 0) {
    throw new Error("staging has no changes since the last promotion");
  }
  return audit;
}

function assertSafeWorktree(path: string): string {
  if (!isAbsolute(path)) {
    throw new ToolkitUsageError("promotion worktree must be an absolute path inside /tmp");
  }
  const absolute = resolve(path);
  const local = relative("/tmp", absolute);
  if (
    absolute === "/tmp" ||
    local === ".." ||
    local.startsWith("../") ||
    isAbsolute(local)
  ) {
    throw new ToolkitUsageError("promotion worktree must be inside /tmp");
  }
  return absolute;
}

function assertReleaseBranch(branch: string): void {
  if (
    !RELEASE_BRANCH.test(branch) ||
    branch.includes("..") ||
    branch.endsWith("/")
  ) {
    throw new ToolkitUsageError("promotion branch must be a valid release/* name");
  }
}

async function writeJsonAtomic(
  path: string,
  value: unknown,
  mode = 0o600,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode,
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function writeCandidateState(
  worktreePath: string,
  branch: string,
  audit: PromotionAudit,
  status: "ready" | "conflicted",
  conflictingPaths: readonly string[],
): Promise<void> {
  await writeJsonAtomic(
    resolve(worktreePath, ".toolkit/work/production-promotion/state.json"),
    {
      schemaVersion: 1,
      status,
      branch,
      worktreePath,
      audit,
      conflictingPaths,
      nextRecord: {
        stagingSha: audit.stagingRange.to,
        mainSha: null,
        promotedAt: null,
        pullRequest: null,
        contentRecord: null,
        patchNotes: null,
      },
      drafts: {
        patchNotes: ".toolkit/work/production-promotion/PATCH_NOTES_DRAFT.md",
        contentRecord:
          ".toolkit/work/production-promotion/CONTENT_MODIFICATION_DRAFT.md",
      },
    },
  );
}

async function writeCandidateDrafts(
  worktreePath: string,
  audit: PromotionAudit,
): Promise<void> {
  const draftRoot = resolve(
    worktreePath,
    ".toolkit/work/production-promotion",
  );
  await mkdir(draftRoot, { recursive: true });
  const commitLines = audit.stagingCommits.map(
    (commit) => `- ${commit.subject} (\`${commit.sha}\`)`,
  );
  const pathLines = audit.stagingPaths.map((path) => `- \`${path}\``);
  const warningLines = [
    ...audit.overlappingPaths.map((path) => `- main과 겹침: \`${path}\``),
    ...audit.warnings.migrations.map((path) => `- DB 마이그레이션: \`${path}\``),
    ...audit.warnings.deploymentOrEnvironment.map(
      (path) => `- 배포·환경 설정: \`${path}\``,
    ),
    ...audit.warnings.featureFlags.map((path) => `- 기능 플래그: \`${path}\``),
    ...audit.warnings.images.map((path) => `- 이미지: \`${path}\``),
    ...audit.warnings.testOnlyCandidates.map(
      (path) => `- 테스트 전용 후보: \`${path}\``,
    ),
  ];
  await writeFile(
    resolve(draftRoot, "PATCH_NOTES_DRAFT.md"),
    [
      "# 패치 노트 초안",
      "",
      `- 테스트 서버 기준: \`${audit.stagingRange.to}\``,
      `- 운영 기준: \`${audit.mainRange.to}\``,
      "",
      "## 포함된 변경",
      "",
      ...(commitLines.length === 0 ? ["- 커밋 설명 없음"] : commitLines),
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    resolve(draftRoot, "CONTENT_MODIFICATION_DRAFT.md"),
    [
      "# 운영 승격 내용수정 검토 초안",
      "",
      `- staging 범위: \`${audit.stagingRange.from}..${audit.stagingRange.to}\``,
      `- main 범위: \`${audit.mainRange.from}..${audit.mainRange.to}\``,
      "- 운영 반영 SHA: PR 병합 후 입력",
      "- 검토 상태: 입력 필요",
      "",
      "## 변경 파일",
      "",
      ...pathLines,
      "",
      "## 별도 확인 항목",
      "",
      ...(warningLines.length === 0 ? ["- 없음"] : warningLines),
      "",
    ].join("\n"),
    "utf8",
  );
}

export async function prepareStagingPromotion(
  input: PrepareStagingPromotionInput,
  dependencies: ProductionPromotionDependencies,
): Promise<PromotionAudit> {
  const git = dependencies.git ?? new CliGitClient();
  const worktreePath = assertSafeWorktree(input.worktreePath);
  assertReleaseBranch(input.branch);
  projectPath(dependencies.projectRoot, input.historyPath, "promotion history");
  await refresh(dependencies, git);
  const audit = await auditPromotion(input, dependencies, git);

  if (await pathExists(worktreePath)) {
    throw new Error(`promotion worktree already exists: ${worktreePath}`);
  }
  let worktreeParent: string;
  try {
    worktreeParent = await realpath(dirname(worktreePath));
  } catch {
    throw new ToolkitUsageError(
      "promotion worktree parent must already exist inside /tmp",
    );
  }
  const parentLocal = relative("/tmp", worktreeParent);
  const parentIsSafe =
    worktreeParent === "/tmp" ||
    (parentLocal !== ".." &&
      !parentLocal.startsWith("../") &&
      !isAbsolute(parentLocal));
  if (!parentIsSafe) {
    throw new ToolkitUsageError("promotion worktree must be inside /tmp");
  }
  const branchCheck = await git.exec(dependencies.projectRoot, [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${input.branch}`,
  ]);
  if (branchCheck.exitCode === 0) {
    throw new Error(`promotion branch already exists: ${input.branch}`);
  }
  if (branchCheck.exitCode !== 1) {
    throw new Error("could not check whether the promotion branch exists");
  }
  await required(git, dependencies.projectRoot, [
    "check-ref-format",
    "--branch",
    input.branch,
  ]);
  dependencies.report?.(`worktree:${worktreePath}`);
  dependencies.report?.(`branch:${input.branch}`);
  if (input.dryRun) return audit;

  await required(git, dependencies.projectRoot, [
    "worktree",
    "add",
    "-b",
    input.branch,
    worktreePath,
    audit.mainRange.to,
  ]);
  const patchPath = resolve(
    worktreePath,
    ".toolkit/work/production-promotion/staging.patch",
  );
  await mkdir(resolve(patchPath, ".."), { recursive: true });
  await required(git, dependencies.projectRoot, [
    "diff",
    "--binary",
    "--full-index",
    "--find-renames",
    `--output=${patchPath}`,
    audit.stagingRange.from,
    audit.stagingRange.to,
    "--",
  ]);
  const applyResult = await git.exec(worktreePath, [
    "apply",
    "--3way",
    "--index",
    patchPath,
  ]);
  await rm(patchPath, { force: true });
  if (applyResult.exitCode !== 0) {
    const conflicts = await unmergedPaths(git, worktreePath);
    const actualConflicts = conflicts.length > 0 ? conflicts : audit.overlappingPaths;
    await writeCandidateState(
      worktreePath,
      input.branch,
      audit,
      "conflicted",
      actualConflicts,
    );
    await writeCandidateDrafts(worktreePath, audit);
    throw new Error(
      `promotion patch has conflicts${actualConflicts.length === 0 ? "" : `: ${actualConflicts.join(", ")}`}`,
    );
  }
  await writeCandidateState(worktreePath, input.branch, audit, "ready", []);
  await writeCandidateDrafts(worktreePath, audit);
  dependencies.report?.("candidate:ready");
  return audit;
}

async function assertDocumentationPath(
  root: string,
  path: string,
  label: string,
): Promise<void> {
  const absolute = projectPath(root, path, label);
  const entry = await stat(absolute).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
  if (!path.startsWith("docs/") || entry === null || !entry.isFile()) {
    throw new ToolkitUsageError(`${label} must name an existing file under docs/`);
  }
}

export async function recordStagingPromotion(
  input: RecordStagingPromotionInput,
  dependencies: ProductionPromotionDependencies,
): Promise<PromotionHistory> {
  const git = dependencies.git ?? new CliGitClient();
  const stagingSha = fullSha(input.stagingSha, "staging SHA");
  const mainSha = fullSha(input.mainSha, "main SHA");
  if (!validIsoTime(input.promotedAt)) {
    throw new ToolkitUsageError("promoted time must be ISO-8601");
  }
  if (!Number.isSafeInteger(input.pullRequest) || input.pullRequest <= 0) {
    throw new ToolkitUsageError("pull request must be a positive integer");
  }
  await assertDocumentationPath(
    dependencies.projectRoot,
    input.contentRecord,
    "content record",
  );
  if (input.patchNotes !== undefined) {
    await assertDocumentationPath(
      dependencies.projectRoot,
      input.patchNotes,
      "patch notes",
    );
  }
  await refresh(dependencies, git);
  const resolvedStaging = await resolveCommit(
    git,
    dependencies.projectRoot,
    stagingSha,
  );
  const resolvedMain = await resolveCommit(git, dependencies.projectRoot, mainSha);
  if (resolvedStaging !== stagingSha || resolvedMain !== mainSha) {
    throw new Error("promotion SHAs must resolve exactly to commits");
  }
  const remoteStaging = await resolveCommit(
    git,
    dependencies.projectRoot,
    "origin/staging",
  );
  const remoteMain = await resolveCommit(git, dependencies.projectRoot, "origin/main");
  await assertAncestor(
    git,
    dependencies.projectRoot,
    stagingSha,
    remoteStaging,
    "recorded staging SHA",
  );
  await assertAncestor(
    git,
    dependencies.projectRoot,
    mainSha,
    remoteMain,
    "recorded main SHA",
  );

  const history = await loadPromotionHistory(
    dependencies.projectRoot,
    input.historyPath,
  );
  const previous = history.promotions.at(-1)!;
  if (history.promotions.some((entry) => entry.stagingSha === stagingSha)) {
    throw new Error("staging SHA is already recorded");
  }
  if (history.promotions.some((entry) => entry.mainSha === mainSha)) {
    throw new Error("main SHA is already recorded");
  }
  if (Date.parse(input.promotedAt) <= Date.parse(previous.promotedAt)) {
    throw new Error("promotion time must be later than the previous record");
  }
  await assertAncestor(
    git,
    dependencies.projectRoot,
    previous.stagingSha,
    stagingSha,
    "previous staging SHA",
  );
  await assertAncestor(
    git,
    dependencies.projectRoot,
    previous.mainSha,
    mainSha,
    "previous main SHA",
  );
  const record: PromotionRecord = {
    stagingSha,
    mainSha,
    promotedAt: input.promotedAt,
    pullRequest: input.pullRequest,
    contentRecord: input.contentRecord,
    ...(input.patchNotes === undefined ? {} : { patchNotes: input.patchNotes }),
  };
  const next: PromotionHistory = {
    schemaVersion: 1,
    promotions: [...history.promotions, record],
  };
  dependencies.report?.(`record:staging:${stagingSha}`);
  dependencies.report?.(`record:main:${mainSha}`);
  if (!input.dryRun) {
    await writeJsonAtomic(
      projectPath(dependencies.projectRoot, input.historyPath, "promotion history"),
      next,
      0o644,
    );
  }
  return next;
}
