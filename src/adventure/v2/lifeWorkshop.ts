import {
  MINING_MATERIAL_ID,
  type MiningMaterialId,
} from "@/adventure/data/v2/miningSpots";
import {
  WOODCUTTING_MATERIAL_ID,
  type WoodcuttingMaterialId,
} from "@/adventure/data/v2/woodcuttingSpots";
import {
  LIFE_PROCESSED_MATERIAL_ID,
  LIFE_PROCESSED_MATERIALS,
  type LifeProcessedMaterialId,
} from "./lifeWorkshopMaterials";
import {
  emptyLifeCraftingState,
  parseLifeCraftingState,
  type LifeCraftingState,
} from "./lifeCrafting";

export {
  LIFE_PROCESSED_MATERIAL_ID,
  LIFE_PROCESSED_MATERIALS,
  type LifeProcessedMaterialId,
} from "./lifeWorkshopMaterials";

export const LIFE_WORKSHOP_SAVE_KEY = "life-workshop.v1";
export const LIFE_SPECIALIZATION_LEVEL = 15;
export const LIFE_PROCESS_BATCH_LIMIT = 100;

export type LifeWorkshopActivity = "woodcutting" | "mining";
export type LifeSpecializationId =
  | "logger"
  | "woodworker"
  | "miner"
  | "smelter";
export type LifeToolTier = 0 | 1 | 2 | 3;

export type LifeProcessingRecipe = {
  id: string;
  activity: LifeWorkshopActivity;
  inputId: WoodcuttingMaterialId | MiningMaterialId;
  inputAmount: number;
  outputId: LifeProcessedMaterialId;
  outputAmount: number;
  requiredLevel: number;
};

export const LIFE_PROCESSING_RECIPES: readonly LifeProcessingRecipe[] = [
  { id: "pine_softwood", activity: "woodcutting", inputId: WOODCUTTING_MATERIAL_ID.pine, inputAmount: 10, outputId: LIFE_PROCESSED_MATERIAL_ID.softwood, outputAmount: 1, requiredLevel: 1 },
  { id: "birch_softwood", activity: "woodcutting", inputId: WOODCUTTING_MATERIAL_ID.birch, inputAmount: 8, outputId: LIFE_PROCESSED_MATERIAL_ID.softwood, outputAmount: 1, requiredLevel: 10 },
  { id: "willow_hardwood", activity: "woodcutting", inputId: WOODCUTTING_MATERIAL_ID.willow, inputAmount: 10, outputId: LIFE_PROCESSED_MATERIAL_ID.hardwood, outputAmount: 1, requiredLevel: 20 },
  { id: "oak_hardwood", activity: "woodcutting", inputId: WOODCUTTING_MATERIAL_ID.oak, inputAmount: 8, outputId: LIFE_PROCESSED_MATERIAL_ID.hardwood, outputAmount: 1, requiredLevel: 25 },
  { id: "cedar_masterwood", activity: "woodcutting", inputId: WOODCUTTING_MATERIAL_ID.cedar, inputAmount: 10, outputId: LIFE_PROCESSED_MATERIAL_ID.masterwood, outputAmount: 1, requiredLevel: 35 },
  { id: "cypress_masterwood", activity: "woodcutting", inputId: WOODCUTTING_MATERIAL_ID.cypress, inputAmount: 8, outputId: LIFE_PROCESSED_MATERIAL_ID.masterwood, outputAmount: 1, requiredLevel: 45 },
  { id: "iron_basic_ingot", activity: "mining", inputId: MINING_MATERIAL_ID.iron, inputAmount: 10, outputId: LIFE_PROCESSED_MATERIAL_ID.basicIngot, outputAmount: 1, requiredLevel: 1 },
  { id: "copper_basic_ingot", activity: "mining", inputId: MINING_MATERIAL_ID.copper, inputAmount: 8, outputId: LIFE_PROCESSED_MATERIAL_ID.basicIngot, outputAmount: 1, requiredLevel: 10 },
  { id: "silver_precious_ingot", activity: "mining", inputId: MINING_MATERIAL_ID.silver, inputAmount: 10, outputId: LIFE_PROCESSED_MATERIAL_ID.preciousIngot, outputAmount: 1, requiredLevel: 20 },
  { id: "gold_precious_ingot", activity: "mining", inputId: MINING_MATERIAL_ID.gold, inputAmount: 8, outputId: LIFE_PROCESSED_MATERIAL_ID.preciousIngot, outputAmount: 1, requiredLevel: 25 },
  { id: "mythril_arcane_alloy", activity: "mining", inputId: MINING_MATERIAL_ID.mythril, inputAmount: 10, outputId: LIFE_PROCESSED_MATERIAL_ID.arcaneAlloy, outputAmount: 1, requiredLevel: 35 },
  { id: "adamantite_arcane_alloy", activity: "mining", inputId: MINING_MATERIAL_ID.adamantite, inputAmount: 8, outputId: LIFE_PROCESSED_MATERIAL_ID.arcaneAlloy, outputAmount: 1, requiredLevel: 45 },
] as const;

