import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { CheckDefinition } from "../core/artifacts";
import { TaskStateStore } from "../core/taskState";
import { createFixtureWorkspace } from "../testing/fixtureWorkspace";
import {
  recordFullVerification,
  repositoryState,
  requireCurrentFullVerification,
  verificationGraphHash,
} from "./verification";

const execFileAsync = promisify(execFile);
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function setupRepository() {
  const fixture = await createFixtureWorkspace();
  cleanups.push(fixture.cleanup);
  await mkdir(join(fixture.root, "specs"));
  await Promise.all([
    writeFile(join(fixture.root, "specs/boss.yaml"), "taskId: boss-red\n"),
    writeFile(join(fixture.root, "src/planned.ts"), "export const value = 1;\n"),
  ]);
  await execFileAsync("git", ["init"], { cwd: fixture.root });
  await execFileAsync("git", ["add", "."], { cwd: fixture.root });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.name=Toolkit Test",
      "-c",
      "user.email=toolkit@example.invalid",
      "commit",
      "-m",
      "fixture",
    ],
    { cwd: fixture.root },
  );
  const store = new TaskStateStore(fixture.root);
  const created = await store.create({
    taskId: "boss-red",
    adapterId: "fixture",
    adapterSpecVersion: 1,
    specPath: "specs/boss.yaml",
    baseSha: "a".repeat(40),
    now: "2026-09-02T00:00:00.000Z",
  });
  const state = { ...created, manualPaths: ["src/planned.ts"] };
  return { fixture, state };
}

const checks: readonly CheckDefinition[] = [
  {
    id: "typecheck",
    command: "npx",
    args: ["tsc", "--noEmit"],
    dependsOn: [],
  },
];

describe("full verification release token", () => {
  it("becomes stale after an unrelated or planned input changes", async () => {
    const { fixture, state } = await setupRepository();
    const snapshot = await repositoryState(fixture.root, state, {
      specHash: "spec-v1",
      checkGraphHash: verificationGraphHash(checks),
    });
    const verified = recordFullVerification(
      {
        ...state,
        steps: {
          typecheck: {
            status: "passed",
            inputHash: "input",
            outputHash: "output",
            dependsOn: [],
            attempts: 1,
          },
        },
      },
      snapshot,
      checks,
      "2026-09-02T01:00:00.000Z",
    );
    expect(requireCurrentFullVerification(verified, snapshot)).toBeDefined();

    await writeFile(join(fixture.root, "src/unrelated.ts"), "export {};\n");
    const unrelated = await repositoryState(fixture.root, verified, {
      specHash: "spec-v1",
      checkGraphHash: verificationGraphHash(checks),
    });
    expect(() => requireCurrentFullVerification(verified, unrelated)).toThrow(
      "full verification is stale",
    );

    await import("node:fs/promises").then(({ unlink }) =>
      unlink(join(fixture.root, "src/unrelated.ts")),
    );
    await writeFile(join(fixture.root, "src/planned.ts"), "export const value = 2;\n");
    const planned = await repositoryState(fixture.root, verified, {
      specHash: "spec-v1",
      checkGraphHash: verificationGraphHash(checks),
    });
    expect(() => requireCurrentFullVerification(verified, planned)).toThrow(
      "full verification is stale",
    );
  });

  it("rejects changed specs, graphs, heads, and incomplete check results", async () => {
    const { fixture, state } = await setupRepository();
    const snapshot = await repositoryState(fixture.root, state, {
      specHash: "spec-v1",
      checkGraphHash: verificationGraphHash(checks),
    });
    const passed = {
      ...state,
      steps: {
        typecheck: {
          status: "passed" as const,
          inputHash: "input",
          outputHash: "output",
          dependsOn: [],
          attempts: 1,
        },
      },
    };
    const verified = recordFullVerification(
      passed,
      snapshot,
      checks,
      "2026-09-02T01:00:00.000Z",
    );

    expect(() =>
      requireCurrentFullVerification(verified, {
        ...snapshot,
        specHash: "spec-v2",
      }),
    ).toThrow("full verification is stale");
    expect(() =>
      requireCurrentFullVerification(verified, {
        ...snapshot,
        checkGraphHash: "graph-v2",
      }),
    ).toThrow("full verification is stale");
    expect(() =>
      requireCurrentFullVerification(verified, {
        ...snapshot,
        headSha: "b".repeat(40),
      }),
    ).toThrow("full verification is stale");
    expect(() => recordFullVerification(state, snapshot, checks, "now")).toThrow(
      "full verification graph is incomplete",
    );
  });
});
