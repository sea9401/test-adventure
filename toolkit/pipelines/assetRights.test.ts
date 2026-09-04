import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AdapterContext } from "../core/adapter";
import { recordApproval } from "../core/approvals";
import { TaskStateStore } from "../core/taskState";
import type { ToolkitTaskState } from "../schemas/task";
import { createFixtureWorkspace } from "../testing/fixtureWorkspace";
import { FakeCommandRunner } from "../testing/fakeCommandRunner";
import {
  assetProvenancePath,
  planAssetRightsUpdate,
  runAssetRightsWorkflow,
  type ImageRightsHash,
} from "./assetRights";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const roles = ["boss", "drop-30", "drop-10", "drop-rare"] as const;

function hashes(): readonly ImageRightsHash[] {
  return roles.map((role, index) => ({
    role,
    path:
      role === "boss"
        ? "public/images/monster/v2/unexplored-boss-echo-warden.webp"
        : `public/images/equipment/unexplored-echo-${index}.webp`,
    sha256: String(index + 1).repeat(64),
    rightsSource: "operator-cleared-game-art",
  }));
}

function state(): ToolkitTaskState {
  const images = hashes();
  return {
    schemaVersion: 1,
    taskId: "boss-echo-warden",
    adapterId: "unexplored-boss",
    adapterSpecVersion: 1,
    specPath: "boss.yaml",
    baseSha: "a".repeat(40),
    phase: "images",
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    steps: {},
    artifacts: images.map((image) => ({
      scope: "project",
      path: image.path,
      operation: "create",
      outputHash: image.sha256,
      byteLength: 10,
    })),
    approvals: [],
    manualPaths: [],
    imageReviews: Object.fromEntries(
      images.map((image) => [
        image.role,
        {
          role: image.role,
          contentHash: image.sha256,
          decision: "accept",
          reason: "시각 검수 완료",
          reviewedAt: "2026-09-02T01:00:00.000Z",
        },
      ]),
    ),
  };
}

async function setup() {
  const fixture = await createFixtureWorkspace();
  cleanups.push(fixture.cleanup);
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
            evidence: ["docs/existing.md"],
          },
        ],
        assets: [
          {
            path: "public/images/existing.webp",
            sha256: "f".repeat(64),
            source: "operator-cleared-game-art",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  const context: AdapterContext = {
    projectRoot: fixture.root,
    taskId: "boss-echo-warden",
    taskRoot: join(fixture.root, ".toolkit/work/boss-echo-warden"),
    baseSha: "a".repeat(40),
  };
  return { fixture, context };
}

function approve(task: ToolkitTaskState): ToolkitTaskState {
  return recordApproval(
    task,
    {
      action: "asset-rights",
      target: task.taskId,
      reason: "운영자 소유 이미지 생성 세션에서 제작했고 배포 권리를 확인함",
      approvedAt: "2026-09-02T02:00:00.000Z",
    },
    new Date("2026-09-02T02:01:00.000Z"),
  );
}

describe("planAssetRightsUpdate", () => {
  it("refuses to clear assets without same-task rights approval", async () => {
    const { context } = await setup();

    await expect(planAssetRightsUpdate(context, state(), hashes())).rejects.toThrow(
      "asset-rights approval required",
    );
  });

  it("adds four sorted ledger entries and one deterministic evidence document", async () => {
    const { context } = await setup();
    const plans = await planAssetRightsUpdate(context, approve(state()), hashes());
    const provenance = plans.find((plan) => plan.path.endsWith(".md"));
    const ledger = plans.find((plan) => plan.path === "docs/asset-rights.json");

    expect(assetProvenancePath(state())).toBe(
      "docs/asset-provenance-echo-warden-2026-09-02.md",
    );
    expect(provenance?.content).toContain("boss-echo-warden");
    expect(provenance?.content).toContain(
      "운영자 소유 이미지 생성 세션에서 제작했고 배포 권리를 확인함",
    );
    const parsed = JSON.parse(String(ledger?.content));
    expect(
      parsed.assets.filter((asset: { path: string }) =>
        asset.path.includes("echo"),
      ),
    ).toHaveLength(4);
    expect(
      parsed.sources[0].evidence,
    ).toContain("docs/asset-provenance-echo-warden-2026-09-02.md");
    expect(parsed.assets[0].path).toBe("public/images/equipment/unexplored-echo-1.webp");
  });

  it("applies evidence, runs the strict checker, and reuses unchanged success", async () => {
    const { fixture, context } = await setup();
    const store = new TaskStateStore(fixture.root);
    const approved = approve(state());
    await store.save(approved);
    const runner = new FakeCommandRunner().succeed("images:rights");

    const first = await runAssetRightsWorkflow(context, approved, hashes(), {
      store,
      runner,
      now: () => "2026-09-02T03:00:00.000Z",
    });

    expect(first.steps["images:rights"].status).toBe("passed");
    expect(runner.runIds).toEqual(["images:rights"]);
    await expect(
      readFile(
        join(
          fixture.root,
          "docs/asset-provenance-echo-warden-2026-09-02.md",
        ),
        "utf8",
      ),
    ).resolves.toContain("boss-echo-warden");

    const second = await runAssetRightsWorkflow(context, first, hashes(), {
      store,
      runner,
      now: () => "2026-09-02T03:01:00.000Z",
    });
    expect(second.steps["images:rights"].attempts).toBe(1);
    expect(runner.runIds).toEqual(["images:rights"]);
  });

  it("rejects stale reviews, unknown sources, and conflicting existing hashes", async () => {
    const staleSetup = await setup();
    const stale = approve(state());
    stale.imageReviews!.boss!.contentHash = "0".repeat(64);
    await expect(
      planAssetRightsUpdate(staleSetup.context, stale, hashes()),
    ).rejects.toThrow("accepted image review does not match: boss");

    const sourceSetup = await setup();
    const unknown = hashes().map((image) => ({ ...image }));
    unknown[0].rightsSource = "unknown-source";
    await expect(
      planAssetRightsUpdate(sourceSetup.context, approve(state()), unknown),
    ).rejects.toThrow("unknown rights source: unknown-source");

    const conflictSetup = await setup();
    const ledgerPath = join(conflictSetup.fixture.root, "docs/asset-rights.json");
    const existing = JSON.parse(await readFile(ledgerPath, "utf8"));
    existing.assets.push({
      path: hashes()[0].path,
      sha256: "0".repeat(64),
      source: "operator-cleared-game-art",
    });
    await writeFile(ledgerPath, `${JSON.stringify(existing, null, 2)}\n`);
    await expect(
      planAssetRightsUpdate(conflictSetup.context, approve(state()), hashes()),
    ).rejects.toThrow("asset path already has a different hash");
  });
});
