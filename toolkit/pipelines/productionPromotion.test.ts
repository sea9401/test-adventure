import { execFile } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { CliGitClient } from "./git";
import {
  classifyPromotionPaths,
  loadPromotionHistory,
  prepareStagingPromotion,
  recordStagingPromotion,
  type PromotionHistory,
} from "./productionPromotion";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function git(root: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
  return result.stdout.trim();
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function commitFile(
  root: string,
  path: string,
  contents: string,
  message: string,
): Promise<string> {
  const absolute = join(root, path);
  await mkdir(join(absolute, ".."), { recursive: true });
  await writeFile(absolute, contents, "utf8");
  await git(root, "add", "--", path);
  await git(root, "commit", "-m", message);
  return git(root, "rev-parse", "HEAD");
}

type RepositoryFixture = {
  root: string;
  lastStagingSha: string;
  lastMainSha: string;
  stagingSha: string;
  mainSha: string;
  historyPath: string;
};

async function repositoryFixture(conflict = false): Promise<RepositoryFixture> {
  const root = await mkdtemp(join(tmpdir(), "production-promotion-repo-"));
  roots.push(root);
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "Toolkit Test");
  await git(root, "config", "user.email", "toolkit@example.com");
  const lastStagingSha = await commitFile(
    root,
    "src/shared.txt",
    "baseline\n",
    "staging baseline",
  );
  await git(root, "branch", "staging", lastStagingSha);

  const historyPath = "docs/release-promotions/staging-production.json";
  const initialHistory: PromotionHistory = {
    schemaVersion: 1,
    promotions: [
      {
        stagingSha: lastStagingSha,
        mainSha: "0".repeat(40),
        promotedAt: "2026-09-05T04:51:54+09:00",
        pullRequest: 2518,
        contentRecord: "docs/content-modification-records/initial.md",
      },
    ],
  };
  await mkdir(join(root, "docs/content-modification-records"), {
    recursive: true,
  });
  await writeFile(
    join(root, "docs/content-modification-records/initial.md"),
    "initial\n",
    "utf8",
  );
  await mkdir(join(root, "docs/release-promotions"), { recursive: true });
  await writeFile(
    join(root, historyPath),
    `${JSON.stringify(initialHistory, null, 2)}\n`,
    "utf8",
  );
  await git(root, "add", "docs");
  await git(root, "commit", "-m", "record initial promotion");
  const lastMainSha = await git(root, "rev-parse", "HEAD");
  initialHistory.promotions[0].mainSha = lastMainSha;
  await writeFile(
    join(root, historyPath),
    `${JSON.stringify(initialHistory, null, 2)}\n`,
    "utf8",
  );
  await git(root, "add", historyPath);
  await git(root, "commit", "-m", "anchor initial main sha");
  // The record intentionally points to the deployed main commit immediately
  // before the bookkeeping commit.

  const mainSha = await commitFile(
    root,
    conflict ? "src/shared.txt" : "src/main-hotfix.txt",
    conflict ? "main version\n" : "main hotfix\n",
    "main-only hotfix",
  );

  await git(root, "switch", "staging");
  const stagingSha = await commitFile(
    root,
    conflict ? "src/shared.txt" : "src/staging-feature.txt",
    conflict ? "staging version\n" : "staging feature\n",
    "tested staging feature",
  );
  await git(root, "switch", "main");
  await git(root, "update-ref", "refs/remotes/origin/main", mainSha);
  await git(root, "update-ref", "refs/remotes/origin/staging", stagingSha);

  return {
    root,
    lastStagingSha,
    lastMainSha,
    stagingSha,
    mainSha,
    historyPath,
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("production promotion path classification", () => {
  it("flags risky surfaces without excluding them", () => {
    expect(
      classifyPromotionPaths([
        ".github/workflows/deploy.yml",
        "drizzle/0042.sql",
        "e2e/staging-only.spec.ts",
        "public/images/monster/new.webp",
        "src/config/featureFlags.ts",
        "src/game/combat.ts",
      ]),
    ).toEqual({
      migrations: ["drizzle/0042.sql"],
      deploymentOrEnvironment: [".github/workflows/deploy.yml"],
      featureFlags: ["src/config/featureFlags.ts"],
      images: ["public/images/monster/new.webp"],
      testOnlyCandidates: ["e2e/staging-only.spec.ts"],
    });
  });

  it("loads the repository's verified promotion baseline", async () => {
    const history = await loadPromotionHistory(
      process.cwd(),
      "docs/release-promotions/staging-production.json",
    );
    expect(history.promotions.at(-1)).toMatchObject({
      stagingSha: "15b031e1f45901c27c515a0754ebcebea7018b47",
      mainSha: "39e9d6f78465999a8afd4d375489913ed442945b",
      pullRequest: 2518,
    });
  });
});

describe("prepareStagingPromotion", () => {
  it("reports exact ranges in dry-run mode without creating a branch or worktree", async () => {
    const fixture = await repositoryFixture();
    const target = join(tmpdir(), `promotion-dry-${Date.now()}`);
    const reports: string[] = [];

    const result = await prepareStagingPromotion(
      {
        worktreePath: target,
        branch: "release/staging-dry-run",
        stagingSha: fixture.stagingSha,
        historyPath: fixture.historyPath,
        dryRun: true,
      },
      {
        projectRoot: fixture.root,
        git: new CliGitClient(),
        refreshRemoteRefs: async () => {},
        report: (message) => reports.push(message),
      },
    );

    expect(result.stagingRange).toEqual({
      from: fixture.lastStagingSha,
      to: fixture.stagingSha,
    });
    expect(result.mainRange.from).toBe(fixture.lastMainSha);
    expect(result.mainRange.to).toBe(fixture.mainSha);
    expect(result.stagingPaths).toEqual(["src/staging-feature.txt"]);
    expect(result.mainOnlyPaths).toContain("src/main-hotfix.txt");
    expect(result.overlappingPaths).toEqual([]);
    expect(await exists(target)).toBe(false);
    expect(
      await git(
        fixture.root,
        "show-ref",
        "--verify",
        "--quiet",
        "refs/heads/release/staging-dry-run",
      ).catch(() => "missing"),
    ).toBe("missing");
    expect(reports).toContain(`staging:${fixture.stagingSha}`);
  });

  it("creates a main-based worktree with the complete staging delta staged", async () => {
    const fixture = await repositoryFixture();
    const target = join(tmpdir(), `promotion-ready-${Date.now()}`);
    roots.push(target);

    await prepareStagingPromotion(
      {
        worktreePath: target,
        branch: "release/staging-ready",
        historyPath: fixture.historyPath,
        dryRun: false,
      },
      {
        projectRoot: fixture.root,
        git: new CliGitClient(),
        refreshRemoteRefs: async () => {},
        now: () => new Date("2026-09-06T12:00:00+09:00"),
      },
    );

    expect(await git(target, "rev-parse", "HEAD")).toBe(fixture.mainSha);
    expect(await readFile(join(target, "src/main-hotfix.txt"), "utf8")).toBe(
      "main hotfix\n",
    );
    expect(
      await readFile(join(target, "src/staging-feature.txt"), "utf8"),
    ).toBe("staging feature\n");
    expect(await git(target, "diff", "--cached", "--name-only")).toBe(
      "src/staging-feature.txt",
    );
    const state = JSON.parse(
      await readFile(
        join(target, ".toolkit/work/production-promotion/state.json"),
        "utf8",
      ),
    ) as { nextRecord: { stagingSha: string; mainSha: null } };
    expect(state.nextRecord).toMatchObject({
      stagingSha: fixture.stagingSha,
      mainSha: null,
    });
    expect(
      await readFile(
        join(
          target,
          ".toolkit/work/production-promotion/PATCH_NOTES_DRAFT.md",
        ),
        "utf8",
      ),
    ).toContain("tested staging feature");
  });

  it("preserves a conflicted worktree and identifies the overlapping path", async () => {
    const fixture = await repositoryFixture(true);
    const target = join(tmpdir(), `promotion-conflict-${Date.now()}`);
    roots.push(target);

    await expect(
      prepareStagingPromotion(
        {
          worktreePath: target,
          branch: "release/staging-conflict",
          historyPath: fixture.historyPath,
          dryRun: false,
        },
        {
          projectRoot: fixture.root,
          git: new CliGitClient(),
          refreshRemoteRefs: async () => {},
        },
      ),
    ).rejects.toThrow("promotion patch has conflicts: src/shared.txt");
    expect(await exists(target)).toBe(true);
    expect(await git(target, "diff", "--name-only", "--diff-filter=U")).toBe(
      "src/shared.txt",
    );
  });

  it("rejects worktree targets outside /tmp", async () => {
    const fixture = await repositoryFixture();
    await expect(
      prepareStagingPromotion(
        {
          worktreePath: "/home/unsafe-production-candidate",
          branch: "release/unsafe-target",
          historyPath: fixture.historyPath,
          dryRun: true,
        },
        {
          projectRoot: fixture.root,
          git: new CliGitClient(),
          refreshRemoteRefs: async () => {},
        },
      ),
    ).rejects.toThrow("promotion worktree must be inside /tmp");
  });

  it("rejects a staging ref with no changes after the recorded baseline", async () => {
    const fixture = await repositoryFixture();
    await git(
      fixture.root,
      "update-ref",
      "refs/remotes/origin/staging",
      fixture.lastStagingSha,
    );

    await expect(
      prepareStagingPromotion(
        {
          worktreePath: join(tmpdir(), `promotion-empty-${Date.now()}`),
          branch: "release/staging-empty",
          historyPath: fixture.historyPath,
          dryRun: true,
        },
        {
          projectRoot: fixture.root,
          git: new CliGitClient(),
          refreshRemoteRefs: async () => {},
        },
      ),
    ).rejects.toThrow("staging has no changes since the last promotion");
  });
});

describe("recordStagingPromotion", () => {
  it("validates and atomically appends the completed promotion", async () => {
    const fixture = await repositoryFixture();
    const contentRecord = "docs/content-modification-records/release.md";
    await writeFile(join(fixture.root, contentRecord), "release\n", "utf8");

    await recordStagingPromotion(
      {
        stagingSha: fixture.stagingSha,
        mainSha: fixture.mainSha,
        promotedAt: "2026-09-06T12:34:56+09:00",
        pullRequest: 2520,
        contentRecord,
        historyPath: fixture.historyPath,
        dryRun: false,
      },
      {
        projectRoot: fixture.root,
        git: new CliGitClient(),
        refreshRemoteRefs: async () => {},
      },
    );

    const history = JSON.parse(
      await readFile(join(fixture.root, fixture.historyPath), "utf8"),
    ) as PromotionHistory;
    expect(history.promotions).toHaveLength(2);
    expect(history.promotions[1]).toMatchObject({
      stagingSha: fixture.stagingSha,
      mainSha: fixture.mainSha,
      pullRequest: 2520,
      contentRecord,
    });
  });

  it("does not persist dry-runs and rejects duplicate staging SHAs", async () => {
    const fixture = await repositoryFixture();
    const contentRecord = "docs/content-modification-records/release.md";
    await writeFile(join(fixture.root, contentRecord), "release\n", "utf8");
    const before = await readFile(join(fixture.root, fixture.historyPath), "utf8");

    await recordStagingPromotion(
      {
        stagingSha: fixture.stagingSha,
        mainSha: fixture.mainSha,
        promotedAt: "2026-09-06T12:34:56+09:00",
        pullRequest: 2520,
        contentRecord,
        historyPath: fixture.historyPath,
        dryRun: true,
      },
      {
        projectRoot: fixture.root,
        git: new CliGitClient(),
        refreshRemoteRefs: async () => {},
      },
    );
    expect(await readFile(join(fixture.root, fixture.historyPath), "utf8")).toBe(
      before,
    );

    const history = JSON.parse(before) as PromotionHistory;
    await expect(
      recordStagingPromotion(
        {
          stagingSha: history.promotions[0].stagingSha,
          mainSha: fixture.mainSha,
          promotedAt: "2026-09-06T12:34:56+09:00",
          pullRequest: 2520,
          contentRecord,
          historyPath: fixture.historyPath,
          dryRun: false,
        },
        {
          projectRoot: fixture.root,
          git: new CliGitClient(),
          refreshRemoteRefs: async () => {},
        },
      ),
    ).rejects.toThrow("staging SHA is already recorded");
  });

  it("rejects records older than the current baseline", async () => {
    const fixture = await repositoryFixture();
    const contentRecord = "docs/content-modification-records/release.md";
    await writeFile(join(fixture.root, contentRecord), "release\n", "utf8");

    await expect(
      recordStagingPromotion(
        {
          stagingSha: fixture.stagingSha,
          mainSha: fixture.mainSha,
          promotedAt: "2026-09-04T12:34:56+09:00",
          pullRequest: 2520,
          contentRecord,
          historyPath: fixture.historyPath,
          dryRun: false,
        },
        {
          projectRoot: fixture.root,
          git: new CliGitClient(),
          refreshRemoteRefs: async () => {},
        },
      ),
    ).rejects.toThrow("promotion time must be later than the previous record");
  });
});
