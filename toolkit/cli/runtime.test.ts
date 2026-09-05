import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";

import type { ToolkitAdapter } from "../core/adapter";
import { AdapterRegistry } from "../core/adapterRegistry";
import { TaskStateStore } from "../core/taskState";
import { loadYamlSpec } from "../core/specFile";
import { createFixtureWorkspace } from "../testing/fixtureWorkspace";
import { FakeCommandRunner } from "../testing/fakeCommandRunner";
import { ToolkitUsageError } from "./command";
import { executeToolkitCommand } from "./runtime";

type ExampleSpec = { taskId: string; value: string };

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function exampleAdapter(): ToolkitAdapter<ExampleSpec> {
  return {
    id: "example",
    specVersion: 1,
    parseSpec(input): ExampleSpec {
      if (
        input === null ||
        typeof input !== "object" ||
        !("taskId" in input) ||
        !("value" in input) ||
        typeof input.taskId !== "string" ||
        typeof input.value !== "string"
      ) {
        throw new Error("invalid example spec");
      }
      return { taskId: input.taskId, value: input.value };
    },
    plan: async (_context, spec) => [
      {
        scope: "project",
        path: "src/generated.ts",
        operation: "create",
        content: `export const generated = ${JSON.stringify(spec.value)};\n`,
      },
    ],
    validateGenerated: async () => [],
    listImageSpecs: () => [
      {
        role: "boss",
        target: "public/images/monster/v2/example-boss.webp",
        requiresAlpha: false,
        rightsSource: "operator-cleared-game-art",
      },
      {
        role: "drop-30",
        target: "public/images/equipment/example-30.webp",
        requiresAlpha: true,
        rightsSource: "operator-cleared-game-art",
      },
      {
        role: "drop-10",
        target: "public/images/equipment/example-10.webp",
        requiresAlpha: true,
        rightsSource: "operator-cleared-game-art",
      },
      {
        role: "drop-rare",
        target: "public/images/equipment/example-rare.webp",
        requiresAlpha: true,
        rightsSource: "operator-cleared-game-art",
      },
    ],
    selectFastChecks: () => [
      {
        id: "fast-check",
        command: "fake-check",
        args: [],
        dependsOn: [],
      },
    ],
    selectFullChecks: () => [
      {
        id: "full-check",
        command: "fake-check",
        args: [],
        dependsOn: [],
      },
    ],
  };
}

async function setup() {
  const fixture = await createFixtureWorkspace();
  cleanups.push(fixture.cleanup);
  await mkdir(join(fixture.root, "specs"), { recursive: true });
  await writeFile(
    join(fixture.root, "specs/example.yaml"),
    "taskId: boss-red\nvalue: first\n",
  );
  return {
    fixture,
    store: new TaskStateStore(fixture.root),
    registry: new AdapterRegistry().register(exampleAdapter()),
  };
}

describe("loadYamlSpec", () => {
  it("loads a plain unique-key YAML document", async () => {
    const { fixture } = await setup();
    await expect(
      loadYamlSpec(join(fixture.root, "specs/example.yaml")),
    ).resolves.toEqual({ taskId: "boss-red", value: "first" });
  });

  it.each([
    ["duplicate keys", "taskId: one\ntaskId: two\n", "Map keys must be unique"],
    ["aliases", "base: &base { value: one }\ncopy: *base\n", "YAML aliases are not allowed"],
    ["merge keys", "base: &base { value: one }\ncopy:\n  <<: *base\n", "YAML merge keys are not allowed"],
    ["custom tags", "value: !custom one\n", "YAML custom tags are not allowed"],
  ])("rejects %s", async (_name, source, message) => {
    const { fixture } = await setup();
    const path = join(fixture.root, "specs/unsafe.yaml");
    await writeFile(path, source);
    await expect(loadYamlSpec(path)).rejects.toThrow(message);
  });
});

