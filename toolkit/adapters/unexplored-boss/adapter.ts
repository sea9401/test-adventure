import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ToolkitAdapter } from "../../core/adapter";
import type { CheckDefinition } from "../../core/artifacts";
import { parseUnexploredBossSpec, type UnexploredBossSpecV1 } from "./schema";
import { planMechanicScaffolds } from "./scaffolds";
import { planCatalogArtifacts } from "./targets";
import { validateUnexploredBossArtifacts } from "./validators";

function prerequisiteChecks(
  projectRoot: string,
  spec: UnexploredBossSpecV1,
): { imagesReady: boolean; mechanicReady: boolean } {
  const imagesReady = spec.images.every((image) =>
    existsSync(join(projectRoot, image.target)),
  );
  const mechanicPath = join(
    projectRoot,
    "src/adventure/v2/combat",
    `${spec.mechanic.moduleName}Mechanic.ts`,
  );
  const mechanicReady =
    existsSync(mechanicPath) &&
    !readFileSync(mechanicPath, "utf8").includes("TOOLKIT_IMPLEMENT_ME");
  return { imagesReady, mechanicReady };
}

function fastChecks(
  projectRoot: string,
  spec: UnexploredBossSpecV1,
): readonly CheckDefinition[] {
  const checks: CheckDefinition[] = [
    {
      id: "adapter-tests",
      command: "npx",
      args: ["vitest", "run", "toolkit/adapters/unexplored-boss"],
      dependsOn: [],
    },
    {
      id: "catalog-tests",
      command: "npx",
      args: [
        "vitest",
        "run",
        "src/adventure/data/v2/unexploredBosses.test.ts",
        "src/adventure/data/v2/unexploredProgression.test.ts",
        "src/adventure/data/v2/coopBosses.test.ts",
      ],
      dependsOn: ["adapter-tests"],
    },
    {
      id: "targeted-lint",
      command: "npx",
      args: [
        "eslint",
        "toolkit/adapters/unexplored-boss",
        "src/adventure/data/v2/unexploredBosses.ts",
        "src/adventure/data/v2/unexploredProgression.ts",
        "src/adventure/data/v2/coopBosses.ts",
      ],
      dependsOn: ["catalog-tests"],
    },
  ];
  const prerequisites = prerequisiteChecks(projectRoot, spec);
  let lastCheck = "targeted-lint";
  if (prerequisites.imagesReady) {
    checks.push({
      id: "images",
      command: "npm",
      args: ["run", "check-images"],
      dependsOn: [lastCheck],
    });
    lastCheck = "images";
  }
  if (prerequisites.mechanicReady) {
    checks.push({
      id: "boss-simulation",
      command: "npm",
      args: [
        "run",
        "sim:coop-boss",
        "--",
        "--trials=10",
        "--seed=20260902",
        `--boss=${spec.id}`,
        "--json",
      ],
      dependsOn: [lastCheck],
    });
  }
  return checks;
}

export const unexploredBossAdapter: ToolkitAdapter<UnexploredBossSpecV1> = {
  id: "unexplored-boss",
  displayName: "미개척지 개인 보스",
  specVersion: 1,
  parseSpec: parseUnexploredBossSpec,
  async plan(context, spec) {
    return [
      ...(await planCatalogArtifacts(context, spec)),
      ...planMechanicScaffolds(spec),
    ].sort((left, right) =>
      `${left.scope}:${left.path}`.localeCompare(`${right.scope}:${right.path}`),
    );
  },
  validateGenerated: validateUnexploredBossArtifacts,
  listExternalTargets(_context, spec) {
    return spec.images.map((image) => image.target).toSorted();
  },
  selectFastChecks(context, spec) {
    return fastChecks(context.projectRoot, spec);
  },
  selectFullChecks(context, spec) {
    const checks = [...fastChecks(context.projectRoot, spec)];
    const lastCheck = checks.at(-1)?.id;
    checks.push(
      {
        id: "typecheck",
        command: "npx",
        args: ["tsc", "--noEmit"],
        env: { NODE_OPTIONS: "--max-old-space-size=4096" },
        dependsOn: lastCheck === undefined ? [] : [lastCheck],
      },
      {
        id: "full-tests",
        command: "npm",
        args: ["test"],
        dependsOn: ["typecheck"],
      },
    );
    return checks;
  },
};
