import {
  PRODUCTION_KIND_ICON,
  PRODUCTION_KIND_NAME,
  type ProductionKind,
  type SettlementResources,
} from "./settlement";
import {
  V2_EQUIPMENT,
  type V2CraftQualityState,
  type V2EquipInstance,
  type V2Equipment,
  type V2EquipmentId,
} from "./v2Equipment";
import {
  BLACKSMITH_DISMANTLE_LEVEL,
  BLACKSMITH_MASTERWORK_LEVEL,
  BLACKSMITH_PLUS2_QUALITY_LEVEL,
  artisanLevel,
  type ArtisanProfessionId,
  type ArtisanState,
} from "./artisan";
import {
  GUILD_WORKSHOP_MATERIALS,
  GUILD_WORKSHOP_MATERIAL_ID,
  type GuildWorkshopMaterialId,
} from "./guildWorkshopMaterials";

export type GuildWorkshopRecipeId =
  | "crafted_oathblade"
  | "crafted_gale_bow"
  | "crafted_runic_staff"
  | "crafted_master_ring"
  | "crafted_ward_plate"
  | "crafted_spark_gloves"
  | "crafted_windstep_boots"
  | "crafted_aether_necklace"
  | "crafted_guard_gauntlets"
  | "crafted_guard_greaves"
  | "crafted_guard_ring"
  | "crafted_fury_plate"
  | "crafted_fury_boots"
  | "crafted_fury_necklace"
  | "crafted_pursuit_coat"
  | "crafted_pursuit_grips"
  | "crafted_pursuit_ring"
  | "crafted_pursuit_necklace"
  | "crafted_focus_robe"
  | "crafted_focus_gloves"
  | "crafted_focus_boots"
  | "crafted_focus_ring"
  | "crafted_sunforge_blade"
  | "crafted_aurora_crown"
  | "crafted_bulwark_shield"
  | "crafted_stormlance"
  | "crafted_kingbreaker_axe"
  | "crafted_astral_grimoire";

export type GuildWorkshopRecipe = {
  id: GuildWorkshopRecipeId;
  equipmentId: V2EquipmentId;
  cost: Partial<Record<ProductionKind, number>>;
  materialCost?: Partial<Record<GuildWorkshopMaterialId, number>>;
  profession: ArtisanProfessionId;
  requiredArtisanLevel: number;
  requiredSmithyLevel?: number;
  artisanXp: number;
  note: string;
};

export type GuildWorkshopStats = {
  totalCrafts: number;
  qualityCrafts: number;
  craftedByRecipe: Partial<Record<GuildWorkshopRecipeId, number>>;
};

export type GuildWorkshopBonus = {
  totalCrafts: number;
  qualityChanceBonusPct: number;
  tier: number;
  nextTotalCrafts: number | null;
};

export type GuildWorkshopCraftMode = "normal" | "masterwork";

export const GUILD_WORKSHOP_QUALITY_BONUS_PCT: Record<1 | 2, number> = {
  1: 5,
  2: 10,
};
export const GUILD_WORKSHOP_NORMAL_QUALITY_CAP_PCT = 25;
export const GUILD_WORKSHOP_MASTERWORK_QUALITY_CAP_PCT = 100;
export const GUILD_WORKSHOP_MASTERWORK_PLUS2_CHANCE_PCT = 25;
export const GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT = 3;
export const GUILD_WORKSHOP_MASTERWORK_MATERIAL_COST_MULT = 2;
export const GUILD_WORKSHOP_DISMANTLE_MAX_MATERIALS = 3;

export const GUILD_WORKSHOP_BONUS_TIERS: {
  tier: number;
  totalCrafts: number;
  qualityChanceBonusPct: number;
}[] = [
  { tier: 0, totalCrafts: 0, qualityChanceBonusPct: 0 },
  { tier: 1, totalCrafts: 50, qualityChanceBonusPct: 1 },
  { tier: 2, totalCrafts: 150, qualityChanceBonusPct: 2 },
  { tier: 3, totalCrafts: 300, qualityChanceBonusPct: 3 },
  { tier: 4, totalCrafts: 600, qualityChanceBonusPct: 5 },
];