describe("executeToolkitCommand", () => {
  it("previews content creation without writing project or task files", async () => {
    const { fixture, registry, store } = await setup();

    const code = await executeToolkitCommand(
      {
        kind: "content-create",
        adapterId: "example",
        specPath: "specs/example.yaml",
        dryRun: true,
      },
      {
        projectRoot: fixture.root,
        registry,
        store,
        runner: new FakeCommandRunner(),
        resolveBaseSha: async () => "a".repeat(40),
      },
    );

    expect(code).toBe(0);
    await expect(lstat(join(fixture.root, "src/generated.ts"))).rejects.toMatchObject(
      { code: "ENOENT" },
    );
    await expect(lstat(join(fixture.root, ".toolkit"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("creates content idempotently and persists its ownership", async () => {
    const { fixture, registry, store } = await setup();
    const dependencies = {
      projectRoot: fixture.root,
      registry,
      store,
      runner: new FakeCommandRunner(),
      resolveBaseSha: async () => "a".repeat(40),
    };
    const command = {
      kind: "content-create" as const,
      adapterId: "example",
      specPath: "specs/example.yaml",
      dryRun: false,
    };

    expect(await executeToolkitCommand(command, dependencies)).toBe(0);
    expect(await executeToolkitCommand(command, dependencies)).toBe(0);

    await expect(readFile(join(fixture.root, "src/generated.ts"), "utf8")).resolves.toBe(
      'export const generated = "first";\n',
    );
    const state = await store.load("boss-red");
    expect(state.artifacts).toHaveLength(1);
    expect(state.artifacts[0].path).toBe("src/generated.ts");
  });

  it("previews image mappings and commands without changing task state", async () => {
    const { fixture, registry, store } = await setup();
    await store.create({
      taskId: "boss-red",
      adapterId: "example",
      adapterSpecVersion: 1,
      specPath: "specs/example.yaml",
      baseSha: "a".repeat(40),
      now: "2026-09-02T00:00:00.000Z",
    });
    const sourceDir = join(fixture.root, "image-inputs");
    await mkdir(sourceDir);
    const opaque = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 1, g: 2, b: 3 },
      },
    })
      .png()
      .toBuffer();
    const alpha = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 1, g: 2, b: 3, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    await Promise.all([
      writeFile(join(sourceDir, "boss.png"), opaque),
      writeFile(join(sourceDir, "drop-30.png"), alpha),
      writeFile(join(sourceDir, "drop-10.png"), alpha),
      writeFile(join(sourceDir, "drop-rare.png"), alpha),
    ]);
    const statePath = join(
      fixture.root,
      ".toolkit/work/boss-red/state.json",
    );
    const before = await readFile(statePath, "utf8");
    const reports: string[] = [];

    expect(
      await executeToolkitCommand(
        {
          kind: "images-import",
          taskId: "boss-red",
          sourceDir,
          dryRun: true,
        },
        {
          projectRoot: fixture.root,
          registry,
          store,
          runner: new FakeCommandRunner(),
          resolveBaseSha: async () => "a".repeat(40),
          report: (message) => reports.push(message),
        },
      ),
    ).toBe(0);

    expect(reports).toEqual(
      expect.arrayContaining([
        "boss.png -> public/images/monster/v2/example-boss.png",
        "command:npm run optimize-images",
        "command:npm run check-images",
      ]),
    );
    await expect(readFile(statePath, "utf8")).resolves.toBe(before);
    await expect(lstat(join(fixture.root, "public"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("prints all authoritative checks for a write-free full verification dry run", async () => {
    const { fixture, store } = await setup();
    await writeFile(
      join(fixture.root, "specs/release.yaml"),
      "taskId: boss-release\nid: echo_warden\n",
    );
    const releaseAdapter: ToolkitAdapter<{ taskId: string; id: string }> = {
      id: "release-fixture",
      specVersion: 1,
      parseSpec(input) {
        return input as { taskId: string; id: string };
      },
      plan: async () => [],
      validateGenerated: async () => [],
      selectFastChecks: () => [
        {
          id: "boss-simulation",
          command: "npm",
          args: ["run", "sim:coop-boss"],
          dependsOn: [],
        },
      ],
      selectFullChecks: () => [],
    };
    const registry = new AdapterRegistry().register(releaseAdapter);
    await store.create({
      taskId: "boss-release",
      adapterId: "release-fixture",
      adapterSpecVersion: 1,
      specPath: "specs/release.yaml",
      baseSha: "a".repeat(40),
      now: "2026-09-02T00:00:00.000Z",
    });
    const statePath = join(
      fixture.root,
      ".toolkit/work/boss-release/state.json",
    );
    const before = await readFile(statePath, "utf8");
    const reports: string[] = [];

    expect(
      await executeToolkitCommand(
        {
          kind: "verify",
          level: "full",
          taskId: "boss-release",
          dryRun: true,
        },
        {
          projectRoot: fixture.root,
          registry,
          store,
          runner: new FakeCommandRunner(),
          resolveBaseSha: async () => "a".repeat(40),
          inspectRepository: async () => ({
            headSha: "a".repeat(40),
            dirtyPaths: [],
            dirtyFileHashes: {},
            unrelatedDirtyPaths: [],
            plannedArtifactHashes: {},
            repositoryHash: "repository",
            specHash: "spec",
            checkGraphHash: "graph",
          }),
          report: (message) => reports.push(message),
        },
      ),
    ).toBe(0);

    expect(reports.filter((line) => line.startsWith("check:"))).toHaveLength(8);
    expect(reports).toEqual(
      expect.arrayContaining(["check:images", "check:build", "check:diff"]),
    );
    await expect(readFile(statePath, "utf8")).resolves.toBe(before);
  });

  it("runs selected verification and records scoped manual paths and approval", async () => {
    const { fixture, registry, store } = await setup();
    const baseDependencies = {
      projectRoot: fixture.root,
      registry,
      store,
      resolveBaseSha: async () => "a".repeat(40),
      inspectRepository: async () => ({
        headSha: "a".repeat(40),
        dirtyPaths: [],
        dirtyFileHashes: {},
        unrelatedDirtyPaths: [],
        plannedArtifactHashes: {},
        repositoryHash: "repository",
        specHash: "spec",
        checkGraphHash: "graph",
      }),
    };
    await executeToolkitCommand(
      {
        kind: "content-create",
        adapterId: "example",
        specPath: "specs/example.yaml",
        dryRun: false,
      },
      { ...baseDependencies, runner: new FakeCommandRunner() },
    );
    const runner = new FakeCommandRunner().succeed("fast-check");

    expect(
      await executeToolkitCommand(
        { kind: "verify", level: "fast", taskId: "boss-red", dryRun: false },
        { ...baseDependencies, runner },
      ),
    ).toBe(0);
    expect(
      await executeToolkitCommand(
        {
          kind: "task-scope-add",
          taskId: "boss-red",
          paths: ["src/generated.ts"],
          dryRun: false,
        },
        { ...baseDependencies, runner },
      ),
    ).toBe(0);
    expect(
      await executeToolkitCommand(
        {
          kind: "task-approve",
          taskId: "boss-red",
          action: "pr",
          target: "staging",
          reason: "스테이징 PR 요청",
          dryRun: false,
        },
        {
          ...baseDependencies,
          runner,
          now: () => new Date("2026-09-02T00:00:00.000Z"),
        },
      ),
    ).toBe(0);

    const state = await store.load("boss-red");
    expect(state.steps["fast-check"].status).toBe("passed");
    expect(state.manualPaths).toEqual(["src/generated.ts"]);
    expect(state.approvals).toMatchObject([
      { action: "pr", target: "staging", reason: "스테이징 PR 요청" },
    ]);
  });

  it("keeps release commands unavailable until a release pipeline is registered", async () => {
    const { fixture, registry, store } = await setup();
    await expect(
      executeToolkitCommand(
        { kind: "release-pr", taskId: "boss-red", dryRun: false },
        {
          projectRoot: fixture.root,
          registry,
          store,
          runner: new FakeCommandRunner(),
          resolveBaseSha: async () => "a".repeat(40),
        },
      ),
    ).rejects.toBeInstanceOf(ToolkitUsageError);
  });

  it("delegates registered staging release commands without widening their target", async () => {
    const { fixture, registry, store } = await setup();
    const calls: Array<[string, string, boolean]> = [];
    const productionCalls: string[] = [];
    const dependencies = {
      projectRoot: fixture.root,
      registry,
      store,
      runner: new FakeCommandRunner(),
      resolveBaseSha: async () => "a".repeat(40),
      releaseHandlers: {
        pr: async (taskId: string, dryRun: boolean) => {
          calls.push(["pr", taskId, dryRun]);
          return 0;
        },
        deployTest: async (taskId: string, dryRun: boolean) => {
          calls.push(["deploy-test", taskId, dryRun]);
          return 0;
        },
        promoteStaging: async (command: { branch: string }) => {
          productionCalls.push(`promote:${command.branch}`);
          return 0;
        },
        recordPromotion: async (command: { mainSha: string }) => {
          productionCalls.push(`record:${command.mainSha}`);
          return 0;
        },
      },
    };

    await executeToolkitCommand(
      { kind: "release-pr", taskId: "boss-red", dryRun: true },
      dependencies,
    );
    await executeToolkitCommand(
      { kind: "release-deploy-test", taskId: "boss-red", dryRun: false },
      dependencies,
    );
    await executeToolkitCommand(
      {
        kind: "release-promote-staging",
        worktreePath: "/tmp/release-candidate",
        branch: "release/candidate",
        historyPath: "docs/release-promotions/staging-production.json",
        dryRun: true,
      },
      dependencies,
    );
    await executeToolkitCommand(
      {
        kind: "release-record-promotion",
        stagingSha: "a".repeat(40),
        mainSha: "b".repeat(40),
        promotedAt: "2026-09-06T12:00:00+09:00",
        pullRequest: 2520,
        contentRecord: "docs/content-modification-records/release.md",
        historyPath: "docs/release-promotions/staging-production.json",
        dryRun: true,
      },
      dependencies,
    );

    expect(calls).toEqual([
      ["pr", "boss-red", true],
      ["deploy-test", "boss-red", false],
    ]);
    expect(productionCalls).toEqual([
      "promote:release/candidate",
      `record:${"b".repeat(40)}`,
    ]);
  });
});
