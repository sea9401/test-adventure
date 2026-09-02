import {
  access,
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { CommandRequest, CommandResult, CommandRunnerLike } from "../core/commandRunner";
import { recordApproval } from "../core/approvals";
import { sha256Text } from "../core/hashes";
import { TaskStateStore } from "../core/taskState";
import type { ImageSpec } from "../adapters/unexplored-boss/schema";
import { createFixtureWorkspace } from "../testing/fixtureWorkspace";
import { recordImageReview, runImageWorkflow } from "./imageWorkflow";

const cleanups: Array<() => Promise<void>> = [];
let opaquePng: Buffer;
let alphaPng: Buffer;

beforeAll(async () => {
  opaquePng = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  })
    .png()
    .toBuffer();
  alphaPng = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 10, g: 20, b: 30, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
});

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function specs(): readonly ImageSpec[] {
  return [
    {
      role: "boss",
      target: "public/images/monster/v2/unexplored-boss-echo-warden.webp",
      requiresAlpha: false,
      rightsSource: "operator-cleared-game-art",
    },
    {
      role: "drop-30",
      target: "public/images/equipment/unexplored-echo-blade.webp",
      requiresAlpha: true,
      rightsSource: "operator-cleared-game-art",
    },
    {
      role: "drop-10",
      target: "public/images/equipment/unexplored-echo-gloves.webp",
      requiresAlpha: true,
      rightsSource: "operator-cleared-game-art",
    },
    {
      role: "drop-rare",
      target: "public/images/equipment/unexplored-echo-core.webp",
      requiresAlpha: true,
      rightsSource: "operator-cleared-game-art",
    },
  ];
}

class ImageRunner implements CommandRunnerLike {
  readonly runIds: string[] = [];

  constructor(
    private readonly root: string,
    private readonly images: readonly ImageSpec[],
    private readonly optimizeExitCode = 0,
    private readonly writeOptimizedFiles = true,
  ) {}

