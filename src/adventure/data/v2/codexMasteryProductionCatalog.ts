import { COOKING_RECIPES } from "@/adventure/v2/cooking";
import {
  LIFE_FIELD_RECORD_CATALOG,
  type LifeFieldRecordDefinition,
} from "@/adventure/v2/lifeFieldRecords";
import { codexMasteryBudgetReport, createCodexMasteryCatalog } from "./codexMasteryCatalog";
import type {
  CodexMasteryCategory,
  CodexMasteryCountStage,
  CodexMasteryEntryDefinition,
} from "./codexMasteryTypes";
import { MAX_FRONTIER_DEPTH, dungeonThemeCatalog } from "./dungeon";
import { FISH, FISH_IDS, type FishTier } from "./fish";
import { V2_EQUIPMENT } from "./v2Equipment";
import { V2_JOB_LIST } from "./v2JobCatalog";

export const CODEX_MASTERY_CATALOG_VERSION = 1;

type Thresholds = Record<CodexMasteryCountStage, number>;

const FISH_THRESHOLDS: Record<FishTier, Thresholds> = {
  common: { bronze: 5, silver: 30, gold: 150, platinum: 500, diamond: 1_500, legendary: 5_000 },
  uncommon: { bronze: 3, silver: 20, gold: 100, platinum: 300, diamond: 1_000, legendary: 3_000 },
  rare: { bronze: 2, silver: 10, gold: 50, platinum: 150, diamond: 500, legendary: 1_500 },
  epic: { bronze: 1, silver: 5, gold: 25, platinum: 75, diamond: 250, legendary: 750 },
  legendary: { bronze: 1, silver: 3, gold: 10, platinum: 20, diamond: 50, legendary: 100 },
};

const MONSTER_THRESHOLDS = {
  normal: { bronze: 25, silver: 250, gold: 1_000, platinum: 2_500, diamond: 5_000, legendary: 10_000 },
  elite: { bronze: 10, silver: 75, gold: 300, platinum: 750, diamond: 1_500, legendary: 3_000 },
} as const satisfies Record<string, Thresholds>;

const EQUIPMENT_THRESHOLDS = {
  common: { bronze: 1, silver: 3, gold: 10, platinum: 25, diamond: 50, legendary: 100 },
  set: { bronze: 1, silver: 2, gold: 5, platinum: 10, diamond: 20, legendary: 50 },
  ultraRare: { bronze: 1, silver: 2, gold: 3, platinum: 5, diamond: 10, legendary: 20 },
  craftOnly: { bronze: 1, silver: 3, gold: 10, platinum: 25, diamond: 50, legendary: 100 },
} as const satisfies Record<string, Thresholds>;

const COOKING_THRESHOLDS = {
  normal: { bronze: 3, silver: 25, gold: 100, platinum: 250, diamond: 500, legendary: 1_000 },
  advanced: { bronze: 2, silver: 15, gold: 75, platinum: 200, diamond: 400, legendary: 800 },
  rareIngredient: { bronze: 1, silver: 10, gold: 50, platinum: 100, diamond: 250, legendary: 500 },
} as const satisfies Record<string, Thresholds>;

const LIFE_THRESHOLDS = {
  region: { bronze: 10, silver: 100, gold: 500, platinum: 1_000, diamond: 2_500, legendary: 5_000 },
  environment: { bronze: 1, silver: 5, gold: 15, platinum: 30, diamond: 60, legendary: 120 },
  discovery: { bronze: 1, silver: 3, gold: 10, platinum: 20, diamond: 40, legendary: 80 },
  rareDiscovery: { bronze: 1, silver: 2, gold: 3, platinum: 5, diamond: 10, legendary: 20 },
} as const satisfies Record<string, Thresholds>;

const JOB_THRESHOLDS: Thresholds = {
  bronze: 50,
  silver: 250,
  gold: 1_000,
  platinum: 2_500,
  diamond: 5_000,
  legendary: 10_000,
};

const monsterThemes = dungeonThemeCatalog(MAX_FRONTIER_DEPTH);
const monsterById = new Map<
  string,
  { label: string; elite: boolean }
>();
export const CODEX_MASTERY_MONSTER_NAME_TO_ENTRY_ID = new Map<string, string>();
for (const theme of monsterThemes) {
  theme.enemies.forEach((enemy, index) => {
    const elite = index === theme.enemies.length - 1;
    const previous = monsterById.get(enemy.key);
    monsterById.set(enemy.key, {
      label: previous?.label ?? enemy.name,
      elite: previous?.elite === true || elite,
    });
    for (const legacyName of [enemy.name, enemy.key]) {
      const mapped = CODEX_MASTERY_MONSTER_NAME_TO_ENTRY_ID.get(legacyName);
      if (mapped && mapped !== enemy.key) {
        throw new Error(`ambiguous monster mastery name: ${legacyName}`);
      }
      CODEX_MASTERY_MONSTER_NAME_TO_ENTRY_ID.set(legacyName, enemy.key);
    }
  });
}

