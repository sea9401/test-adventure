import { mkdir, readFile, stat, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

import {
  createDefaultAdapterRegistry,
  executeToolkitCommand,
} from "../../cli/runtime";
import { AdapterRegistry } from "../../core/adapterRegistry";
import { CommandRunner } from "../../core/commandRunner";
import { TaskStateStore } from "../../core/taskState";
import { createFixtureWorkspace } from "../../testing/fixtureWorkspace";
import { unexploredBossAdapter } from "./adapter";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const fixtureFiles: Readonly<Record<string, string>> = {
  "src/adventure/data/v2/unexploredBosses.ts": [
    'export const UNEXPLORED_SUMMON_STONE_MATERIALS = {\n  existing_stone: { id: "existing_stone" },\n} as const;\n',
    'export const UNEXPLORED_BOSSES = {\n  existing_boss: { id: "existing_boss" },\n} as const;\n',
  ].join("\n"),
  "src/adventure/data/v2/v2EquipmentCatalog.ts":
    'const V2_EQUIPMENT_BASE = {\n  existing_equipment: { id: "existing_equipment" },\n} as const;\n',
  "src/adventure/data/titles.ts":
    'export const TITLES = {\n  existing_title: { id: "existing_title" },\n};\n',
  "src/adventure/data/v2/unexploredProgression.ts": [
    'const BOSS_ACHIEVEMENT_ID_BY_BOSS = {\n  existing_boss: "existing_achievement",\n} as const;\n',
    'export const UNEXPLORED_ACHIEVEMENTS = [\n  { id: "existing_achievement" },\n];\n',
  ].join("\n"),
  "src/adventure/data/v2/unexploredMonsterPools.ts":
    'export const UNEXPLORED_POOL_IDS = ["runaway_machines", "shadow_stalkers"] as const;\n',
};

async function setup() {
  const fixture = await createFixtureWorkspace();
  cleanups.push(fixture.cleanup);
  for (const [path, content] of Object.entries(fixtureFiles)) {
    const target = join(fixture.root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  await writeFile(
    join(fixture.root, "boss.yaml"),
    await readFile(
      new URL(
        "../../testing/fixtures/specs/unexplored-boss.yaml",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const store = new TaskStateStore(fixture.root);
  const dependencies = {
    projectRoot: fixture.root,
    registry: new AdapterRegistry().register(unexploredBossAdapter),
    store,
    runner: new CommandRunner(),
    resolveBaseSha: async () => "a".repeat(40),
    now: () => new Date("2026-09-02T00:00:00.000Z"),
  };
  const command = {
    kind: "content-create" as const,
    adapterId: "unexplored-boss",
    specPath: "boss.yaml",
    dryRun: false,
  };
  return { fixture, store, dependencies, command };
}

describe("unexploredBossAdapter", () => {
  it("is registered in the default CLI adapter registry", () => {
    expect(createDefaultAdapterRegistry().require("unexplored-boss")).toBe(
      unexploredBossAdapter,
    );
  });

  it("reports generated and external image targets in a write-free dry run", async () => {
    const { fixture, dependencies, command } = await setup();
    const catalogPath = join(
      fixture.root,
      "src/adventure/data/v2/unexploredBosses.ts",
    );
    const before = await readFile(catalogPath, "utf8");
    const reports: string[] = [];

    expect(
      await executeToolkitCommand(
        { ...command, dryRun: true },
        { ...dependencies, report: (message) => reports.push(message) },
      ),
    ).toBe(0);

    expect(reports).toEqual(
      expect.arrayContaining([
        "project:src/adventure/data/v2/unexploredBosses.ts",
        "project:src/adventure/v2/combat/echoWardenMechanic.ts",
        "task:integration.md",
        "external:public/images/monster/v2/unexplored-boss-echo-warden.webp",
      ]),
    );
    expect(reports.filter((line) => line.startsWith("external:"))).toHaveLength(4);
    await expect(readFile(catalogPath, "utf8")).resolves.toBe(before);
    await expect(storePath(fixture.root, "boss-echo-warden")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("applies in a fixture and produces an unchanged second run", async () => {
    const { fixture, store, dependencies, command } = await setup();

    expect(await executeToolkitCommand(command, dependencies)).toBe(0);
    const catalogPath = join(
      fixture.root,
      "src/adventure/data/v2/unexploredBosses.ts",
    );
    const mechanicPath = join(
      fixture.root,
      "src/adventure/v2/combat/echoWardenMechanic.ts",
    );
    await expect(readFile(catalogPath, "utf8")).resolves.toContain(
      "echo_warden: {",
    );
    await expect(readFile(mechanicPath, "utf8")).resolves.toContain(
      "TOOLKIT_IMPLEMENT_ME",
    );
    await utimes(catalogPath, new Date(1_000), new Date(1_000));

    expect(await executeToolkitCommand(command, dependencies)).toBe(0);

    expect((await stat(catalogPath)).mtimeMs).toBe(1_000);
    const state = await store.load("boss-echo-warden");
    expect(state.artifacts.map((artifact) => artifact.path)).toContain(
      "src/adventure/v2/combat/echoWardenMechanic.ts",
    );
    expect(state.steps.scaffold).toMatchObject({ status: "passed", attempts: 1 });
  });

  it("detects an external edit before reusing a completed scaffold", async () => {
    const { fixture, dependencies, command } = await setup();
    await executeToolkitCommand(command, dependencies);
    await writeFile(
      join(fixture.root, "src/adventure/data/v2/unexploredBosses.ts"),
      "user edit\n",
    );

    await expect(executeToolkitCommand(command, dependencies)).rejects.toThrow(
      "src/adventure/data/v2/unexploredBosses.ts changed outside toolkit ownership",
    );
  });

  it("selects image and simulation checks only after their prerequisites exist", async () => {
    const { fixture } = await setup();
    const context = {
      projectRoot: fixture.root,
      taskId: "boss-echo-warden",
      taskRoot: join(fixture.root, ".toolkit/work/boss-echo-warden"),
      baseSha: "a".repeat(40),
    };
    const spec = unexploredBossAdapter.parseSpec(
      parse(
        await readFile(join(fixture.root, "boss.yaml"), "utf8"),
      ),
    );
    expect(
      unexploredBossAdapter.selectFastChecks(context, spec).map((check) => check.id),
    ).not.toEqual(expect.arrayContaining(["images", "boss-simulation"]));

    for (const image of spec.images) {
      const target = join(fixture.root, image.target);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, "image");
    }
    const mechanicPath = join(
      fixture.root,
      "src/adventure/v2/combat/echoWardenMechanic.ts",
    );
    await mkdir(dirname(mechanicPath), { recursive: true });
    await writeFile(mechanicPath, "export const implemented = true;\n");

    expect(
      unexploredBossAdapter.selectFastChecks(context, spec).map((check) => check.id),
    ).toEqual(expect.arrayContaining(["images", "boss-simulation"]));
  });
});

async function storePath(root: string, taskId: string): Promise<string> {
  return readFile(join(root, ".toolkit", "work", taskId, "task.json"), "utf8");
}
