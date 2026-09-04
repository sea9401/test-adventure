import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { AdapterContext } from "../../core/adapter";
import { loadYamlSpec } from "../../core/specFile";
import { createFixtureWorkspace } from "../../testing/fixtureWorkspace";
import { parseUnexploredBossSpec, type UnexploredBossSpecV1 } from "./schema";
import { planMechanicScaffolds } from "./scaffolds";
import { validateUnexploredBossArtifacts } from "./validators";

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

async function generatedFixture() {
  const fixture = await createFixtureWorkspace();
  cleanups.push(fixture.cleanup);
  const context: AdapterContext = {
    projectRoot: fixture.root,
    taskId: spec.taskId,
    taskRoot: join(fixture.root, ".toolkit/work", spec.taskId),
    baseSha: "a".repeat(40),
  };
  for (const plan of planMechanicScaffolds(spec)) {
    if (plan.scope !== "project") continue;
    const target = join(fixture.root, plan.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, plan.content);
  }
  const bossCatalog = join(
    fixture.root,
    "src/adventure/data/v2/unexploredBosses.ts",
  );
  const equipmentCatalog = join(
    fixture.root,
    "src/adventure/data/v2/v2EquipmentCatalog.ts",
  );
  await mkdir(dirname(bossCatalog), { recursive: true });
  await writeFile(bossCatalog, `image: "public-placeholder${spec.images[0].target.slice(6)}"\n`);
  await writeFile(
    equipmentCatalog,
    spec.images
      .slice(1)
      .map((image) => `image: "${image.target.slice(6)}"`)
      .join("\n"),
  );
  return { fixture, context };
}

describe("validateUnexploredBossArtifacts", () => {
  it("reports one concentrated mechanic blocker with both paths", async () => {
    const { context } = await generatedFixture();
    const issues = await validateUnexploredBossArtifacts(context, spec);
    const blocker = issues.find((issue) => issue.code === "mechanic-incomplete");
    expect(blocker).toMatchObject({ severity: "error" });
    expect(blocker?.message).toContain(
      "src/adventure/v2/combat/echoWardenMechanic.ts",
    );
    expect(blocker?.message).toContain(
      "src/adventure/v2/combat/echoWardenMechanic.test.ts",
    );
  });

  it("clears the mechanic blocker after both focused files are implemented", async () => {
    const { fixture, context } = await generatedFixture();
    for (const path of [
      "src/adventure/v2/combat/echoWardenMechanic.ts",
      "src/adventure/v2/combat/echoWardenMechanic.test.ts",
    ]) {
      const target = join(fixture.root, path);
      await writeFile(
        target,
        (await readFile(target, "utf8")).replaceAll(
          "TOOLKIT_IMPLEMENT_ME",
          "IMPLEMENTED",
        ),
      );
    }

    expect(
      (await validateUnexploredBossArtifacts(context, spec)).filter(
        (issue) => issue.code === "mechanic-incomplete",
      ),
    ).toEqual([]);
  });

  it("reports missing image references and unresolved conflict markers", async () => {
    const { fixture, context } = await generatedFixture();
    await writeFile(
      join(fixture.root, "src/adventure/data/v2/v2EquipmentCatalog.ts"),
      "<<<<<<< ours\n=======\n>>>>>>> theirs\n",
    );

    const issues = await validateUnexploredBossArtifacts(context, spec);
    expect(issues.some((issue) => issue.code === "unresolved-conflict")).toBe(
      true,
    );
    expect(
      issues.filter((issue) => issue.code === "image-unreferenced"),
    ).toHaveLength(3);
  });
});
