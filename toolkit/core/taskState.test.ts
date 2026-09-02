import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { sha256Text, stableJson } from "./hashes";
import {
  TaskStateStore,
  invalidateChangedInputs,
  recordManualPaths,
} from "./taskState";
import type { StepState, ToolkitTaskState } from "../schemas/task";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "project-toolkit-state-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    force: true,
    recursive: true,
  })));
});

function passedStep(inputHash: string, dependsOn: readonly string[]): StepState {
  return {
    status: "passed",
    inputHash,
    outputHash: `output-${inputHash}`,
    dependsOn,
    attempts: 1,
    startedAt: "2026-09-02T00:00:00.000Z",
    finishedAt: "2026-09-02T00:01:00.000Z",
    logPath: "logs/check.log",
  };
}

function fixtureState(
  overrides: Partial<ToolkitTaskState> = {},
): ToolkitTaskState {
  return {
    schemaVersion: 1,
    taskId: "boss-red",
    adapterId: "unexplored-boss",
    adapterSpecVersion: 1,
    specPath: "specs/boss-red.yaml",
    baseSha: "a".repeat(40),
    phase: "scaffold",
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    steps: {},
    artifacts: [],
    approvals: [],
    manualPaths: [],
    ...overrides,
  };
}

describe("stable hashing", () => {
  it("sorts object keys recursively while preserving array order", () => {
    const left = { z: [{ b: 2, a: 1 }, "last"], a: true };
    const right = { a: true, z: [{ a: 1, b: 2 }, "last"] };

    expect(stableJson(left)).toBe(
      '{"a":true,"z":[{"a":1,"b":2},"last"]}',
    );
    expect(sha256Text(stableJson(left))).toBe(sha256Text(stableJson(right)));
  });

  it.each([undefined, Number.POSITIVE_INFINITY, () => undefined, Symbol("x")])(
    "rejects non-JSON input %#",
    (value) => {
      expect(() => stableJson(value)).toThrow("not JSON-serializable");
    },
  );

  it("rejects cyclic input", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => stableJson(cyclic)).toThrow("cyclic value");
  });
});

describe("invalidateChangedInputs", () => {
  it("invalidates the changed step and every dependent step", () => {
    const state = fixtureState({
      steps: {
        scaffold: passedStep("old-spec", []),
        images: passedStep("same-images", ["scaffold"]),
        verify: passedStep("same-checks", ["scaffold", "images"]),
        unrelated: passedStep("same-unrelated", []),
      },
    });

    const next = invalidateChangedInputs(state, { scaffold: "new-spec" });

    expect(next.steps.scaffold).toMatchObject({
      status: "pending",
      inputHash: "new-spec",
      attempts: 1,
    });
    expect(next.steps.scaffold.outputHash).toBeUndefined();
    expect(next.steps.images.status).toBe("pending");
    expect(next.steps.verify.status).toBe("pending");
    expect(next.steps.unrelated.status).toBe("passed");
    expect(state.steps.scaffold.status).toBe("passed");
  });
});

describe("TaskStateStore", () => {
  it("creates and atomically reloads task state", async () => {
    const root = await temporaryRoot();
    const store = new TaskStateStore(root);
    const created = await store.create({
      taskId: "boss-red",
      adapterId: "unexplored-boss",
      adapterSpecVersion: 1,
      specPath: "specs/boss-red.yaml",
      baseSha: "a".repeat(40),
      now: "2026-09-02T00:00:00.000Z",
    });

    expect(await store.load("boss-red")).toEqual(created);
    expect(
      JSON.parse(
        await readFile(join(root, ".toolkit/work/boss-red/state.json"), "utf8"),
      ),
    ).toEqual(created);
  });

  it("turns an interrupted running step back into pending on load", async () => {
    const root = await temporaryRoot();
    const store = new TaskStateStore(root);
    await store.save(
      fixtureState({
        steps: {
          verify: {
            status: "running",
            inputHash: "checks",
            dependsOn: [],
            attempts: 1,
            startedAt: "2026-09-02T00:00:00.000Z",
          },
        },
      }),
    );

    const loaded = await store.load("boss-red");
    expect(loaded.steps.verify).toEqual({
      status: "pending",
      inputHash: "checks",
      dependsOn: [],
      attempts: 1,
    });
  });

  it("rejects path traversal in task ids", async () => {
    const store = new TaskStateStore(await temporaryRoot());
    await expect(store.load("../outside")).rejects.toThrow("invalid task id");
  });

  it.each([
    { body: "not-json", message: "invalid task state JSON" },
    {
      body: JSON.stringify({ ...fixtureState(), schemaVersion: 2 }),
      message: "unsupported task state schema",
    },
  ])("rejects invalid persisted state: $message", async ({ body, message }) => {
    const root = await temporaryRoot();
    const directory = join(root, ".toolkit/work/boss-red");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "state.json"), body);

    await expect(new TaskStateStore(root).load("boss-red")).rejects.toThrow(
      message,
    );
  });
});

describe("recordManualPaths", () => {
  it("records sorted unique project paths without granting ownership", async () => {
    const root = await temporaryRoot();
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "scripts"), { recursive: true });
    await writeFile(join(root, "src/a.ts"), "export {};\n");

    const next = await recordManualPaths(fixtureState(), root, [
      "scripts/new-check.ts",
      "src/a.ts",
      "src/a.ts",
    ]);

    expect(next.manualPaths).toEqual(["scripts/new-check.ts", "src/a.ts"]);
    expect(next.artifacts).toEqual([]);
  });

  it.each(["../outside.ts", "/tmp/outside.ts", ".git/config", ".toolkit/x"])(
    "rejects unsafe manual path %s",
    async (path) => {
      const root = await temporaryRoot();
      await expect(recordManualPaths(fixtureState(), root, [path])).rejects.toThrow(
        "manual path",
      );
    },
  );

  it("rejects a path whose parent does not exist", async () => {
    const root = await temporaryRoot();
    await expect(
      recordManualPaths(fixtureState(), root, ["src/missing/file.ts"]),
    ).rejects.toThrow("parent directory does not exist");
  });
});
