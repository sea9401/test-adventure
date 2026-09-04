import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFixtureWorkspace } from "../testing/fixtureWorkspace";
import {
  collectCurrentAssets,
  sourceFor,
  updateLedgerForTask,
} from "../../scripts/asset-rights-lib.mjs";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function ledger() {
  return {
    schemaVersion: 1,
    reviewedAt: "2026-09-01",
    instructions: "fixture",
    sources: [
      {
        id: "repository-authored-vector",
        releaseStatus: "cleared",
        rightsBasis: "fixture",
        evidence: [] as string[],
      },
      {
        id: "operator-cleared-game-art",
        releaseStatus: "cleared",
        rightsBasis: "fixture",
        evidence: [] as string[],
      },
      {
        id: "operator-cleared-brand-art",
        releaseStatus: "cleared",
        rightsBasis: "fixture",
        evidence: [] as string[],
      },
    ],
    assets: [] as Array<{ path: string; sha256: string; source: string }>,
  };
}

describe("asset rights authority", () => {
  it("scans supported assets, assigns sources, hashes, and sorts deterministically", async () => {
    const fixture = await createFixtureWorkspace();
    cleanups.push(fixture.cleanup);
    await mkdir(join(fixture.root, "public/images/ui"), { recursive: true });
    await writeFile(join(fixture.root, "public/images/ui/vector.svg"), "<svg/>\n");
    await writeFile(join(fixture.root, "public/images/ui/raster.webp"), "raster\n");

    const assets = await collectCurrentAssets(fixture.root, ledger());

    expect(assets.map((asset: { path: string }) => asset.path)).toEqual([
      "public/images/ui/raster.webp",
      "public/images/ui/vector.svg",
    ]);
    expect(assets).toMatchObject([
      { source: "operator-cleared-game-art" },
      { source: "repository-authored-vector" },
    ]);
    expect(assets.every((asset: { sha256: string }) => asset.sha256.length === 64)).toBe(
      true,
    );
  });

  it("keeps the existing source-selection rules", () => {
    expect(sourceFor("android/store-assets/feature-graphic.png")).toBe(
      "operator-cleared-brand-art",
    );
    expect(sourceFor("public/images/equipment/item.webp")).toBe(
      "operator-cleared-game-art",
    );
    expect(sourceFor("public/images/ui/icon.svg")).toBe(
      "repository-authored-vector",
    );
    expect(() => sourceFor("outside/image.webp")).toThrow(
      "No rights source rule",
    );
  });

  it("updates only declared task assets and sorted evidence", () => {
    const existing = ledger();
    existing.assets.push({
      path: "public/images/existing.webp",
      sha256: "a".repeat(64),
      source: "operator-cleared-game-art",
    });

    const updated = updateLedgerForTask(existing, {
      sourceId: "operator-cleared-game-art",
      reviewedAt: "2026-09-02",
      evidencePath: "docs/asset-provenance-echo-warden-2026-09-02.md",
      assets: [
        {
          path: "public/images/equipment/new.webp",
          sha256: "b".repeat(64),
          source: "operator-cleared-game-art",
        },
      ],
    });

    expect(updated.reviewedAt).toBe("2026-09-02");
    expect(updated.assets).toHaveLength(2);
    expect(
      updated.sources.find(
        (source: { id: string }) => source.id === "operator-cleared-game-art",
      )?.evidence,
    ).toContain("docs/asset-provenance-echo-warden-2026-09-02.md");
    expect(existing.assets).toHaveLength(1);
  });
});