  async run(request: CommandRequest): Promise<CommandResult> {
    this.runIds.push(request.checkId);
    const exitCode =
      request.checkId === "images:optimize" ? this.optimizeExitCode : 0;
    if (
      request.checkId === "images:optimize" &&
      exitCode === 0 &&
      this.writeOptimizedFiles
    ) {
      for (const image of this.images) {
        const temporary = join(
          this.root,
          image.target.replace(/\.webp$/, ".png"),
        );
        try {
          const bytes = await readFile(temporary);
          const target = join(this.root, image.target);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, await sharp(bytes).webp().toBuffer());
          await unlink(temporary);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    }
    if (
      request.checkId === "images:optimize" &&
      exitCode === 0 &&
      !this.writeOptimizedFiles
    ) {
      for (const image of this.images) {
        await unlink(
          join(this.root, image.target.replace(/\.webp$/, ".png")),
        ).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    }
    return {
      exitCode,
      signal: null,
      outputHash: sha256Text(`${request.checkId}:${exitCode}`),
      tailLines: exitCode === 0 ? [] : ["optimizer failed"],
      logPath: request.logPath,
    };
  }
}

async function setup() {
  const fixture = await createFixtureWorkspace();
  cleanups.push(fixture.cleanup);
  const sourceDir = join(fixture.root, "inputs");
  await mkdir(sourceDir);
  await Promise.all([
    writeFile(join(sourceDir, "boss.png"), opaquePng),
    writeFile(join(sourceDir, "drop-30.png"), alphaPng),
    writeFile(join(sourceDir, "drop-10.png"), alphaPng),
    writeFile(join(sourceDir, "drop-rare.png"), alphaPng),
    writeFile(join(fixture.root, "scripts/optimize-images.mjs"), "// fixture\n"),
  ]);
  const store = new TaskStateStore(fixture.root);
  const state = await store.create({
    taskId: "boss-echo-warden",
    adapterId: "unexplored-boss",
    adapterSpecVersion: 1,
    specPath: "boss.yaml",
    baseSha: "a".repeat(40),
    now: "2026-09-02T00:00:00.000Z",
  });
  let tick = 0;
  const now = () => `2026-09-02T00:00:0${tick++}.000Z`;
  return { fixture, sourceDir, store, state, now };
}

describe("runImageWorkflow", () => {
  it("imports, optimizes, checks references, and reuses unchanged success", async () => {
    const { fixture, sourceDir, store, state, now } = await setup();
    const runner = new ImageRunner(fixture.root, specs());

    const first = await runImageWorkflow(state, sourceDir, {
      projectRoot: fixture.root,
      store,
      runner,
      specs: specs(),
      now,
    });

    expect(first.steps["images:optimize"].status).toBe("passed");
    expect(first.steps["images:references"].status).toBe("passed");
    expect(first.steps["images:review"]).toMatchObject({
      status: "pending",
      errorSummary: "image-review-required",
    });
    expect(runner.runIds).toEqual(["images:optimize", "images:references"]);
    expect(first.artifacts.map((artifact) => artifact.path).sort()).toEqual(
      specs().map((image) => image.target).sort(),
    );

    const second = await runImageWorkflow(first, sourceDir, {
      projectRoot: fixture.root,
      store,
      runner,
      specs: specs(),
      now,
    });
    expect(second.steps["images:optimize"].attempts).toBe(1);
    expect(runner.runIds).toEqual(["images:optimize", "images:references"]);
  });

  it("preserves imported sources after optimizer failure and resumes there", async () => {
    const { fixture, sourceDir, store, state, now } = await setup();
    const failed = await runImageWorkflow(state, sourceDir, {
      projectRoot: fixture.root,
      store,
      runner: new ImageRunner(fixture.root, specs(), 2),
      specs: specs(),
      now,
    });

    expect(failed.steps["images:optimize"].status).toBe("failed");
    await expect(
      access(join(fixture.root, "public/images/equipment/unexplored-echo-blade.png")),
    ).resolves.toBeUndefined();

    const resumedRunner = new ImageRunner(fixture.root, specs());
    const resumed = await runImageWorkflow(failed, sourceDir, {
      projectRoot: fixture.root,
      store,
      runner: resumedRunner,
      specs: specs(),
      now,
    });
    expect(resumed.steps["images:optimize"]).toMatchObject({
      status: "passed",
      attempts: 2,
    });
    expect(resumedRunner.runIds).toEqual([
      "images:optimize",
      "images:references",
    ]);
  });

  it("marks a successful optimizer command as failed when final files are missing", async () => {
    const { fixture, sourceDir, store, state, now } = await setup();
    const result = await runImageWorkflow(state, sourceDir, {
      projectRoot: fixture.root,
      store,
      runner: new ImageRunner(fixture.root, specs(), 0, false),
      specs: specs(),
      now,
    });

    expect(result.steps["images:optimize"]).toMatchObject({
      status: "failed",
      errorSummary: expect.stringContaining("optimized image is missing"),
    });
  });

  it("records hash-bound reviews and invalidates one after its source changes", async () => {
    const { fixture, sourceDir, store, state, now } = await setup();
    let current = await runImageWorkflow(state, sourceDir, {
      projectRoot: fixture.root,
      store,
      runner: new ImageRunner(fixture.root, specs()),
      specs: specs(),
      now,
    });
    for (const image of specs()) {
      current = await recordImageReview(current, {
        projectRoot: fixture.root,
        store,
        specs: specs(),
        role: image.role,
        decision: "accept",
        reason: "시각 검수 완료",
        now,
      });
    }
    expect(current.steps["images:review"].status).toBe("passed");

    const rejected = await recordImageReview(current, {
      projectRoot: fixture.root,
      store,
      specs: specs(),
      role: "drop-rare",
      decision: "reject",
      reason: "실루엣 재작업 필요",
      now,
    });
    expect(rejected.steps["images:review"]).toMatchObject({
      status: "failed",
      errorSummary: "image-review-rejected",
    });
    current = await recordImageReview(rejected, {
      projectRoot: fixture.root,
      store,
      specs: specs(),
      role: "drop-rare",
      decision: "accept",
      reason: "수정본 검수 완료",
      now,
    });

    const changedBoss = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 200, g: 20, b: 30 },
      },
    })
      .png()
      .toBuffer();
    await writeFile(join(sourceDir, "boss.png"), changedBoss);
    current = await runImageWorkflow(current, sourceDir, {
      projectRoot: fixture.root,
      store,
      runner: new ImageRunner(fixture.root, specs()),
      specs: specs(),
      now,
    });

    expect(current.imageReviews?.boss).toBeUndefined();
    expect(Object.keys(current.imageReviews ?? {})).toHaveLength(3);
    expect(current.steps["images:review"].status).toBe("pending");
  });

  it("registers rights evidence after reviews and same-task approval are complete", async () => {
    const { fixture, sourceDir, store, state, now } = await setup();
    await mkdir(join(fixture.root, "docs"));
    await writeFile(
      join(fixture.root, "docs/asset-rights.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          reviewedAt: "2026-09-01",
          instructions: "fixture",
          sources: [
            {
              id: "operator-cleared-game-art",
              releaseStatus: "cleared",
              rightsBasis: "fixture",
              evidence: [],
            },
          ],
          assets: [],
        },
        null,
        2,
      )}\n`,
    );
    let current = await runImageWorkflow(state, sourceDir, {
      projectRoot: fixture.root,
      store,
      runner: new ImageRunner(fixture.root, specs()),
      specs: specs(),
      now,
    });
    for (const image of specs()) {
      current = await recordImageReview(current, {
        projectRoot: fixture.root,
        store,
        specs: specs(),
        role: image.role,
        decision: "accept",
        reason: "시각 검수 완료",
        now,
      });
    }
    current = recordApproval(
      current,
      {
        action: "asset-rights",
        target: current.taskId,
        reason: "운영자 소유 이미지 생성 세션에서 제작했고 배포 권리를 확인함",
        approvedAt: "2026-09-02T00:01:00.000Z",
      },
      new Date("2026-09-02T00:02:00.000Z"),
    );
    await store.save(current);
    const rightsRunner = new ImageRunner(fixture.root, specs());

    current = await runImageWorkflow(current, sourceDir, {
      projectRoot: fixture.root,
      store,
      runner: rightsRunner,
      specs: specs(),
      now,
    });

    expect(rightsRunner.runIds).toEqual(["images:rights"]);
    expect(current.steps["images:rights"].status).toBe("passed");
    await expect(
      readFile(
        join(
          fixture.root,
          "docs/asset-provenance-echo-warden-2026-09-02.md",
        ),
        "utf8",
      ),
    ).resolves.toContain("operator-cleared-game-art");
  });
});
