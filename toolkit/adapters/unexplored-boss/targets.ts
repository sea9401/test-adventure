import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { AdapterContext } from "../../core/adapter";
import type { ArtifactPlan } from "../../core/artifacts";
import type { UnexploredBossSpecV1 } from "./schema";
import {
  renderAchievement,
  renderBossAchievementMapping,
  renderBossDefinition,
  renderEquipmentEntries,
  renderSummonMaterial,
  renderTitle,
} from "./templates";
import {
  insertArrayElement,
  insertObjectProperty,
  readStringArrayElements,
} from "./typescriptEditor";

const TARGETS = {
  titles: "src/adventure/data/titles.ts",
  bosses: "src/adventure/data/v2/unexploredBosses.ts",
  progression: "src/adventure/data/v2/unexploredProgression.ts",
  equipment: "src/adventure/data/v2/v2EquipmentCatalog.ts",
  pools: "src/adventure/data/v2/unexploredMonsterPools.ts",
} as const;
const REGISTRY_OWNERSHIP_KEY = "unexplored-boss:registries-v1";

function newlineOf(source: string): "\n" | "\r\n" {
  return source.includes("\r\n") ? "\r\n" : "\n";
}

async function sourceAt(projectRoot: string, path: string): Promise<string> {
  return readFile(join(projectRoot, path), "utf8");
}

function registryPlan(path: string, content: string): ArtifactPlan {
  return {
    scope: "project",
    path,
    operation: "replace-owned",
    ownershipKey: REGISTRY_OWNERSHIP_KEY,
    content,
  };
}

export async function planCatalogArtifacts(
  context: AdapterContext,
  spec: UnexploredBossSpecV1,
): Promise<readonly ArtifactPlan[]> {
  const poolSource = await sourceAt(context.projectRoot, TARGETS.pools);
  const poolIds = new Set(
    readStringArrayElements(
      poolSource,
      "UNEXPLORED_POOL_IDS",
      TARGETS.pools,
    ),
  );
  for (const poolId of spec.pools) {
    if (!poolIds.has(poolId)) {
      throw new Error(`unknown unexplored pool: ${poolId}`);
    }
  }

  let bossSource = await sourceAt(context.projectRoot, TARGETS.bosses);
  const bossNewline = newlineOf(bossSource);
  bossSource = insertObjectProperty(bossSource, {
    fileName: TARGETS.bosses,
    declarationName: "UNEXPLORED_SUMMON_STONE_MATERIALS",
    propertyName: spec.summon.materialId,
    renderedProperty: renderSummonMaterial(spec, bossNewline),
  });
  bossSource = insertObjectProperty(bossSource, {
    fileName: TARGETS.bosses,
    declarationName: "UNEXPLORED_BOSSES",
    propertyName: spec.id,
    renderedProperty: renderBossDefinition(spec, bossNewline),
  });

  let equipmentSource = await sourceAt(context.projectRoot, TARGETS.equipment);
  const equipmentNewline = newlineOf(equipmentSource);
  for (const [index, renderedProperty] of renderEquipmentEntries(
    spec,
    equipmentNewline,
  ).entries()) {
    equipmentSource = insertObjectProperty(equipmentSource, {
      fileName: TARGETS.equipment,
      declarationName: "V2_EQUIPMENT_BASE",
      propertyName: spec.drops[index].id,
      renderedProperty,
    });
  }

  const titleSourceOriginal = await sourceAt(context.projectRoot, TARGETS.titles);
  const titleSource = insertObjectProperty(titleSourceOriginal, {
    fileName: TARGETS.titles,
    declarationName: "TITLES",
    propertyName: spec.title.id,
    renderedProperty: renderTitle(spec, newlineOf(titleSourceOriginal)),
  });

  let progressionSource = await sourceAt(
    context.projectRoot,
    TARGETS.progression,
  );
  const progressionNewline = newlineOf(progressionSource);
  progressionSource = insertObjectProperty(progressionSource, {
    fileName: TARGETS.progression,
    declarationName: "BOSS_ACHIEVEMENT_ID_BY_BOSS",
    propertyName: spec.id,
    renderedProperty: renderBossAchievementMapping(spec, progressionNewline),
  });
  progressionSource = insertArrayElement(progressionSource, {
    fileName: TARGETS.progression,
    declarationName: "UNEXPLORED_ACHIEVEMENTS",
    elementId: spec.achievement.id,
    renderedElement: renderAchievement(spec, progressionNewline),
  });

  return [
    registryPlan(TARGETS.titles, titleSource),
    registryPlan(TARGETS.bosses, bossSource),
    registryPlan(TARGETS.progression, progressionSource),
    registryPlan(TARGETS.equipment, equipmentSource),
  ];
}