export const LIFE_PROCESSING_RECIPE_BY_ID = new Map(
  LIFE_PROCESSING_RECIPES.map((recipe) => [recipe.id, recipe]),
);

export type LifeSpecialization = {
  id: LifeSpecializationId;
  activity: LifeWorkshopActivity;
  name: string;
  description: string;
  role: "gathering" | "processing";
};

export const LIFE_SPECIALIZATIONS: readonly LifeSpecialization[] = [
  { id: "logger", activity: "woodcutting", name: "벌채가", description: "직접·자동 벌목의 추가 원목 획득률을 높입니다.", role: "gathering" },
  { id: "woodworker", activity: "woodcutting", name: "목공가", description: "목재 가공의 대성공 확률을 높입니다.", role: "processing" },
  { id: "miner", activity: "mining", name: "채굴가", description: "직접·자동 채광의 추가 광석 획득률을 높입니다.", role: "gathering" },
  { id: "smelter", activity: "mining", name: "제련가", description: "광물 가공의 대성공 확률을 높입니다.", role: "processing" },
] as const;

export const LIFE_SPECIALIZATION_BY_ID = new Map(
  LIFE_SPECIALIZATIONS.map((specialization) => [specialization.id, specialization]),
);

export type LifeWorkshopState = {
  version: 1;
  specializations: Partial<Record<LifeWorkshopActivity, LifeSpecializationId>>;
  respecializations: Partial<Record<LifeWorkshopActivity, number>>;
  tools: Record<LifeWorkshopActivity, LifeToolTier>;
  processing: {
    batches: number;
    greatSuccesses: number;
    discoveredMaterialIds: LifeProcessedMaterialId[];
  };
  crafting: LifeCraftingState;
};

export function emptyLifeWorkshopState(): LifeWorkshopState {
  return {
    version: 1,
    specializations: {},
    respecializations: {},
    tools: { woodcutting: 0, mining: 0 },
    processing: { batches: 0, greatSuccesses: 0, discoveredMaterialIds: [] },
    crafting: emptyLifeCraftingState(),
  };
}