export const GUILD_WORKSHOP_RECIPES: Record<
  GuildWorkshopRecipeId,
  GuildWorkshopRecipe
> = {
  crafted_oathblade: {
    id: "crafted_oathblade",
    equipmentId: "v2_crafted_oathblade",
    cost: { crop: 180, ore: 260 },
    profession: "blacksmith",
    requiredArtisanLevel: 1,
    artisanXp: 36,
    note: "수호 세트 무기",
  },
  crafted_gale_bow: {
    id: "crafted_gale_bow",
    equipmentId: "v2_crafted_gale_bow",
    cost: { crop: 260, ore: 150 },
    profession: "blacksmith",
    requiredArtisanLevel: 1,
    artisanXp: 34,
    note: "추격 세트 무기",
  },
  crafted_runic_staff: {
    id: "crafted_runic_staff",
    equipmentId: "v2_crafted_runic_staff",
    cost: { crop: 240, ore: 170 },
    profession: "blacksmith",
    requiredArtisanLevel: 1,
    artisanXp: 34,
    note: "집중 세트 무기",
  },
  crafted_master_ring: {
    id: "crafted_master_ring",
    equipmentId: "v2_crafted_master_ring",
    cost: { crop: 160, ore: 310 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    requiredSmithyLevel: 2,
    artisanXp: 66,
    note: "격노 세트 반지",
  },
  crafted_ward_plate: {
    id: "crafted_ward_plate",
    equipmentId: "v2_crafted_ward_plate",
    cost: { crop: 160, ore: 320 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 3 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    requiredSmithyLevel: 2,
    artisanXp: 68,
    note: "수호 세트 갑옷",
  },
  crafted_spark_gloves: {
    id: "crafted_spark_gloves",
    equipmentId: "v2_crafted_spark_gloves",
    cost: { crop: 210, ore: 190 },
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    artisanXp: 38,
    note: "격노 세트 장갑",
  },
  crafted_windstep_boots: {
    id: "crafted_windstep_boots",
    equipmentId: "v2_crafted_windstep_boots",
    cost: { crop: 240, ore: 150 },
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    artisanXp: 38,
    note: "추격 세트 장화",
  },
  crafted_aether_necklace: {
    id: "crafted_aether_necklace",
    equipmentId: "v2_crafted_aether_necklace",
    cost: { crop: 180, ore: 280 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    requiredSmithyLevel: 2,
    artisanXp: 66,
    note: "집중 세트 목걸이",
  },
  crafted_guard_gauntlets: {
    id: "crafted_guard_gauntlets",
    equipmentId: "v2_crafted_guard_gauntlets",
    cost: { crop: 170, ore: 240 },
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    artisanXp: 38,
    note: "수호 세트 장갑",
  },
  crafted_guard_greaves: {
    id: "crafted_guard_greaves",
    equipmentId: "v2_crafted_guard_greaves",
    cost: { crop: 190, ore: 210 },
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    artisanXp: 38,
    note: "수호 세트 장화",
  },
  crafted_guard_ring: {
    id: "crafted_guard_ring",
    equipmentId: "v2_crafted_guard_ring",
    cost: { crop: 180, ore: 330 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 4,
    requiredSmithyLevel: 2,
    artisanXp: 58,
    note: "수호 세트 반지",
  },
  crafted_fury_plate: {
    id: "crafted_fury_plate",
    equipmentId: "v2_crafted_fury_plate",
    cost: { crop: 230, ore: 330 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 3 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    requiredSmithyLevel: 2,
    artisanXp: 68,
    note: "격노 세트 갑옷",
  },
  crafted_fury_boots: {
    id: "crafted_fury_boots",
    equipmentId: "v2_crafted_fury_boots",
    cost: { crop: 240, ore: 180 },
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    artisanXp: 38,
    note: "격노 세트 장화",
  },
  crafted_fury_necklace: {
    id: "crafted_fury_necklace",
    equipmentId: "v2_crafted_fury_necklace",
    cost: { crop: 420, ore: 600 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 3 },
    profession: "blacksmith",
    requiredArtisanLevel: 6,
    requiredSmithyLevel: 3,
    artisanXp: 92,
    note: "격노 세트 목걸이",
  },
  crafted_pursuit_coat: {
    id: "crafted_pursuit_coat",
    equipmentId: "v2_crafted_pursuit_coat",
    cost: { crop: 340, ore: 210 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 3 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    requiredSmithyLevel: 2,
    artisanXp: 68,
    note: "추격 세트 갑옷",
  },
  crafted_pursuit_grips: {
    id: "crafted_pursuit_grips",
    equipmentId: "v2_crafted_pursuit_grips",
    cost: { crop: 260, ore: 160 },
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    artisanXp: 38,
    note: "추격 세트 장갑",
  },
  crafted_pursuit_ring: {
    id: "crafted_pursuit_ring",
    equipmentId: "v2_crafted_pursuit_ring",
    cost: { crop: 320, ore: 210 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 4,
    requiredSmithyLevel: 2,
    artisanXp: 58,
    note: "추격 세트 반지",
  },
  crafted_pursuit_necklace: {
    id: "crafted_pursuit_necklace",
    equipmentId: "v2_crafted_pursuit_necklace",
    cost: { crop: 620, ore: 420 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 3 },
    profession: "blacksmith",
    requiredArtisanLevel: 6,
    requiredSmithyLevel: 3,
    artisanXp: 92,
    note: "추격 세트 목걸이",
  },
  crafted_focus_robe: {
    id: "crafted_focus_robe",
    equipmentId: "v2_crafted_focus_robe",
    cost: { crop: 520, ore: 500 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 3 },
    profession: "blacksmith",
    requiredArtisanLevel: 6,
    requiredSmithyLevel: 3,
    artisanXp: 92,
    note: "집중 세트 갑옷",
  },
  crafted_focus_gloves: {
    id: "crafted_focus_gloves",
    equipmentId: "v2_crafted_focus_gloves",
    cost: { crop: 210, ore: 190 },
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    artisanXp: 38,
    note: "집중 세트 장갑",
  },
  crafted_focus_boots: {
    id: "crafted_focus_boots",
    equipmentId: "v2_crafted_focus_boots",
    cost: { crop: 220, ore: 180 },
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    artisanXp: 38,
    note: "집중 세트 장화",
  },
  crafted_focus_ring: {
    id: "crafted_focus_ring",
    equipmentId: "v2_crafted_focus_ring",
    cost: { crop: 280, ore: 260 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 4,
    requiredSmithyLevel: 2,
    artisanXp: 58,
    note: "집중 세트 반지",
  },
  crafted_sunforge_blade: {
    id: "crafted_sunforge_blade",
    equipmentId: "v2_crafted_sunforge_blade",
    cost: { crop: 460, ore: 680 },
    materialCost: {
      [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 2,
      [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 3,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 8,
    requiredSmithyLevel: 4,
    artisanXp: 120,
    note: "격노 세트 무기",
  },
  crafted_aurora_crown: {
    id: "crafted_aurora_crown",
    equipmentId: "v2_crafted_aurora_crown",
    cost: { crop: 640, ore: 880 },
    materialCost: {
      [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 1,
      [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 3,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 9,
    requiredSmithyLevel: 5,
    artisanXp: 155,
    note: "수호 세트 목걸이",
  },
  crafted_bulwark_shield: {
    id: "crafted_bulwark_shield",
    equipmentId: "v2_crafted_bulwark_shield",
    cost: { crop: 760, ore: 1080 },
    materialCost: {
      [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 2,
      [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 4,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 10,
    requiredSmithyLevel: 5,
    artisanXp: 180,
    note: "수호 세트 무기",
  },
  crafted_stormlance: {
    id: "crafted_stormlance",
    equipmentId: "v2_crafted_stormlance",
    cost: { crop: 920, ore: 880 },
    materialCost: {
      [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 3,
      [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 3,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 10,
    requiredSmithyLevel: 5,
    artisanXp: 182,
    note: "추격 세트 무기",
  },
  crafted_kingbreaker_axe: {
    id: "crafted_kingbreaker_axe",
    equipmentId: "v2_crafted_kingbreaker_axe",
    cost: { crop: 980, ore: 1320 },
    materialCost: {
      [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 3,
      [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 5,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 11,
    requiredSmithyLevel: 5,
    artisanXp: 210,
    note: "격노 세트 무기",
  },
  crafted_astral_grimoire: {
    id: "crafted_astral_grimoire",
    equipmentId: "v2_crafted_astral_grimoire",
    cost: { crop: 1180, ore: 1040 },
    materialCost: {
      [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 4,
      [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 5,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 11,
    requiredSmithyLevel: 5,
    artisanXp: 215,
    note: "집중 세트 무기",
  },
};

export const GUILD_WORKSHOP_RECIPE_IDS = Object.keys(
  GUILD_WORKSHOP_RECIPES,
) as GuildWorkshopRecipeId[];

export function isGuildWorkshopRecipeId(
  v: unknown,
): v is GuildWorkshopRecipeId {
  return (
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(GUILD_WORKSHOP_RECIPES, v)
  );
}

export function parseGuildWorkshopStats(raw: unknown): GuildWorkshopStats {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { totalCrafts: 0, qualityCrafts: 0, craftedByRecipe: {} };
  }
  const obj = raw as Record<string, unknown>;
  const totalCrafts = Math.max(
    0,
    Math.floor(Number(obj.totalCrafts) || 0),
  );
  const qualityCrafts = Math.max(
    0,
    Math.floor(Number(obj.qualityCrafts) || 0),
  );
  const craftedByRecipe: Partial<Record<GuildWorkshopRecipeId, number>> = {};
  const rawByRecipe =
    obj.craftedByRecipe != null &&
    typeof obj.craftedByRecipe === "object" &&
    !Array.isArray(obj.craftedByRecipe)
      ? (obj.craftedByRecipe as Record<string, unknown>)
      : {};
  for (const id of GUILD_WORKSHOP_RECIPE_IDS) {
    const n = Math.max(0, Math.floor(Number(rawByRecipe[id]) || 0));
    if (n > 0) craftedByRecipe[id] = n;
  }
  return { totalCrafts, qualityCrafts, craftedByRecipe };
}

export function addGuildWorkshopCraftStat(
  stats: GuildWorkshopStats,
  recipeId: GuildWorkshopRecipeId,
  qualityCrafted: boolean,
): GuildWorkshopStats {
  return {
    totalCrafts: stats.totalCrafts + 1,
    qualityCrafts: stats.qualityCrafts + (qualityCrafted ? 1 : 0),
    craftedByRecipe: {
      ...stats.craftedByRecipe,
      [recipeId]: (stats.craftedByRecipe[recipeId] ?? 0) + 1,
    },
  };
}

export function isGuildWorkshopCraftMode(
  v: unknown,
): v is GuildWorkshopCraftMode {
  return v === "normal" || v === "masterwork";
}

export function guildWorkshopRecipeResourceCost(
  recipe: GuildWorkshopRecipe,
  mode: GuildWorkshopCraftMode = "normal",
): Partial<Record<ProductionKind, number>> {
  const mult =
    mode === "masterwork" ? GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT : 1;
  const out: Partial<Record<ProductionKind, number>> = {};
  for (const [kind, amount] of Object.entries(recipe.cost)) {
    out[kind as ProductionKind] = Math.max(
      0,
      Math.ceil((amount ?? 0) * mult),
    );
  }
  return out;
}

export function guildWorkshopRecipeMaterialCost(
  recipe: GuildWorkshopRecipe,
  mode: GuildWorkshopCraftMode = "normal",
): Partial<Record<GuildWorkshopMaterialId, number>> {
  const mult =
    mode === "masterwork" ? GUILD_WORKSHOP_MASTERWORK_MATERIAL_COST_MULT : 1;
  const out: Partial<Record<GuildWorkshopMaterialId, number>> = {};
  for (const [id, amount] of Object.entries(recipe.materialCost ?? {})) {
    out[id as GuildWorkshopMaterialId] = Math.max(
      0,
      Math.ceil((amount ?? 0) * mult),
    );
  }
  return out;
}

function guildWorkshopCostText(
  cost: Partial<Record<ProductionKind, number>>,
  materialCost: Partial<Record<GuildWorkshopMaterialId, number>>,
): string {
  return [
    ...Object.entries(cost).map(([kind, amount]) => {
      const k = kind as ProductionKind;
      return `${PRODUCTION_KIND_ICON[k]} ${PRODUCTION_KIND_NAME[k]} ${amount}`;
    }),
    ...Object.entries(materialCost).map(([id, amount]) => {
      return `${GUILD_WORKSHOP_MATERIALS[id as GuildWorkshopMaterialId]?.name ?? id} ${amount}`;
    }),
  ].join(" · ");
}

export function canAffordGuildWorkshopRecipe(
  resources: SettlementResources,
  recipe: GuildWorkshopRecipe,
  mode: GuildWorkshopCraftMode = "normal",
): boolean {
  const cost = guildWorkshopRecipeResourceCost(recipe, mode);
  return Object.entries(cost).every(([kind, amount]) => {
    const k = kind as ProductionKind;
    return Math.max(0, resources[k] ?? 0) >= Math.max(0, amount ?? 0);
  });
}

export function parseGuildWorkshopMaterialInventory(
  raw: unknown,
): Record<string, number> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [id, amount] of Object.entries(raw as Record<string, unknown>)) {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (n > 0) out[id] = n;
  }
  return out;
}

export function hasGuildWorkshopRecipeMaterials(
  materials: Record<string, number>,
  recipe: GuildWorkshopRecipe,
  mode: GuildWorkshopCraftMode = "normal",
): boolean {
  const materialCost = guildWorkshopRecipeMaterialCost(recipe, mode);
  return Object.entries(materialCost).every(([id, amount]) => {
    return Math.max(0, materials[id] ?? 0) >= Math.max(0, amount ?? 0);
  });
}

export function spendGuildWorkshopRecipeMaterials(
  materials: Record<string, number>,
  recipe: GuildWorkshopRecipe,
  mode: GuildWorkshopCraftMode = "normal",
): Record<string, number> {
  const next: Record<string, number> = { ...materials };
  const materialCost = guildWorkshopRecipeMaterialCost(recipe, mode);
  for (const [id, amount] of Object.entries(materialCost)) {
    const left = Math.max(0, Math.floor((next[id] ?? 0) - (amount ?? 0)));
    if (left > 0) next[id] = left;
    else delete next[id];
  }
  return next;
}

export function addGuildWorkshopMaterials(
  materials: Record<string, number>,
  gains: Record<string, number>,
): Record<string, number> {
  const next: Record<string, number> = { ...materials };
  for (const [id, amountRaw] of Object.entries(gains)) {
    const amount = Math.max(0, Math.floor(Number(amountRaw) || 0));
    if (amount <= 0) continue;
    next[id] = Math.max(0, Math.floor(next[id] ?? 0)) + amount;
  }
  return next;
}

export type GuildWorkshopDismantleBlockedReason =
  | "locked_level"
  | "low_tier"
  | "no_material";

export type GuildWorkshopDismantlePlan = {
  materials: Partial<Record<GuildWorkshopMaterialId, number>>;
  artisanXp: number;
  blockedReason?: GuildWorkshopDismantleBlockedReason;
};

export function guildWorkshopDismantleMaterialForTier(
  tierRaw: number,
): GuildWorkshopMaterialId | undefined {
  const tier = Math.max(1, Math.floor(tierRaw));
  if (tier >= 10) return GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal;
  if (tier >= 8) return GUILD_WORKSHOP_MATERIAL_ID.sunstone;
  if (tier >= 6) return GUILD_WORKSHOP_MATERIAL_ID.mithrilShard;
  if (tier >= 4) return GUILD_WORKSHOP_MATERIAL_ID.refinedIron;
  return undefined;
}

export function guildWorkshopDismantlePlan(
  item: V2Equipment,
  inst: Pick<V2EquipInstance, "craftQuality" | "craftedBy"> = {},
  blacksmithLevelRaw = 1,
): GuildWorkshopDismantlePlan {
  const blacksmithLevel = Math.max(1, Math.floor(blacksmithLevelRaw));
  if (blacksmithLevel < BLACKSMITH_DISMANTLE_LEVEL) {
    return { materials: {}, artisanXp: 0, blockedReason: "locked_level" };
  }
  const materialId = guildWorkshopDismantleMaterialForTier(item.tier);
  if (!materialId) {
    return { materials: {}, artisanXp: 0, blockedReason: "low_tier" };
  }

  let amount = 1;
  if (item.craftOnly) amount += 1;
  if ((inst.craftQuality?.level ?? 0) >= 2) amount += 1;
  if (inst.craftedBy?.masterwork === true) amount += 1;
  amount = Math.min(GUILD_WORKSHOP_DISMANTLE_MAX_MATERIALS, amount);

  if (amount <= 0) {
    return { materials: {}, artisanXp: 0, blockedReason: "no_material" };
  }
  return {
    materials: { [materialId]: amount },
    artisanXp: Math.max(2, Math.min(10, Math.floor(item.tier / 2))),
  };
}

export function meetsGuildWorkshopRecipeLevel(
  artisan: ArtisanState,
  recipe: GuildWorkshopRecipe,
): boolean {
  return artisanLevel(artisan[recipe.profession]) >= recipe.requiredArtisanLevel;
}

export function guildWorkshopQualityChancePct(
  artisan: ArtisanState,
  recipe: GuildWorkshopRecipe,
  guildBonus: GuildWorkshopBonus | number = 0,
  mode: GuildWorkshopCraftMode = "normal",
): number {
  const level = artisanLevel(artisan[recipe.profession]);
  const bonusPct =
    typeof guildBonus === "number"
      ? guildBonus
      : guildBonus.qualityChanceBonusPct;
  const basePct = 3 + Math.max(0, level - 1) * 2 + bonusPct;
  if (mode === "masterwork") {
    return GUILD_WORKSHOP_MASTERWORK_QUALITY_CAP_PCT;
  }
  return Math.min(GUILD_WORKSHOP_NORMAL_QUALITY_CAP_PCT, basePct);
}

export function rollGuildWorkshopEnhance(
  artisan: ArtisanState,
  recipe: GuildWorkshopRecipe,
  rng: () => number,
  guildBonus: GuildWorkshopBonus | number = 0,
  mode: GuildWorkshopCraftMode = "normal",
): V2CraftQualityState | undefined {
  const chancePct = guildWorkshopQualityChancePct(
    artisan,
    recipe,
    guildBonus,
    mode,
  );
  const level = artisanLevel(artisan[recipe.profession]);
  if (mode === "masterwork") {
    if (level >= BLACKSMITH_PLUS2_QUALITY_LEVEL) {
      if (rng() * 100 < GUILD_WORKSHOP_MASTERWORK_PLUS2_CHANCE_PCT) {
        return { level: 2, bonusPct: GUILD_WORKSHOP_QUALITY_BONUS_PCT[2] };
      }
    }
    return { level: 1, bonusPct: GUILD_WORKSHOP_QUALITY_BONUS_PCT[1] };
  }
  if (rng() * 100 >= chancePct) return undefined;
  return { level: 1, bonusPct: GUILD_WORKSHOP_QUALITY_BONUS_PCT[1] };
}

export function spendGuildWorkshopRecipeCost(
  resources: SettlementResources,
  recipe: GuildWorkshopRecipe,
  mode: GuildWorkshopCraftMode = "normal",
): SettlementResources {
  const next: SettlementResources = { ...resources };
  const cost = guildWorkshopRecipeResourceCost(recipe, mode);
  for (const [kind, amount] of Object.entries(cost)) {
    const k = kind as ProductionKind;
    next[k] = Math.max(0, Math.floor((next[k] ?? 0) - (amount ?? 0)));
  }
  return next;
}

export function guildWorkshopRecipeView(
  recipe: GuildWorkshopRecipe,
  resources: SettlementResources,
  artisan: ArtisanState = {},
  guildBonus: GuildWorkshopBonus | number = 0,
  smithyLevel = 1,
  materials: Record<string, number> = {},
) {
  const item = V2_EQUIPMENT[recipe.equipmentId];
  const levelOk = meetsGuildWorkshopRecipeLevel(artisan, recipe);
  const artisanProfessionLevel = artisanLevel(artisan[recipe.profession]);
  const smithyLevelOk =
    smithyLevel >= Math.max(1, recipe.requiredSmithyLevel ?? 1);
  const resourceOk = canAffordGuildWorkshopRecipe(resources, recipe);
  const materialOk = hasGuildWorkshopRecipeMaterials(materials, recipe);
  const masterworkResourceOk = canAffordGuildWorkshopRecipe(
    resources,
    recipe,
    "masterwork",
  );
  const masterworkMaterialOk = hasGuildWorkshopRecipeMaterials(
    materials,
    recipe,
    "masterwork",
  );
  const masterworkLevelOk = artisanProfessionLevel >= BLACKSMITH_MASTERWORK_LEVEL;
  const qualityChancePct = guildWorkshopQualityChancePct(
    artisan,
    recipe,
    guildBonus,
  );
  const masterworkQualityChancePct = guildWorkshopQualityChancePct(
    artisan,
    recipe,
    guildBonus,
    "masterwork",
  );
  const normalCost = guildWorkshopRecipeResourceCost(recipe);
  const normalMaterialCost = guildWorkshopRecipeMaterialCost(recipe);
  const masterworkCost = guildWorkshopRecipeResourceCost(recipe, "masterwork");
  const masterworkMaterialCost = guildWorkshopRecipeMaterialCost(
    recipe,
    "masterwork",
  );
  return {
    id: recipe.id,
    equipmentId: recipe.equipmentId,
    itemName: item.name,
    slot: item.slot,
    tier: item.tier,
    craftOnly: item.craftOnly === true,
    note: recipe.note,
    cost: normalCost,
    materialCost: normalMaterialCost,
    profession: recipe.profession,
    requiredArtisanLevel: recipe.requiredArtisanLevel,
    requiredSmithyLevel: recipe.requiredSmithyLevel ?? 1,
    artisanXp: recipe.artisanXp,
    qualityChancePct,
    costText: guildWorkshopCostText(normalCost, normalMaterialCost),
    levelOk,
    smithyLevelOk,
    materialOk,
    resourceOk,
    canCraft: levelOk && smithyLevelOk && resourceOk && materialOk,
    masterwork: {
      requiredArtisanLevel: BLACKSMITH_MASTERWORK_LEVEL,
      levelOk: masterworkLevelOk,
      resourceOk: masterworkResourceOk,
      materialOk: masterworkMaterialOk,
      canCraft:
        levelOk &&
        masterworkLevelOk &&
        smithyLevelOk &&
        masterworkResourceOk &&
        masterworkMaterialOk,
      qualityChancePct: masterworkQualityChancePct,
      cost: masterworkCost,
      materialCost: masterworkMaterialCost,
      costText: guildWorkshopCostText(masterworkCost, masterworkMaterialCost),
      plus2Unlocked: artisanProfessionLevel >= BLACKSMITH_PLUS2_QUALITY_LEVEL,
      plus2ChancePct: GUILD_WORKSHOP_MASTERWORK_PLUS2_CHANCE_PCT,
    },
  };
}

export function guildWorkshopBonusFromTotalCrafts(
  totalCraftsRaw: number,
): GuildWorkshopBonus {
  const totalCrafts = Math.max(0, Math.floor(totalCraftsRaw));
  let active = GUILD_WORKSHOP_BONUS_TIERS[0];
  for (const tier of GUILD_WORKSHOP_BONUS_TIERS) {
    if (totalCrafts >= tier.totalCrafts) active = tier;
  }
  const next =
    GUILD_WORKSHOP_BONUS_TIERS.find(
      (tier) => tier.totalCrafts > totalCrafts,
    ) ?? null;
  return {
    totalCrafts,
    qualityChanceBonusPct: active.qualityChanceBonusPct,
    tier: active.tier,
    nextTotalCrafts: next?.totalCrafts ?? null,
  };
}
