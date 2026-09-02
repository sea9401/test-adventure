import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { AdapterContext, ValidationIssue } from "../../core/adapter";
import type { UnexploredBossSpecV1 } from "./schema";
import { planMechanicScaffolds } from "./scaffolds";

const CONFLICT_MARKER = /^(?:<<<<<<<|=======|>>>>>>>)(?: |$)/m;
const CATALOG_PATHS = [
  "src/adventure/data/titles.ts",
  "src/adventure/data/v2/unexploredBosses.ts",
  "src/adventure/data/v2/unexploredProgression.ts",
  "src/adventure/data/v2/v2EquipmentCatalog.ts",
] as const;

async function optionalSource(
  projectRoot: string,
  path: string,
): Promise<string | null> {
  try {
    return await readFile(join(projectRoot, path), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function validateUnexploredBossArtifacts(
  context: AdapterContext,
  spec: UnexploredBossSpecV1,
): Promise<readonly ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const projectPlans = planMechanicScaffolds(spec).filter(
    (plan) => plan.scope === "project",
  );
  const mechanicPaths = projectPlans
    .map((plan) => plan.path)
    .filter(
      (path) =>
        path.endsWith("Mechanic.ts") || path.endsWith("Mechanic.test.ts"),
    );
  const blockedPaths: string[] = [];
  for (const path of mechanicPaths) {
    const source = await optionalSource(context.projectRoot, path);
    if (source === null) {
      issues.push({
        severity: "error",
        code: "scaffold-missing",
        message: `planned mechanic scaffold is missing: ${path}`,
        path,
      });
    } else if (source.includes("TOOLKIT_IMPLEMENT_ME")) {
      blockedPaths.push(path);
    }
  }
  if (blockedPaths.length > 0) {
    issues.push({
      severity: "error",
      code: "mechanic-incomplete",
      message: `mechanic implementation remains blocked in: ${blockedPaths.join(", ")}`,
      path: blockedPaths[0],
      blockingPhase: "release",
    });
  }

  const pathsToScan = [
    ...new Set([...projectPlans.map((plan) => plan.path), ...CATALOG_PATHS]),
  ];
  for (const path of pathsToScan) {
    const source = await optionalSource(context.projectRoot, path);
    if (source !== null && CONFLICT_MARKER.test(source)) {
      issues.push({
        severity: "error",
        code: "unresolved-conflict",
        message: `unresolved conflict marker in ${path}`,
        path,
      });
    }
  }

  const bossCatalog =
    (await optionalSource(
      context.projectRoot,
      "src/adventure/data/v2/unexploredBosses.ts",
    )) ?? "";
  const equipmentCatalog =
    (await optionalSource(
      context.projectRoot,
      "src/adventure/data/v2/v2EquipmentCatalog.ts",
    )) ?? "";
  for (const [index, image] of spec.images.entries()) {
    const publicPath = image.target.slice("public".length);
    const catalog = index === 0 ? bossCatalog : equipmentCatalog;
    if (!catalog.includes(publicPath)) {
      issues.push({
        severity: "error",
        code: "image-unreferenced",
        message: `planned image is not referenced by its catalog: ${image.target}`,
        path: image.target,
      });
    }
  }
  return issues;
}
