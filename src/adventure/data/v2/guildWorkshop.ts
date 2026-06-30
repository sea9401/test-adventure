import {
  PRODUCTION_KIND_ICON,
  PRODUCTION_KIND_NAME,
  type ProductionKind,
  type SettlementResources,
} from "./settlement";
import { V2_EQUIPMENT, type V2EquipmentId } from "./v2Equipment";
import { type V2EnhanceState } from "./v2Enhance";
import {
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
  | "iron_sword"
  | "greatsword"
  | "mithril_sword"
  | "wooden_bow"
  | "horn_bow"
  | "starsong_bow"
  | "oak_staff"
  | "obsidian_staff"
  | "starlit_staff"
  | "chain_mail"
  | "full_plate"
  | "mithril_plate"
  | "leather_armor"
  | "shadow_cloak"
  | "windweave_cloak"
  | "leather_gloves"
  | "shadow_gloves"
  | "windweave_gloves"
  | "leather_boots"
  | "shadow_boots"
  | "windweave_boots"
  | "silver_ring"
  | "lucky_charm"
  | "fate_ring"
  | "jade_amulet"
  | "crystal_amulet"
  | "mana_essence"
  | "crafted_oathblade"
  | "crafted_gale_bow"
  | "crafted_runic_staff"
  | "crafted_master_ring"
  | "crafted_ward_plate"
  | "crafted_spark_gloves"
  | "crafted_windstep_boots"
  | "crafted_aether_necklace"
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
export const GUILD_WORKSHOP_MASTERWORK_QUALITY_BONUS_PCT = 20;
export const GUILD_WORKSHOP_MASTERWORK_QUALITY_CAP_PCT = 45;
export const GUILD_WORKSHOP_MASTERWORK_PLUS2_CHANCE_PCT = 12;
export const GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT = 3;
export const GUILD_WORKSHOP_MASTERWORK_MATERIAL_COST_MULT = 2;

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
  iron_sword: {
    id: "iron_sword",
    equipmentId: "v2_iron_sword",
    cost: { crop: 3, ore: 8 },
    profession: "blacksmith",
    requiredArtisanLevel: 1,
    artisanXp: 12,
    note: "전열 기본 무기",
  },
  greatsword: {
    id: "greatsword",
    equipmentId: "v2_greatsword",
    cost: { crop: 18, ore: 30 },
    profession: "blacksmith",
    requiredArtisanLevel: 3,
    artisanXp: 24,
    note: "전열 중급 무기",
  },
  mithril_sword: {
    id: "mithril_sword",
    equipmentId: "v2_mithril_sword",
    cost: { crop: 60, ore: 120 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    artisanXp: 46,
    note: "전열 상급 무기",
  },
  wooden_bow: {
    id: "wooden_bow",
    equipmentId: "v2_wooden_bow",
    cost: { crop: 8, ore: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 1,
    artisanXp: 10,
    note: "원거리 기본 무기",
  },
  horn_bow: {
    id: "horn_bow",
    equipmentId: "v2_horn_bow",
    cost: { crop: 34, ore: 12 },
    profession: "blacksmith",
    requiredArtisanLevel: 3,
    artisanXp: 22,
    note: "원거리 중급 무기",
  },
  starsong_bow: {
    id: "starsong_bow",
    equipmentId: "v2_starsong_bow",
    cost: { crop: 120, ore: 45 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    artisanXp: 44,
    note: "원거리 상급 무기",
  },
  oak_staff: {
    id: "oak_staff",
    equipmentId: "v2_oak_staff",
    cost: { crop: 10, ore: 1 },
    profession: "blacksmith",
    requiredArtisanLevel: 1,
    artisanXp: 10,
    note: "마법 기본 무기",
  },
  obsidian_staff: {
    id: "obsidian_staff",
    equipmentId: "v2_obsidian_staff",
    cost: { crop: 38, ore: 10 },
    profession: "blacksmith",
    requiredArtisanLevel: 3,
    artisanXp: 22,
    note: "마법 중급 무기",
  },
  starlit_staff: {
    id: "starlit_staff",
    equipmentId: "v2_starlit_staff",
    cost: { crop: 130, ore: 38 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    artisanXp: 44,
    note: "마법 상급 무기",
  },
  chain_mail: {
    id: "chain_mail",
    equipmentId: "v2_chain_mail",
    cost: { crop: 2, ore: 10 },
    profession: "blacksmith",
    requiredArtisanLevel: 1,
    artisanXp: 14,
    note: "중갑 기본 방어구",
  },
  full_plate: {
    id: "full_plate",
    equipmentId: "v2_full_plate",
    cost: { crop: 12, ore: 42 },
    profession: "blacksmith",
    requiredArtisanLevel: 3,
    artisanXp: 26,
    note: "중갑 중급 방어구",
  },
  mithril_plate: {
    id: "mithril_plate",
    equipmentId: "v2_mithril_plate",
    cost: { crop: 42, ore: 150 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    artisanXp: 52,
    note: "중갑 상급 방어구",
  },
  leather_armor: {
    id: "leather_armor",
    equipmentId: "v2_leather_armor",
    cost: { crop: 7, ore: 3 },
    profession: "blacksmith",
    requiredArtisanLevel: 1,
    artisanXp: 10,
    note: "경갑 기본 방어구",
  },
  shadow_cloak: {
    id: "shadow_cloak",
    equipmentId: "v2_shadow_cloak",
    cost: { crop: 34, ore: 16 },
    profession: "blacksmith",
    requiredArtisanLevel: 3,
    artisanXp: 24,
    note: "경갑 중급 방어구",
  },
  windweave_cloak: {
    id: "windweave_cloak",
    equipmentId: "v2_windweave_cloak",
    cost: { crop: 120, ore: 54 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    artisanXp: 48,
    note: "경갑 상급 방어구",
  },
  leather_gloves: {
    id: "leather_gloves",
    equipmentId: "v2_leather_gloves",
    cost: { crop: 6, ore: 4 },
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    artisanXp: 11,
    note: "치명 보조 장갑",
  },
  shadow_gloves: {
    id: "shadow_gloves",
    equipmentId: "v2_shadow_gloves",
    cost: { crop: 28, ore: 20 },
    profession: "blacksmith",
    requiredArtisanLevel: 4,
    artisanXp: 24,
    note: "치명 중급 장갑",
  },
  windweave_gloves: {
    id: "windweave_gloves",
    equipmentId: "v2_windweave_gloves",
    cost: { crop: 95, ore: 80 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    artisanXp: 42,
    note: "치명 상급 장갑",
  },
  leather_boots: {
    id: "leather_boots",
    equipmentId: "v2_leather_boots",
    cost: { crop: 6, ore: 4 },
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    artisanXp: 11,
    note: "회피 보조 신발",
  },
  shadow_boots: {
    id: "shadow_boots",
    equipmentId: "v2_shadow_boots",
    cost: { crop: 28, ore: 20 },
    profession: "blacksmith",
    requiredArtisanLevel: 4,
    artisanXp: 24,
    note: "회피 중급 신발",
  },
  windweave_boots: {
    id: "windweave_boots",
    equipmentId: "v2_windweave_boots",
    cost: { crop: 95, ore: 80 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    artisanXp: 42,
    note: "회피 상급 신발",
  },
  silver_ring: {
    id: "silver_ring",
    equipmentId: "v2_silver_ring",
    cost: { crop: 2, ore: 12 },
    profession: "blacksmith",
    requiredArtisanLevel: 3,
    artisanXp: 16,
    note: "치명 장신구",
  },
  lucky_charm: {
    id: "lucky_charm",
    equipmentId: "v2_lucky_charm",
    cost: { crop: 18, ore: 48 },
    profession: "blacksmith",
    requiredArtisanLevel: 4,
    artisanXp: 28,
    note: "치명 중급 반지",
  },
  fate_ring: {
    id: "fate_ring",
    equipmentId: "v2_fate_ring",
    cost: { crop: 58, ore: 150 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    artisanXp: 50,
    note: "치명 상급 반지",
  },
  jade_amulet: {
    id: "jade_amulet",
    equipmentId: "v2_jade_amulet",
    cost: { crop: 16, ore: 36 },
    profession: "blacksmith",
    requiredArtisanLevel: 4,
    artisanXp: 26,
    note: "마나 기본 목걸이",
  },
  crystal_amulet: {
    id: "crystal_amulet",
    equipmentId: "v2_crystal_amulet",
    cost: { crop: 42, ore: 85 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    artisanXp: 42,
    note: "마나 중급 목걸이",
  },
  mana_essence: {
    id: "mana_essence",
    equipmentId: "v2_mana_essence",
    cost: { crop: 85, ore: 165 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    artisanXp: 54,
    note: "마나 상급 목걸이",
  },
  crafted_oathblade: {
    id: "crafted_oathblade",
    equipmentId: "v2_crafted_oathblade",
    cost: { crop: 180, ore: 260 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 6,
    requiredSmithyLevel: 2,
    artisanXp: 70,
    note: "제작 전용 장검",
  },
  crafted_gale_bow: {
    id: "crafted_gale_bow",
    equipmentId: "v2_crafted_gale_bow",
    cost: { crop: 260, ore: 150 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 1 },
    profession: "blacksmith",
    requiredArtisanLevel: 6,
    requiredSmithyLevel: 2,
    artisanXp: 68,
    note: "제작 전용 활",
  },
  crafted_runic_staff: {
    id: "crafted_runic_staff",
    equipmentId: "v2_crafted_runic_staff",
    cost: { crop: 240, ore: 170 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 1 },
    profession: "blacksmith",
    requiredArtisanLevel: 6,
    requiredSmithyLevel: 2,
    artisanXp: 68,
    note: "제작 전용 지팡이",
  },
  crafted_master_ring: {
    id: "crafted_master_ring",
    equipmentId: "v2_crafted_master_ring",
    cost: { crop: 160, ore: 310 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 7,
    requiredSmithyLevel: 3,
    artisanXp: 82,
    note: "제작 전용 반지",
  },
  crafted_ward_plate: {
    id: "crafted_ward_plate",
    equipmentId: "v2_crafted_ward_plate",
    cost: { crop: 160, ore: 320 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 3 },
    profession: "blacksmith",
    requiredArtisanLevel: 7,
    requiredSmithyLevel: 3,
    artisanXp: 86,
    note: "제작 전용 갑주",
  },
  crafted_spark_gloves: {
    id: "crafted_spark_gloves",
    equipmentId: "v2_crafted_spark_gloves",
    cost: { crop: 210, ore: 190 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 1 },
    profession: "blacksmith",
    requiredArtisanLevel: 6,
    requiredSmithyLevel: 2,
    artisanXp: 66,
    note: "제작 전용 장갑",
  },
  crafted_windstep_boots: {
    id: "crafted_windstep_boots",
    equipmentId: "v2_crafted_windstep_boots",
    cost: { crop: 240, ore: 150 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 1 },
    profession: "blacksmith",
    requiredArtisanLevel: 6,
    requiredSmithyLevel: 2,
    artisanXp: 66,
    note: "제작 전용 장화",
  },
  crafted_aether_necklace: {
    id: "crafted_aether_necklace",
    equipmentId: "v2_crafted_aether_necklace",
    cost: { crop: 180, ore: 280 },
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 7,
    requiredSmithyLevel: 3,
    artisanXp: 84,
    note: "제작 전용 목걸이",
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
    note: "Lv4 대장간 전용 장검",
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
    note: "Lv5 대장간 전용 장신구",
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
    note: "Lv5 대장간 전용 방패",
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
    note: "Lv5 대장간 전용 창",
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
    note: "Lv5 대장간 전용 도끼",
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
    note: "Lv5 대장간 전용 마도서",
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
    return Math.min(
      GUILD_WORKSHOP_MASTERWORK_QUALITY_CAP_PCT,
      basePct + GUILD_WORKSHOP_MASTERWORK_QUALITY_BONUS_PCT,
    );
  }
  return Math.min(GUILD_WORKSHOP_NORMAL_QUALITY_CAP_PCT, basePct);
}

export function rollGuildWorkshopEnhance(
  artisan: ArtisanState,
  recipe: GuildWorkshopRecipe,
  rng: () => number,
  guildBonus: GuildWorkshopBonus | number = 0,
  mode: GuildWorkshopCraftMode = "normal",
): V2EnhanceState | undefined {
  const chancePct = guildWorkshopQualityChancePct(
    artisan,
    recipe,
    guildBonus,
    mode,
  );
  if (rng() * 100 >= chancePct) return undefined;
  const level = artisanLevel(artisan[recipe.profession]);
  if (mode === "masterwork" && level >= BLACKSMITH_PLUS2_QUALITY_LEVEL) {
    if (rng() * 100 < GUILD_WORKSHOP_MASTERWORK_PLUS2_CHANCE_PCT) {
      return { level: 2, bonusPct: GUILD_WORKSHOP_QUALITY_BONUS_PCT[2] };
    }
  }
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
