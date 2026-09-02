import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { AdapterContext } from "../../core/adapter";
import { loadYamlSpec } from "../../core/specFile";
import { createFixtureWorkspace } from "../../testing/fixtureWorkspace";
import { parseUnexploredBossSpec, type UnexploredBossSpecV1 } from "./schema";
import { planCatalogArtifacts } from "./targets";

const cleanups: Array<() => Promise<void>> = [];
let spec: UnexploredBossSpecV1;

beforeAll(async () => {
  spec = parseUnexploredBossSpec(
    await loadYamlSpec(
      new URL(
        "../../testing/fixtures/specs/unexplored-boss.yaml",
        import.meta.url,
      ).pathname,
    ),
  );
});

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const fixtureFiles: Readonly<Record<string, string>> = {
  "src/adventure/data/v2/unexploredBosses.ts": [
    'export const UNEXPLORED_SUMMON_STONE_MATERIALS = {\n  existing_stone: { id: "existing_stone" },\n} as const;\n',
    'export const UNEXPLORED_BOSSES = {\n  existing_boss: { id: "existing_boss" },\n} as const;\n',
    "export const untouched = true;\n",
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

async function fixtureRepository() {
  const fixture = await createFixtureWorkspace();
  cleanups.push(fixture.cleanup);
  for (const [path, content] of Object.entries(fixtureFiles)) {
    const target = join(fixture.root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  const context: AdapterContext = {
    projectRoot: fixture.root,
    taskId: spec.taskId,
    taskRoot: join(fixture.root, ".toolkit/work", spec.taskId),
    baseSha: "a".repeat(40),
  };
  return { fixture, context };
}

describe("planCatalogArtifacts", () => {
  it("plans four byte-preserving files covering all six named registries", async () => {
    const { context } = await fixtureRepository();

    const plans = await planCatalogArtifacts(context, spec);

    expect(plans.map((plan) => plan.path)).toEqual([
      "src/adventure/data/titles.ts",
      "src/adventure/data/v2/unexploredBosses.ts",
      "src/adventure/data/v2/unexploredProgression.ts",
      "src/adventure/data/v2/v2EquipmentCatalog.ts",
    ]);
    expect(plans.every((plan) => plan.operation === "replace-owned")).toBe(true);
    const textByPath = Object.fromEntries(
      plans.map((plan) => [plan.path, String(plan.content)]),
    );
    expect(textByPath["src/adventure/data/v2/unexploredBosses.ts"]).toContain(
      "v2_unexplored_echo_warden_summon_stone",
    );
    expect(textByPath["src/adventure/data/v2/unexploredBosses.ts"]).toContain(
      "echo_warden: {",
    );
    expect(textByPath["src/adventure/data/v2/v2EquipmentCatalog.ts"]).toContain(
      "v2_unexplored_eternal_echo_core",
    );
    expect(textByPath["src/adventure/data/titles.ts"]).toContain(
      "v2_unexplored_echo_warden",
    );
    expect(
      textByPath["src/adventure/data/v2/unexploredProgression.ts"],
    ).toContain('echo_warden: "defeat_echo_warden"');
    expect(
      textByPath["src/adventure/data/v2/unexploredProgression.ts"],
    ).toContain('id: "defeat_echo_warden"');
    expect(textByPath["src/adventure/data/v2/unexploredBosses.ts"]).toContain(
      "export const untouched = true;",
    );
  });

  it("rejects a pool that is absent from the repository catalog", async () => {
    const { context } = await fixtureRepository();
    const unknownPoolSpec = structuredClone(spec);
    unknownPoolSpec.pools = ["runaway_machines", "unknown_pool"];

    await expect(planCatalogArtifacts(context, unknownPoolSpec)).rejects.toThrow(
      "unknown unexplored pool: unknown_pool",
    );
  });

  it("rejects an existing target ID instead of silently replacing it", async () => {
    const { fixture, context } = await fixtureRepository();
    const target = join(
      fixture.root,
      "src/adventure/data/v2/unexploredBosses.ts",
    );
    await writeFile(
      target,
      (await readFile(target, "utf8")).replace(
        "existing_boss: { id: \"existing_boss\" },",
        'echo_warden: { id: "echo_warden" },',
      ),
    );

    await expect(planCatalogArtifacts(context, spec)).rejects.toThrow(
      "UNEXPLORED_BOSSES already contains echo_warden",
    );
  });
});