function safeInt(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function lifeToolTier(value: unknown): LifeToolTier {
  const tier = Math.min(3, safeInt(value));
  return tier as LifeToolTier;
}

export function parseLifeWorkshopState(raw: unknown): LifeWorkshopState {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const specs = source.specializations && typeof source.specializations === "object"
    ? source.specializations as Record<string, unknown>
    : {};
  const tools = source.tools && typeof source.tools === "object"
    ? source.tools as Record<string, unknown>
    : {};
  const changes = source.respecializations && typeof source.respecializations === "object"
    ? source.respecializations as Record<string, unknown>
    : {};
  const processing = source.processing && typeof source.processing === "object"
    ? source.processing as Record<string, unknown>
    : {};
  const crafting = parseLifeCraftingState(source.crafting);
  const specializations: LifeWorkshopState["specializations"] = {};
  for (const activity of ["woodcutting", "mining"] as const) {
    const id = specs[activity];
    if (
      typeof id === "string" &&
      LIFE_SPECIALIZATION_BY_ID.get(id as LifeSpecializationId)?.activity === activity
    ) {
      specializations[activity] = id as LifeSpecializationId;
    }
  }
  const discovered = Array.isArray(processing.discoveredMaterialIds)
    ? [...new Set(processing.discoveredMaterialIds.filter(
        (id): id is LifeProcessedMaterialId =>
          typeof id === "string" && id in LIFE_PROCESSED_MATERIALS,
      ))]
    : [];
  return {
    version: 1,
    specializations,
    respecializations: {
      woodcutting: safeInt(changes.woodcutting),
      mining: safeInt(changes.mining),
    },
    tools: {
      woodcutting: lifeToolTier(tools.woodcutting),
      mining: lifeToolTier(tools.mining),
    },
    processing: {
      batches: safeInt(processing.batches),
      greatSuccesses: safeInt(processing.greatSuccesses),
      discoveredMaterialIds: discovered,
    },
    crafting,
  };
}

export function lifeSpecializationRank(level: number): 0 | 1 | 2 | 3 {
  if (level >= 45) return 3;
  if (level >= 30) return 2;
  if (level >= LIFE_SPECIALIZATION_LEVEL) return 1;
  return 0;
}

const RANK_BONUS_PCT = [0, 3, 6, 10] as const;

export function lifeGatheringBonusPct(
  activity: LifeWorkshopActivity,
  state: LifeWorkshopState,
  level: number,
): number {
  const selected = state.specializations[activity];
  const gatheringId = activity === "woodcutting" ? "logger" : "miner";
  return selected === gatheringId
    ? RANK_BONUS_PCT[lifeSpecializationRank(level)]
    : 0;
}

export function lifeProcessingGreatSuccessPct(
  activity: LifeWorkshopActivity,
  state: LifeWorkshopState,
  level: number,
): number {
  const selected = state.specializations[activity];
  const processingId = activity === "woodcutting" ? "woodworker" : "smelter";
  const specializationBonus = selected === processingId
    ? RANK_BONUS_PCT[lifeSpecializationRank(level)]
    : 0;
  return 5 + specializationBonus;
}

export const LIFE_TOOL_NAMES: Record<
  LifeWorkshopActivity,
  readonly [string, string, string, string]
> = {
  woodcutting: ["낡은 벌목 도끼", "강철날 도끼", "균형 잡힌 도끼", "명인의 벌목 도끼"],
  mining: ["낡은 곡괭이", "강철 곡괭이", "균형 잡힌 곡괭이", "명인의 곡괭이"],
};

export const LIFE_TOOL_DURATION_REDUCTION_PCT = [0, 2, 5, 8] as const;
export const LIFE_TOOL_BONUS_MATERIAL_PCT = [0, 2, 4, 6] as const;

export type LifeToolUpgrade = {
  tier: 1 | 2 | 3;
  requiredLevel: number;
  materials: Record<string, number>;
};

export const LIFE_TOOL_UPGRADES: Record<
  LifeWorkshopActivity,
  readonly LifeToolUpgrade[]
> = {
  woodcutting: [
    { tier: 1, requiredLevel: 10, materials: { [LIFE_PROCESSED_MATERIAL_ID.softwood]: 2, [LIFE_PROCESSED_MATERIAL_ID.basicIngot]: 2, [MINING_MATERIAL_ID.stone]: 3 } },
    { tier: 2, requiredLevel: 25, materials: { [LIFE_PROCESSED_MATERIAL_ID.hardwood]: 2, [LIFE_PROCESSED_MATERIAL_ID.preciousIngot]: 2, [MINING_MATERIAL_ID.coal]: 2 } },
    { tier: 3, requiredLevel: 40, materials: { [LIFE_PROCESSED_MATERIAL_ID.masterwood]: 2, [LIFE_PROCESSED_MATERIAL_ID.arcaneAlloy]: 2, [MINING_MATERIAL_ID.roughGem]: 1 } },
  ],
  mining: [
    { tier: 1, requiredLevel: 10, materials: { [LIFE_PROCESSED_MATERIAL_ID.softwood]: 2, [LIFE_PROCESSED_MATERIAL_ID.basicIngot]: 2, [MINING_MATERIAL_ID.stone]: 3 } },
    { tier: 2, requiredLevel: 25, materials: { [LIFE_PROCESSED_MATERIAL_ID.hardwood]: 2, [LIFE_PROCESSED_MATERIAL_ID.preciousIngot]: 2, [MINING_MATERIAL_ID.coal]: 2 } },
    { tier: 3, requiredLevel: 40, materials: { [LIFE_PROCESSED_MATERIAL_ID.masterwood]: 2, [LIFE_PROCESSED_MATERIAL_ID.arcaneAlloy]: 2, [MINING_MATERIAL_ID.roughGem]: 1 } },
  ],
};

export function nextLifeToolUpgrade(
  activity: LifeWorkshopActivity,
  state: LifeWorkshopState,
): LifeToolUpgrade | null {
  return LIFE_TOOL_UPGRADES[activity].find(
    (upgrade) => upgrade.tier === state.tools[activity] + 1,
  ) ?? null;
}

export function lifeRespecializationCost(
  state: LifeWorkshopState,
  activity: LifeWorkshopActivity,
): number {
  return state.specializations[activity]
    ? 25_000 * (1 + (state.respecializations[activity] ?? 0))
    : 0;
}

export function maxProcessBatches(
  materials: Record<string, number>,
  recipe: LifeProcessingRecipe,
): number {
  return Math.min(
    LIFE_PROCESS_BATCH_LIMIT,
    Math.floor((materials[recipe.inputId] ?? 0) / recipe.inputAmount),
  );
}

export function rollProcessingBonusCount(
  batches: number,
  chancePct: number,
  rng: () => number = Math.random,
): number {
  let bonus = 0;
  const chance = Math.min(1, Math.max(0, chancePct / 100));
  for (let index = 0; index < batches; index += 1) {
    if (rng() < chance) bonus += 1;
  }
  return bonus;
}

export const LIFE_PROCESSING_TITLE_MILESTONES = [
  { count: 1, titleId: "life_processing_first" },
  { count: 3, titleId: "life_processing_refiner" },
  { count: 6, titleId: "life_processing_master" },
] as const;