const sourceCounts: Record<CodexMasteryCategory, number> = {
  equipment: Object.keys(V2_EQUIPMENT).length,
  fish: FISH_IDS.length,
  monster: monsterById.size,
  cooking: COOKING_RECIPES.length,
  life: LIFE_FIELD_RECORD_CATALOG.length,
  job: V2_JOB_LIST.filter((job) => job.tier > 0).length,
};

function scoreWeight(category: CodexMasteryCategory): number {
  return Math.round(10_000_000 / (22 * sourceCounts[category]));
}

function definition(
  category: CodexMasteryCategory,
  entryId: string,
  label: string,
  thresholds: Thresholds,
  seals: CodexMasteryEntryDefinition["seals"],
): CodexMasteryEntryDefinition {
  return {
    category,
    entryId,
    label,
    thresholds,
    scoreWeightMilli: scoreWeight(category),
    seals,
  };
}

function equipmentThresholds(id: keyof typeof V2_EQUIPMENT): Thresholds {
  const item = V2_EQUIPMENT[id];
  if (item.rarity === "unique") return EQUIPMENT_THRESHOLDS.ultraRare;
  if (item.craftOnly === true) return EQUIPMENT_THRESHOLDS.craftOnly;
  if (item.setId) return EQUIPMENT_THRESHOLDS.set;
  return EQUIPMENT_THRESHOLDS.common;
}

function cookingThresholds(recipe: (typeof COOKING_RECIPES)[number]): Thresholds {
  const legendaryCatch = Object.hasOwn(recipe.fishingIngredients ?? {}, "catch_legendary");
  if (recipe.optionalRareItemId || legendaryCatch) return COOKING_THRESHOLDS.rareIngredient;
  if (recipe.requiredLevel >= 20) return COOKING_THRESHOLDS.advanced;
  return COOKING_THRESHOLDS.normal;
}

function lifeThresholds(entry: LifeFieldRecordDefinition): Thresholds {
  if (entry.kind === "region") return LIFE_THRESHOLDS.region;
  if (entry.kind === "environment") return LIFE_THRESHOLDS.environment;
  return entry.rare ? LIFE_THRESHOLDS.rareDiscovery : LIFE_THRESHOLDS.discovery;
}

export const CODEX_MASTERY_DEFINITIONS: readonly CodexMasteryEntryDefinition[] = [
  ...Object.entries(V2_EQUIPMENT).map(([id, item]) =>
    definition("equipment", id, item.name, equipmentThresholds(id as keyof typeof V2_EQUIPMENT), {
      origin: { pointUnits: 2 },
      ...(item.craftOnly ? { crafted: { pointUnits: 2 as const }, masterwork: { pointUnits: 4 as const } } : {}),
    }),
  ),
  ...FISH_IDS.map((id) =>
    definition("fish", id, FISH[id].name, FISH_THRESHOLDS[FISH[id].tier], {
      giant: { pointUnits: 2 },
      legendary_print: { pointUnits: 4 },
      night_catch: { pointUnits: 2 },
    }),
  ),
  ...[...monsterById.entries()].map(([id, monster]) =>
    definition(
      "monster",
      id,
      monster.label,
      monster.elite ? MONSTER_THRESHOLDS.elite : MONSTER_THRESHOLDS.normal,
      { rival: { pointUnits: 2 }, tactical_variety: { pointUnits: 4 } },
    ),
  ),
  ...COOKING_RECIPES.map((recipe) =>
    definition("cooking", recipe.id, recipe.name, cookingThresholds(recipe), {
      careful: { pointUnits: 2 },
      masterpiece: { pointUnits: 4 },
      rare_ingredient: { pointUnits: 2 },
      order_delivery: { pointUnits: 2 },
    }),
  ),
  ...LIFE_FIELD_RECORD_CATALOG.map((entry) =>
    definition("life", entry.id, entry.label, lifeThresholds(entry), {
      breadth: { pointUnits: 2 },
      rare_revisit: { pointUnits: 4 },
    }),
  ),
  ...V2_JOB_LIST.filter((job) => job.tier > 0).map((job) =>
    definition("job", job.id, job.name, JOB_THRESHOLDS, {
      all_skills: { pointUnits: 2 },
      boss_variety: { pointUnits: 4 },
    }),
  ),
];

export const CODEX_MASTERY_CATALOG = createCodexMasteryCatalog(
  CODEX_MASTERY_DEFINITIONS,
);

export const CODEX_MASTERY_BUDGET_REPORT = codexMasteryBudgetReport(
  CODEX_MASTERY_CATALOG,
);
