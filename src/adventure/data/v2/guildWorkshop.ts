import {
  type ProductionKind,
  type SettlementResources,
} from "./settlement";
import {
  V2_EQUIPMENT,
  type V2CraftQualityState,
  type V2EquipInstance,
  type V2EquipSlot,
  type V2Equipment,
  type V2EquipmentId,
  type V2EquipDisplayTier,
  v2EquipCatalogTierToDisplayTier,
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
  GUILD_WORKSHOP_MATERIAL_IDS,
  GUILD_WORKSHOP_MATERIAL_SUBSTITUTE,
  GUILD_WORKSHOP_MATERIAL_SUBSTITUTE_GOLD,
  type GuildWorkshopMaterialId,
} from "./guildWorkshopMaterials";
import { SETTLEMENT_MATERIALS } from "./settlementMaterials";
import {
  WOODCUTTING_MATERIAL_ID,
  WOODCUTTING_MATERIALS,
  type WoodcuttingMaterialId,
} from "./woodcuttingSpots";
import {
  MINING_MATERIAL_ID,
  MINING_MATERIALS,
  type MiningMaterialId,
} from "./miningSpots";
import {
  MONSTER_CRAFT_MATERIAL_ID,
  MONSTER_CRAFT_MATERIALS,
} from "./monsterCraftMaterials";
import {
  COOP_BOSS_MATERIAL_ID,
  COOP_REWARD_MATERIALS,
} from "./coopRewards";
import {
  STORM_EXPEDITION_MATERIALS,
  STORM_EXPEDITION_ROUTE_MATERIAL_ID,
} from "./stormExpeditionRewards";
import type { StormExpeditionRouteId } from "./stormExpedition";

// 활동 내역은 화면에 보이는 티어 기준으로 제한한다(표시 4T = 내부 카탈로그 10~12단계).
export const GUILD_WORKSHOP_ACTIVITY_MIN_DISPLAY_TIER = 4;

export function shouldLogGuildWorkshopCraftActivity(
  item: Pick<V2Equipment, "craftOnly" | "tier">,
): boolean {
  return (
    (item.craftOnly === true || item.tier >= 16) &&
    v2EquipCatalogTierToDisplayTier(item.tier) >=
      GUILD_WORKSHOP_ACTIVITY_MIN_DISPLAY_TIER
  );
}

export type GuildWorkshopRecipeId =
  | "crafted_oathblade"
  | "crafted_gale_bow"
  | "crafted_runic_staff"
  | "crafted_guard_gauntlets"
  | "crafted_guard_greaves"
  | "crafted_fury_boots"
  | "crafted_pursuit_grips"
  | "crafted_focus_gloves"
  | "crafted_focus_boots"
  | "crafted_combo_bow"
  | "crafted_combo_gloves"
  | "crafted_combo_boots"
  | "crafted_corrosion_dagger"
  | "crafted_corrosion_gloves"
  | "crafted_corrosion_boots"
  | "crafted_master_ring"
  | "crafted_ward_plate"
  | "crafted_spark_gloves"
  | "crafted_windstep_boots"
  | "crafted_aether_necklace"
  | "crafted_guard_ring"
  | "crafted_fury_plate"
  | "crafted_pursuit_coat"
  | "crafted_pursuit_ring"
  | "crafted_focus_ring"
  | "crafted_combo_coat"
  | "crafted_combo_ring"
  | "crafted_corrosion_armor"
  | "crafted_corrosion_ring"
  | "crafted_venom_gland_dagger"
  | "crafted_scorpion_king_stinger"
  | "crafted_pulsestone_guard"
  | "crafted_thundercoil_gloves"
  | "crafted_veinbreaker_bow"
  | "crafted_luminous_aegis_necklace"
  | "crafted_toxic_mist_gloves"
  | "crafted_voidstep_boots"
  | "crafted_fury_necklace"
  | "crafted_pursuit_necklace"
  | "crafted_focus_robe"
  | "crafted_combo_necklace"
  | "crafted_corrosion_necklace"
  | "crafted_sunforge_blade"
  | "crafted_aurora_crown"
  | "crafted_bulwark_shield"
  | "crafted_stormlance"
  | "crafted_kingbreaker_axe"
  | "crafted_astral_grimoire"
  | "crafted_fracture_blade"
  | "crafted_thunder_oracle_grimoire"
  | "crafted_trench_hymn_necklace"
  | "crafted_immovable_bulwark"
  | "crafted_guillotine_greatsword"
  | "crafted_overdrive_bow"
  | "crafted_abyss_mana_core"
  | "crafted_voidveil_robe"
  | "crafted_monopoly_gloves"
  | "crafted_thousand_league_boots"
  | "crafted_one_eye_oath"
  | "crafted_stilled_chalice"
  | "crafted_venom_injector"
  | "crafted_blood_debt_greatsword"
  | "crafted_thunder_lock_bow"
  | "crafted_white_night_grimoire"
  | "crafted_first_dawn_shield"
  | "crafted_berserker_husk"
  | "crafted_oblivion_ring"
  | "crafted_painless_relic"
  | "storm_wreckage_greatsword"
  | "storm_gale_bow"
  | "storm_gale_dagger"
  | "storm_thunder_staff"
  | "storm_breaker_greatsword"
  | "storm_venom_dagger"
  | "storm_sanctuary_staff";

export type GuildWorkshopRecipe = {
  id: GuildWorkshopRecipeId;
  equipmentId: V2EquipmentId;
  resourceProfile: GuildWorkshopResourceProfile;
  cost: Partial<Record<ProductionKind, number>>;
  materialCost?: Partial<Record<GuildWorkshopMaterialId, number>>;
  /** 보스·일반 몬스터 등 특정 콘텐츠에서 얻는 테마 제작 재료. */
  specialMaterialCost?: Partial<Record<string, number>>;
  /** 개량 제작에 1개 소모하는 하위 장비. 명장 제작에서도 수량은 늘지 않는다. */
  baseEquipmentId?: V2EquipmentId;
  profession: ArtisanProfessionId;
  requiredArtisanLevel: number;
  requiredSmithyLevel?: number;
  artisanXp: number;
  note: string;
};

export type GuildWorkshopResourceProfile =
  | "guard"
  | "fury"
  | "pursuit"
  | "focus"
  | "combo"
  | "corrosion";

export const GUILD_WORKSHOP_RESOURCE_TOTAL_BY_TIER = {
  4: 100,
  6: 140,
  8: 210,
  10: 270,
  11: 330,
  12: 360,
  13: 450,
  16: 480,
} as const;

export type GuildWorkshopResourceTier =
  keyof typeof GUILD_WORKSHOP_RESOURCE_TOTAL_BY_TIER;

export const GUILD_WORKSHOP_WOOD_SHARE_PCT_BY_PROFILE: Record<
  GuildWorkshopResourceProfile,
  number
> = {
  guard: 40,
  fury: 45,
  pursuit: 60,
  focus: 55,
  combo: 65,
  corrosion: 50,
};

export function guildWorkshopResourceCostForTier(
  tier: GuildWorkshopResourceTier,
  profile: GuildWorkshopResourceProfile,
): Partial<Record<ProductionKind, number>> {
  const total = GUILD_WORKSHOP_RESOURCE_TOTAL_BY_TIER[tier];
  const woodSharePct = GUILD_WORKSHOP_WOOD_SHARE_PCT_BY_PROFILE[profile];
  const wood = Math.round((total * woodSharePct) / 500) * 5;
  return { crop: wood, ore: total - wood };
}

export function guildWorkshopWoodMaterialForTier(
  tierRaw: number,
): WoodcuttingMaterialId {
  const tier = Math.max(1, Math.floor(Number(tierRaw) || 1));
  if (tier >= 12) return WOODCUTTING_MATERIAL_ID.cypress;
  if (tier >= 11) return WOODCUTTING_MATERIAL_ID.cedar;
  if (tier >= 10) return WOODCUTTING_MATERIAL_ID.oak;
  if (tier >= 8) return WOODCUTTING_MATERIAL_ID.willow;
  if (tier >= 6) return WOODCUTTING_MATERIAL_ID.birch;
  return WOODCUTTING_MATERIAL_ID.pine;
}

export function guildWorkshopMiningMaterialForTier(
  tierRaw: number,
): MiningMaterialId {
  const tier = Math.max(1, Math.floor(Number(tierRaw) || 1));
  if (tier >= 12) return MINING_MATERIAL_ID.adamantite;
  if (tier >= 11) return MINING_MATERIAL_ID.mythril;
  if (tier >= 10) return MINING_MATERIAL_ID.gold;
  if (tier >= 8) return MINING_MATERIAL_ID.silver;
  if (tier >= 6) return MINING_MATERIAL_ID.copper;
  return MINING_MATERIAL_ID.iron;
}

export type GuildWorkshopStats = {
  totalCrafts: number;
  qualityCrafts: number;
  craftedByRecipe: Partial<Record<GuildWorkshopRecipeId, number>>;
};

export type GuildWorkshopRecipeRecord = {
  crafts: number;
  bestQualityLevel: number;
  masterworkCrafts: number;
  lastCraftedAt?: string;
};

export type GuildWorkshopSlotRecord = {
  crafts: number;
  bestQualityLevel: number;
  masterworkCrafts: number;
  highestTier: number;
};

export type GuildWorkshopCraftRecords = {
  totalCrafts: number;
  qualityCrafts: number;
  masterworkCrafts: number;
  craftOnlyCrafts: number;
  craftOnlySlots: Partial<Record<V2EquipSlot, number>>;
  highestTier: number;
  bestQualityLevel: number;
  recipes: Partial<Record<GuildWorkshopRecipeId, GuildWorkshopRecipeRecord>>;
  slots: Partial<Record<V2EquipSlot, GuildWorkshopSlotRecord>>;
};

export type GuildWorkshopCraftRecordEvent = {
  recipeId: GuildWorkshopRecipeId;
  item: Pick<V2Equipment, "slot" | "tier" | "craftOnly">;
  craftQualityLevel?: number;
  masterwork?: boolean;
  craftedAt?: string;
};

export const BLACKSMITH_CRAFT_RECORD_TITLE_THRESHOLDS = {
  doubleStarQuality: 1,
  masterworkCrafts: 10,
  highTier: 10,
  craftOnlySlotCount: 6,
} as const;

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
export const GUILD_WORKSHOP_MASTERWORK_PLUS2_CHANCE_PCT = 25;
export const GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT = 2;
export const GUILD_WORKSHOP_MASTERWORK_MATERIAL_COST_MULT = 2;
export const GUILD_WORKSHOP_MASTERWORK_GOLD_COST_MULT = 2;
export const GUILD_WORKSHOP_DISMANTLE_MAX_MATERIALS = 3;
export const GUILD_WORKSHOP_DISMANTLE_MATERIAL_RECOVERY_PCT = 50;
export const GUILD_WORKSHOP_DISMANTLE_MAX_ARTISAN_XP = 3;
export const STORM_EQUIPMENT_DISMANTLE_ROUTE_RECOVERY_PCT = 25;

/** 화면 표시 티어 기준 개인 제작 수수료. 재료 병목보다 가볍게, 반복 제작에서만 누적되도록 둔다. */
export const GUILD_WORKSHOP_GOLD_COST_BY_DISPLAY_TIER: Record<
  V2EquipDisplayTier,
  number
> = {
  1: 5_000,
  2: 10_000,
  3: 25_000,
  4: 60_000,
  5: 150_000,
  6: 300_000,
};

export function guildWorkshopCraftGoldCostForTier(
  tier: V2Equipment["tier"],
  mode: GuildWorkshopCraftMode = "normal",
): number {
  const displayTier = v2EquipCatalogTierToDisplayTier(tier);
  const base = GUILD_WORKSHOP_GOLD_COST_BY_DISPLAY_TIER[displayTier];
  return (
    base *
    (mode === "masterwork" ? GUILD_WORKSHOP_MASTERWORK_GOLD_COST_MULT : 1)
  );
}

export function guildWorkshopRecipeGoldCost(
  recipe: GuildWorkshopRecipe,
  mode: GuildWorkshopCraftMode = "normal",
): number {
  return guildWorkshopCraftGoldCostForTier(
    V2_EQUIPMENT[recipe.equipmentId].tier,
    mode,
  );
}

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

function stormExpeditionRecipe(
  id: GuildWorkshopRecipeId,
  equipmentId: V2EquipmentId,
  routeId: StormExpeditionRouteId,
  resourceProfile: GuildWorkshopResourceProfile,
  routeMaterialCount: number,
  note: string,
): GuildWorkshopRecipe {
  return {
    id,
    equipmentId,
    resourceProfile,
    cost: guildWorkshopResourceCostForTier(16, resourceProfile),
    materialCost: {
      [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 4,
      [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 4,
    },
    specialMaterialCost: {
      [STORM_EXPEDITION_ROUTE_MATERIAL_ID[routeId]]: routeMaterialCount,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 12,
    requiredSmithyLevel: 5,
    artisanXp: 280,
    note,
  };
}

function keycard5tRecipe(
  id: GuildWorkshopRecipeId,
  equipmentId: V2EquipmentId,
  resourceProfile: GuildWorkshopResourceProfile,
  specialMaterialId: string,
  note: string,
): GuildWorkshopRecipe {
  return {
    id,
    equipmentId,
    resourceProfile,
    cost: guildWorkshopResourceCostForTier(13, resourceProfile),
    materialCost: {
      [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 6,
      [GUILD_WORKSHOP_MATERIAL_ID.abyssalStarsteel]: 4,
    },
    specialMaterialCost: { [specialMaterialId]: 12 },
    profession: "blacksmith",
    requiredArtisanLevel: 12,
    requiredSmithyLevel: 5,
    artisanXp: 280,
    note: `5T 키카드 · ${note}`,
  };
}

export const GUILD_WORKSHOP_RECIPES: Record<
  GuildWorkshopRecipeId,
  GuildWorkshopRecipe
> = {
  crafted_oathblade: {
    id: "crafted_oathblade",
    equipmentId: "v2_crafted_oathblade",
    resourceProfile: "guard",
    cost: guildWorkshopResourceCostForTier(4, "guard"),
    profession: "blacksmith",
    requiredArtisanLevel: 1,
    requiredSmithyLevel: 1,
    artisanXp: 36,
    note: "수호 세트 무기",
  },
  crafted_gale_bow: {
    id: "crafted_gale_bow",
    equipmentId: "v2_crafted_gale_bow",
    resourceProfile: "pursuit",
    cost: guildWorkshopResourceCostForTier(4, "pursuit"),
    profession: "blacksmith",
    requiredArtisanLevel: 1,
    requiredSmithyLevel: 1,
    artisanXp: 34,
    note: "질풍 세트 무기",
  },
  crafted_runic_staff: {
    id: "crafted_runic_staff",
    equipmentId: "v2_crafted_runic_staff",
    resourceProfile: "focus",
    cost: guildWorkshopResourceCostForTier(4, "focus"),
    profession: "blacksmith",
    requiredArtisanLevel: 1,
    requiredSmithyLevel: 1,
    artisanXp: 34,
    note: "룬 세트 무기",
  },
  crafted_guard_gauntlets: {
    id: "crafted_guard_gauntlets",
    equipmentId: "v2_crafted_guard_gauntlets",
    resourceProfile: "guard",
    cost: guildWorkshopResourceCostForTier(4, "guard"),
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    requiredSmithyLevel: 1,
    artisanXp: 38,
    note: "수호 세트 장갑",
  },
  crafted_guard_greaves: {
    id: "crafted_guard_greaves",
    equipmentId: "v2_crafted_guard_greaves",
    resourceProfile: "guard",
    cost: guildWorkshopResourceCostForTier(4, "guard"),
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    requiredSmithyLevel: 1,
    artisanXp: 38,
    note: "수호 세트 장화",
  },
  crafted_fury_boots: {
    id: "crafted_fury_boots",
    equipmentId: "v2_crafted_fury_boots",
    resourceProfile: "fury",
    cost: guildWorkshopResourceCostForTier(4, "fury"),
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    requiredSmithyLevel: 1,
    artisanXp: 38,
    note: "격노 세트 장화",
  },
  crafted_pursuit_grips: {
    id: "crafted_pursuit_grips",
    equipmentId: "v2_crafted_pursuit_grips",
    resourceProfile: "pursuit",
    cost: guildWorkshopResourceCostForTier(4, "pursuit"),
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    requiredSmithyLevel: 1,
    artisanXp: 38,
    note: "질풍 세트 장갑",
  },
  crafted_focus_gloves: {
    id: "crafted_focus_gloves",
    equipmentId: "v2_crafted_focus_gloves",
    resourceProfile: "focus",
    cost: guildWorkshopResourceCostForTier(4, "focus"),
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    requiredSmithyLevel: 1,
    artisanXp: 38,
    note: "룬 세트 장갑",
  },
  crafted_focus_boots: {
    id: "crafted_focus_boots",
    equipmentId: "v2_crafted_focus_boots",
    resourceProfile: "focus",
    cost: guildWorkshopResourceCostForTier(4, "focus"),
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    requiredSmithyLevel: 1,
    artisanXp: 38,
    note: "룬 세트 장화",
  },
  crafted_combo_bow: {
    id: "crafted_combo_bow",
    equipmentId: "v2_crafted_combo_bow",
    resourceProfile: "combo",
    cost: guildWorkshopResourceCostForTier(4, "combo"),
    profession: "blacksmith",
    requiredArtisanLevel: 1,
    requiredSmithyLevel: 1,
    artisanXp: 34,
    note: "연격 세트 무기",
  },
  crafted_combo_gloves: {
    id: "crafted_combo_gloves",
    equipmentId: "v2_crafted_combo_gloves",
    resourceProfile: "combo",
    cost: guildWorkshopResourceCostForTier(4, "combo"),
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    requiredSmithyLevel: 1,
    artisanXp: 38,
    note: "연격 세트 장갑",
  },
  crafted_combo_boots: {
    id: "crafted_combo_boots",
    equipmentId: "v2_crafted_combo_boots",
    resourceProfile: "combo",
    cost: guildWorkshopResourceCostForTier(4, "combo"),
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    requiredSmithyLevel: 1,
    artisanXp: 38,
    note: "연격 세트 장화",
  },
  crafted_corrosion_dagger: {
    id: "crafted_corrosion_dagger",
    equipmentId: "v2_crafted_corrosion_dagger",
    resourceProfile: "corrosion",
    cost: guildWorkshopResourceCostForTier(4, "corrosion"),
    profession: "blacksmith",
    requiredArtisanLevel: 1,
    requiredSmithyLevel: 1,
    artisanXp: 34,
    note: "부식 세트 무기",
  },
  crafted_corrosion_gloves: {
    id: "crafted_corrosion_gloves",
    equipmentId: "v2_crafted_corrosion_gloves",
    resourceProfile: "corrosion",
    cost: guildWorkshopResourceCostForTier(4, "corrosion"),
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    requiredSmithyLevel: 1,
    artisanXp: 38,
    note: "부식 세트 장갑",
  },
  crafted_corrosion_boots: {
    id: "crafted_corrosion_boots",
    equipmentId: "v2_crafted_corrosion_boots",
    resourceProfile: "corrosion",
    cost: guildWorkshopResourceCostForTier(4, "corrosion"),
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    requiredSmithyLevel: 1,
    artisanXp: 38,
    note: "부식 세트 장화",
  },
  crafted_master_ring: {
    id: "crafted_master_ring",
    equipmentId: "v2_crafted_master_ring",
    resourceProfile: "fury",
    cost: guildWorkshopResourceCostForTier(6, "fury"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 7,
    requiredSmithyLevel: 2,
    artisanXp: 66,
    note: "격노 세트 반지",
  },
  crafted_ward_plate: {
    id: "crafted_ward_plate",
    equipmentId: "v2_crafted_ward_plate",
    resourceProfile: "guard",
    cost: guildWorkshopResourceCostForTier(6, "guard"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    requiredSmithyLevel: 2,
    artisanXp: 68,
    note: "수호 세트 갑옷",
  },
  crafted_spark_gloves: {
    id: "crafted_spark_gloves",
    equipmentId: "v2_crafted_spark_gloves",
    resourceProfile: "fury",
    cost: guildWorkshopResourceCostForTier(4, "fury"),
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    requiredSmithyLevel: 1,
    artisanXp: 38,
    note: "격노 세트 장갑",
  },
  crafted_windstep_boots: {
    id: "crafted_windstep_boots",
    equipmentId: "v2_crafted_windstep_boots",
    resourceProfile: "pursuit",
    cost: guildWorkshopResourceCostForTier(4, "pursuit"),
    profession: "blacksmith",
    requiredArtisanLevel: 2,
    requiredSmithyLevel: 1,
    artisanXp: 38,
    note: "질풍 세트 장화",
  },
  crafted_aether_necklace: {
    id: "crafted_aether_necklace",
    equipmentId: "v2_crafted_aether_necklace",
    resourceProfile: "focus",
    cost: guildWorkshopResourceCostForTier(6, "focus"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    requiredSmithyLevel: 2,
    artisanXp: 66,
    note: "룬 세트 목걸이",
  },
  crafted_guard_ring: {
    id: "crafted_guard_ring",
    equipmentId: "v2_crafted_guard_ring",
    resourceProfile: "guard",
    cost: guildWorkshopResourceCostForTier(6, "guard"),
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
    resourceProfile: "fury",
    cost: guildWorkshopResourceCostForTier(6, "fury"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    requiredSmithyLevel: 2,
    artisanXp: 68,
    note: "격노 세트 갑옷",
  },
  crafted_pursuit_coat: {
    id: "crafted_pursuit_coat",
    equipmentId: "v2_crafted_pursuit_coat",
    resourceProfile: "pursuit",
    cost: guildWorkshopResourceCostForTier(6, "pursuit"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    requiredSmithyLevel: 2,
    artisanXp: 68,
    note: "질풍 세트 갑옷",
  },
  crafted_pursuit_ring: {
    id: "crafted_pursuit_ring",
    equipmentId: "v2_crafted_pursuit_ring",
    resourceProfile: "pursuit",
    cost: guildWorkshopResourceCostForTier(6, "pursuit"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 4,
    requiredSmithyLevel: 2,
    artisanXp: 58,
    note: "질풍 세트 반지",
  },
  crafted_focus_ring: {
    id: "crafted_focus_ring",
    equipmentId: "v2_crafted_focus_ring",
    resourceProfile: "focus",
    cost: guildWorkshopResourceCostForTier(6, "focus"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 4,
    requiredSmithyLevel: 2,
    artisanXp: 58,
    note: "룬 세트 반지",
  },
  crafted_combo_coat: {
    id: "crafted_combo_coat",
    equipmentId: "v2_crafted_combo_coat",
    resourceProfile: "combo",
    cost: guildWorkshopResourceCostForTier(6, "combo"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    requiredSmithyLevel: 2,
    artisanXp: 68,
    note: "연격 세트 갑옷",
  },
  crafted_combo_ring: {
    id: "crafted_combo_ring",
    equipmentId: "v2_crafted_combo_ring",
    resourceProfile: "combo",
    cost: guildWorkshopResourceCostForTier(6, "combo"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 4,
    requiredSmithyLevel: 2,
    artisanXp: 58,
    note: "연격 세트 반지",
  },
  crafted_corrosion_armor: {
    id: "crafted_corrosion_armor",
    equipmentId: "v2_crafted_corrosion_armor",
    resourceProfile: "corrosion",
    cost: guildWorkshopResourceCostForTier(6, "corrosion"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    requiredSmithyLevel: 2,
    artisanXp: 68,
    note: "부식 세트 갑옷",
  },
  crafted_corrosion_ring: {
    id: "crafted_corrosion_ring",
    equipmentId: "v2_crafted_corrosion_ring",
    resourceProfile: "corrosion",
    cost: guildWorkshopResourceCostForTier(6, "corrosion"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    profession: "blacksmith",
    requiredArtisanLevel: 4,
    requiredSmithyLevel: 2,
    artisanXp: 58,
    note: "부식 세트 반지",
  },
  crafted_venom_gland_dagger: {
    id: "crafted_venom_gland_dagger",
    equipmentId: "v2_crafted_venom_gland_dagger",
    resourceProfile: "pursuit",
    cost: guildWorkshopResourceCostForTier(6, "pursuit"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    specialMaterialCost: {
      [MONSTER_CRAFT_MATERIAL_ID.caveSpiderVenomGland]: 12,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 5,
    requiredSmithyLevel: 2,
    artisanXp: 75,
    note: "몬스터 소재 특수 장비 · 적중 시 중독",
  },
  crafted_scorpion_king_stinger: {
    id: "crafted_scorpion_king_stinger",
    equipmentId: "v2_boss_canyon_fang",
    baseEquipmentId: "v2_crafted_venom_gland_dagger",
    resourceProfile: "pursuit",
    cost: guildWorkshopResourceCostForTier(6, "pursuit"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    specialMaterialCost: {
      [COOP_BOSS_MATERIAL_ID.canyon_predator]: 8,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 6,
    requiredSmithyLevel: 2,
    artisanXp: 90,
    note: "보스 소재 개량 · 독샘 단검의 강화·품질·개체 옵션 미승계",
  },
  crafted_pulsestone_guard: {
    id: "crafted_pulsestone_guard",
    equipmentId: "v2_crafted_pulsestone_guard",
    resourceProfile: "guard",
    cost: guildWorkshopResourceCostForTier(6, "guard"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    specialMaterialCost: {
      [MONSTER_CRAFT_MATERIAL_ID.rockGolemResonantCore]: 12,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 6,
    requiredSmithyLevel: 2,
    artisanXp: 90,
    note: "몬스터 소재 특수 장비 · 피격 시 방어력 누적",
  },
  crafted_thundercoil_gloves: {
    id: "crafted_thundercoil_gloves",
    equipmentId: "v2_crafted_thundercoil_gloves",
    resourceProfile: "fury",
    cost: guildWorkshopResourceCostForTier(6, "fury"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    specialMaterialCost: {
      [MONSTER_CRAFT_MATERIAL_ID.sparkScorpionConductiveSac]: 12,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 6,
    requiredSmithyLevel: 2,
    artisanXp: 90,
    note: "몬스터 소재 특수 장비 · 적중 시 감전",
  },
  crafted_veinbreaker_bow: {
    id: "crafted_veinbreaker_bow",
    equipmentId: "v2_crafted_veinbreaker_bow",
    resourceProfile: "pursuit",
    cost: guildWorkshopResourceCostForTier(6, "pursuit"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
    specialMaterialCost: {
      [MONSTER_CRAFT_MATERIAL_ID.abyssWormBurrowingJaw]: 12,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 6,
    requiredSmithyLevel: 2,
    artisanXp: 90,
    note: "몬스터 소재 특수 장비 · 치명타 시 대상 방어력 감소",
  },
  crafted_luminous_aegis_necklace: {
    id: "crafted_luminous_aegis_necklace",
    equipmentId: "v2_crafted_luminous_aegis_necklace",
    resourceProfile: "focus",
    cost: guildWorkshopResourceCostForTier(8, "focus"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 3 },
    specialMaterialCost: {
      [MONSTER_CRAFT_MATERIAL_ID.starlightGatekeeperLuminousCore]: 12,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 7,
    requiredSmithyLevel: 3,
    artisanXp: 108,
    note: "몬스터 소재 특수 장비 · 회복량 일부를 보호막으로 전환",
  },
  crafted_toxic_mist_gloves: {
    id: "crafted_toxic_mist_gloves",
    equipmentId: "v2_crafted_toxic_mist_gloves",
    resourceProfile: "corrosion",
    cost: guildWorkshopResourceCostForTier(8, "corrosion"),
    materialCost: {
      [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 2,
      [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 1,
    },
    specialMaterialCost: {
      [MONSTER_CRAFT_MATERIAL_ID.poisonMistSpiritToxicCore]: 12,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 7,
    requiredSmithyLevel: 3,
    artisanXp: 112,
    note: "몬스터 소재 특수 장비 · 적중 시 중독",
  },
  crafted_voidstep_boots: {
    id: "crafted_voidstep_boots",
    equipmentId: "v2_crafted_voidstep_boots",
    resourceProfile: "pursuit",
    cost: guildWorkshopResourceCostForTier(8, "pursuit"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 4 },
    specialMaterialCost: {
      [MONSTER_CRAFT_MATERIAL_ID.voidBeastShadowClaw]: 12,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 8,
    requiredSmithyLevel: 4,
    artisanXp: 120,
    note: "몬스터 소재 특수 장비 · 회피 시 속도 상승",
  },
  crafted_fury_necklace: {
    id: "crafted_fury_necklace",
    equipmentId: "v2_crafted_fury_necklace",
    resourceProfile: "fury",
    cost: guildWorkshopResourceCostForTier(8, "fury"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 3 },
    profession: "blacksmith",
    requiredArtisanLevel: 6,
    requiredSmithyLevel: 3,
    artisanXp: 92,
    note: "격노 세트 목걸이",
  },
  crafted_pursuit_necklace: {
    id: "crafted_pursuit_necklace",
    equipmentId: "v2_crafted_pursuit_necklace",
    resourceProfile: "pursuit",
    cost: guildWorkshopResourceCostForTier(8, "pursuit"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 3 },
    profession: "blacksmith",
    requiredArtisanLevel: 6,
    requiredSmithyLevel: 3,
    artisanXp: 92,
    note: "질풍 세트 목걸이",
  },
  crafted_focus_robe: {
    id: "crafted_focus_robe",
    equipmentId: "v2_crafted_focus_robe",
    resourceProfile: "focus",
    cost: guildWorkshopResourceCostForTier(8, "focus"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 3 },
    profession: "blacksmith",
    requiredArtisanLevel: 6,
    requiredSmithyLevel: 3,
    artisanXp: 92,
    note: "룬 세트 갑옷",
  },
  crafted_combo_necklace: {
    id: "crafted_combo_necklace",
    equipmentId: "v2_crafted_combo_necklace",
    resourceProfile: "combo",
    cost: guildWorkshopResourceCostForTier(8, "combo"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 3 },
    profession: "blacksmith",
    requiredArtisanLevel: 6,
    requiredSmithyLevel: 3,
    artisanXp: 92,
    note: "연격 세트 목걸이",
  },
  crafted_corrosion_necklace: {
    id: "crafted_corrosion_necklace",
    equipmentId: "v2_crafted_corrosion_necklace",
    resourceProfile: "corrosion",
    cost: guildWorkshopResourceCostForTier(8, "corrosion"),
    materialCost: { [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 3 },
    profession: "blacksmith",
    requiredArtisanLevel: 6,
    requiredSmithyLevel: 3,
    artisanXp: 92,
    note: "부식 세트 목걸이",
  },
  crafted_sunforge_blade: {
    id: "crafted_sunforge_blade",
    equipmentId: "v2_crafted_sunforge_blade",
    resourceProfile: "fury",
    cost: guildWorkshopResourceCostForTier(8, "fury"),
    materialCost: {
      [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 2,
      [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 2,
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
    resourceProfile: "guard",
    cost: guildWorkshopResourceCostForTier(10, "guard"),
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
    resourceProfile: "guard",
    cost: guildWorkshopResourceCostForTier(11, "guard"),
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
    resourceProfile: "pursuit",
    cost: guildWorkshopResourceCostForTier(11, "pursuit"),
    materialCost: {
      [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 3,
      [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 3,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 10,
    requiredSmithyLevel: 5,
    artisanXp: 182,
    note: "질풍 세트 무기",
  },
  crafted_kingbreaker_axe: {
    id: "crafted_kingbreaker_axe",
    equipmentId: "v2_crafted_kingbreaker_axe",
    resourceProfile: "fury",
    cost: guildWorkshopResourceCostForTier(12, "fury"),
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
    resourceProfile: "focus",
    cost: guildWorkshopResourceCostForTier(12, "focus"),
    materialCost: {
      [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 4,
      [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 4,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 11,
    requiredSmithyLevel: 5,
    artisanXp: 215,
    note: "룬 세트 무기",
  },
  crafted_fracture_blade: {
    id: "crafted_fracture_blade",
    equipmentId: "v2_crafted_fracture_blade",
    resourceProfile: "fury",
    cost: guildWorkshopResourceCostForTier(12, "fury"),
    materialCost: {
      [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 3,
      [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 5,
    },
    specialMaterialCost: {
      [MONSTER_CRAFT_MATERIAL_ID.plateauSlayerSerratedBone]: 12,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 12,
    requiredSmithyLevel: 5,
    artisanXp: 240,
    note: "몬스터 소재 특수 장비 · 적중 시 출혈",
  },
  crafted_thunder_oracle_grimoire: {
    id: "crafted_thunder_oracle_grimoire",
    equipmentId: "v2_crafted_thunder_oracle_grimoire",
    resourceProfile: "focus",
    cost: guildWorkshopResourceCostForTier(12, "focus"),
    materialCost: {
      [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 4,
      [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 4,
    },
    specialMaterialCost: {
      [MONSTER_CRAFT_MATERIAL_ID.lightningOracleThunderRunestone]: 12,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 12,
    requiredSmithyLevel: 5,
    artisanXp: 245,
    note: "몬스터 소재 특수 장비 · 스킬 사용 시 MP 환급",
  },
  crafted_trench_hymn_necklace: {
    id: "crafted_trench_hymn_necklace",
    equipmentId: "v2_crafted_trench_hymn_necklace",
    resourceProfile: "focus",
    cost: guildWorkshopResourceCostForTier(12, "focus"),
    materialCost: {
      [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 4,
      [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 4,
    },
    specialMaterialCost: {
      [MONSTER_CRAFT_MATERIAL_ID.trenchApostlePrayerCore]: 12,
    },
    profession: "blacksmith",
    requiredArtisanLevel: 12,
    requiredSmithyLevel: 5,
    artisanXp: 235,
    note: "몬스터 소재 특수 장비 · 회복량 일부를 보호막으로 전환",
  },
  crafted_immovable_bulwark: keycard5tRecipe(
    "crafted_immovable_bulwark",
    "v2_crafted_immovable_bulwark",
    "guard",
    MONSTER_CRAFT_MATERIAL_ID.plateauSlayerSerratedBone,
    "극방어 방패",
  ),
  crafted_guillotine_greatsword: keycard5tRecipe(
    "crafted_guillotine_greatsword",
    "v2_crafted_guillotine_greatsword",
    "fury",
    MONSTER_CRAFT_MATERIAL_ID.plateauSlayerSerratedBone,
    "초고화력·저속 대검",
  ),
  crafted_overdrive_bow: keycard5tRecipe(
    "crafted_overdrive_bow",
    "v2_crafted_overdrive_bow",
    "combo",
    MONSTER_CRAFT_MATERIAL_ID.lightningOracleThunderRunestone,
    "초고속·저치명 연궁",
  ),
  crafted_abyss_mana_core: keycard5tRecipe(
    "crafted_abyss_mana_core",
    "v2_crafted_abyss_mana_core",
    "focus",
    MONSTER_CRAFT_MATERIAL_ID.trenchApostlePrayerCore,
    "마나 순환 지팡이",
  ),
  crafted_voidveil_robe: keycard5tRecipe(
    "crafted_voidveil_robe",
    "v2_crafted_voidveil_robe",
    "focus",
    MONSTER_CRAFT_MATERIAL_ID.trenchApostlePrayerCore,
    "극마법방어 예복",
  ),
  crafted_monopoly_gloves: keycard5tRecipe(
    "crafted_monopoly_gloves",
    "v2_crafted_monopoly_gloves",
    "pursuit",
    MONSTER_CRAFT_MATERIAL_ID.lightningOracleThunderRunestone,
    "치명·속도 장갑",
  ),
  crafted_thousand_league_boots: keycard5tRecipe(
    "crafted_thousand_league_boots",
    "v2_crafted_thousand_league_boots",
    "pursuit",
    MONSTER_CRAFT_MATERIAL_ID.lightningOracleThunderRunestone,
    "극속도 장화",
  ),
  crafted_one_eye_oath: keycard5tRecipe(
    "crafted_one_eye_oath",
    "v2_crafted_one_eye_oath",
    "fury",
    MONSTER_CRAFT_MATERIAL_ID.plateauSlayerSerratedBone,
    "치명 확률을 대가로 한 치명 피해 반지",
  ),
  crafted_stilled_chalice: keycard5tRecipe(
    "crafted_stilled_chalice",
    "v2_crafted_stilled_chalice",
    "focus",
    MONSTER_CRAFT_MATERIAL_ID.trenchApostlePrayerCore,
    "회복 보호막 목걸이",
  ),
  crafted_venom_injector: keycard5tRecipe(
    "crafted_venom_injector",
    "v2_crafted_venom_injector",
    "corrosion",
    MONSTER_CRAFT_MATERIAL_ID.poisonMistSpiritToxicCore,
    "중첩 맹독 단검",
  ),
  crafted_blood_debt_greatsword: keycard5tRecipe(
    "crafted_blood_debt_greatsword",
    "v2_crafted_blood_debt_greatsword",
    "fury",
    MONSTER_CRAFT_MATERIAL_ID.plateauSlayerSerratedBone,
    "중첩 출혈 대검",
  ),
  crafted_thunder_lock_bow: keycard5tRecipe(
    "crafted_thunder_lock_bow",
    "v2_crafted_thunder_lock_bow",
    "pursuit",
    MONSTER_CRAFT_MATERIAL_ID.lightningOracleThunderRunestone,
    "감전·둔화 대궁",
  ),
  crafted_white_night_grimoire: keycard5tRecipe(
    "crafted_white_night_grimoire",
    "v2_crafted_white_night_grimoire",
    "focus",
    MONSTER_CRAFT_MATERIAL_ID.trenchApostlePrayerCore,
    "초고화력·저속 마도서",
  ),
  crafted_first_dawn_shield: keycard5tRecipe(
    "crafted_first_dawn_shield",
    "v2_crafted_first_dawn_shield",
    "guard",
    MONSTER_CRAFT_MATERIAL_ID.plateauSlayerSerratedBone,
    "전투 개시 보호막 방패",
  ),
  crafted_berserker_husk: keycard5tRecipe(
    "crafted_berserker_husk",
    "v2_crafted_berserker_husk",
    "fury",
    MONSTER_CRAFT_MATERIAL_ID.plateauSlayerSerratedBone,
    "극공격 갑옷",
  ),
  crafted_oblivion_ring: keycard5tRecipe(
    "crafted_oblivion_ring",
    "v2_crafted_oblivion_ring",
    "focus",
    MONSTER_CRAFT_MATERIAL_ID.trenchApostlePrayerCore,
    "상태이상 1회 무효 반지",
  ),
  crafted_painless_relic: keycard5tRecipe(
    "crafted_painless_relic",
    "v2_crafted_painless_relic",
    "guard",
    MONSTER_CRAFT_MATERIAL_ID.trenchApostlePrayerCore,
    "상태이상 피해 감소 목걸이",
  ),
  storm_wreckage_greatsword: stormExpeditionRecipe(
    "storm_wreckage_greatsword",
    "v2_storm_wreckage_greatsword",
    "wreckage",
    "fury",
    28,
    "폭풍 원정 6T · 힘/활력 대검",
  ),
  storm_gale_bow: stormExpeditionRecipe(
    "storm_gale_bow",
    "v2_storm_gale_bow",
    "gale",
    "pursuit",
    28,
    "폭풍 원정 6T · 민첩/행운 활",
  ),
  storm_gale_dagger: stormExpeditionRecipe(
    "storm_gale_dagger",
    "v2_storm_gale_dagger",
    "gale",
    "corrosion",
    28,
    "폭풍 원정 6T · 민첩/행운 단검",
  ),
  storm_thunder_staff: stormExpeditionRecipe(
    "storm_thunder_staff",
    "v2_storm_thunder_staff",
    "thunder",
    "focus",
    28,
    "폭풍 원정 6T · 지능/정신 지팡이",
  ),
  storm_breaker_greatsword: stormExpeditionRecipe(
    "storm_breaker_greatsword",
    "v2_storm_breaker_greatsword",
    "wreckage",
    "fury",
    28,
    "폭풍 원정 6T · 붕괴의 선봉 대검",
  ),
  storm_venom_dagger: stormExpeditionRecipe(
    "storm_venom_dagger",
    "v2_storm_venom_dagger",
    "gale",
    "corrosion",
    28,
    "폭풍 원정 6T · 만독침식 단검",
  ),
  storm_sanctuary_staff: stormExpeditionRecipe(
    "storm_sanctuary_staff",
    "v2_storm_sanctuary_staff",
    "thunder",
    "focus",
    28,
    "폭풍 원정 6T · 성역공명 지팡이",
  ),
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

export function parseGuildWorkshopFavoriteRecipeIds(
  raw: unknown,
): GuildWorkshopRecipeId[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.filter(isGuildWorkshopRecipeId)));
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

function emptyGuildWorkshopCraftRecords(): GuildWorkshopCraftRecords {
  return {
    totalCrafts: 0,
    qualityCrafts: 0,
    masterworkCrafts: 0,
    craftOnlyCrafts: 0,
    craftOnlySlots: {},
    highestTier: 0,
    bestQualityLevel: 0,
    recipes: {},
    slots: {},
  };
}

function parseRecipeRecord(raw: unknown): GuildWorkshopRecipeRecord | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  const crafts = Math.max(0, Math.floor(Number(obj.crafts) || 0));
  const masterworkCrafts = Math.max(
    0,
    Math.floor(Number(obj.masterworkCrafts) || 0),
  );
  const bestQualityLevel = Math.max(
    0,
    Math.min(2, Math.floor(Number(obj.bestQualityLevel) || 0)),
  );
  const lastCraftedAt =
    typeof obj.lastCraftedAt === "string" ? obj.lastCraftedAt : undefined;
  if (crafts <= 0 && masterworkCrafts <= 0 && bestQualityLevel <= 0) {
    return undefined;
  }
  return {
    crafts,
    bestQualityLevel,
    masterworkCrafts,
    ...(lastCraftedAt ? { lastCraftedAt } : {}),
  };
}

function parseSlotRecord(raw: unknown): GuildWorkshopSlotRecord | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  const crafts = Math.max(0, Math.floor(Number(obj.crafts) || 0));
  const masterworkCrafts = Math.max(
    0,
    Math.floor(Number(obj.masterworkCrafts) || 0),
  );
  const bestQualityLevel = Math.max(
    0,
    Math.min(2, Math.floor(Number(obj.bestQualityLevel) || 0)),
  );
  const highestTier = Math.max(0, Math.floor(Number(obj.highestTier) || 0));
  if (
    crafts <= 0 &&
    masterworkCrafts <= 0 &&
    bestQualityLevel <= 0 &&
    highestTier <= 0
  ) {
    return undefined;
  }
  return { crafts, bestQualityLevel, masterworkCrafts, highestTier };
}

export function parseGuildWorkshopCraftRecords(
  raw: unknown,
): GuildWorkshopCraftRecords {
  const empty = emptyGuildWorkshopCraftRecords();
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return empty;
  }
  const obj = raw as Record<string, unknown>;
  const recipes: GuildWorkshopCraftRecords["recipes"] = {};
  const rawRecipes =
    obj.recipes != null &&
    typeof obj.recipes === "object" &&
    !Array.isArray(obj.recipes)
      ? (obj.recipes as Record<string, unknown>)
      : {};
  for (const id of GUILD_WORKSHOP_RECIPE_IDS) {
    const record = parseRecipeRecord(rawRecipes[id]);
    if (record) recipes[id] = record;
  }

  const slots: GuildWorkshopCraftRecords["slots"] = {};
  const rawSlots =
    obj.slots != null &&
    typeof obj.slots === "object" &&
    !Array.isArray(obj.slots)
      ? (obj.slots as Record<string, unknown>)
      : {};
  for (const slot of [
    "weapon",
    "armor",
    "gloves",
    "boots",
    "ring",
    "necklace",
  ] as const) {
    const record = parseSlotRecord(rawSlots[slot]);
    if (record) slots[slot] = record;
  }
  const craftOnlySlots: GuildWorkshopCraftRecords["craftOnlySlots"] = {};
  const rawCraftOnlySlots =
    obj.craftOnlySlots != null &&
    typeof obj.craftOnlySlots === "object" &&
    !Array.isArray(obj.craftOnlySlots)
      ? (obj.craftOnlySlots as Record<string, unknown>)
      : {};
  for (const slot of [
    "weapon",
    "armor",
    "gloves",
    "boots",
    "ring",
    "necklace",
  ] as const) {
    const count = Math.max(
      0,
      Math.floor(Number(rawCraftOnlySlots[slot]) || 0),
    );
    if (count > 0) craftOnlySlots[slot] = count;
  }

  return {
    totalCrafts: Math.max(0, Math.floor(Number(obj.totalCrafts) || 0)),
    qualityCrafts: Math.max(0, Math.floor(Number(obj.qualityCrafts) || 0)),
    masterworkCrafts: Math.max(
      0,
      Math.floor(Number(obj.masterworkCrafts) || 0),
    ),
    craftOnlyCrafts: Math.max(
      0,
      Math.floor(Number(obj.craftOnlyCrafts) || 0),
    ),
    craftOnlySlots,
    highestTier: Math.max(0, Math.floor(Number(obj.highestTier) || 0)),
    bestQualityLevel: Math.max(
      0,
      Math.min(2, Math.floor(Number(obj.bestQualityLevel) || 0)),
    ),
    recipes,
    slots,
  };
}

export function addGuildWorkshopCraftRecord(
  records: GuildWorkshopCraftRecords,
  event: GuildWorkshopCraftRecordEvent,
): GuildWorkshopCraftRecords {
  const qualityLevel = Math.max(
    0,
    Math.min(2, Math.floor(Number(event.craftQualityLevel) || 0)),
  );
  const tier = Math.max(0, Math.floor(Number(event.item.tier) || 0));
  const recipeRecord = records.recipes[event.recipeId] ?? {
    crafts: 0,
    bestQualityLevel: 0,
    masterworkCrafts: 0,
  };
  const slotRecord = records.slots[event.item.slot] ?? {
    crafts: 0,
    bestQualityLevel: 0,
    masterworkCrafts: 0,
    highestTier: 0,
  };
  const nextCraftOnlySlots = { ...records.craftOnlySlots };
  if (event.item.craftOnly) {
    nextCraftOnlySlots[event.item.slot] =
      (nextCraftOnlySlots[event.item.slot] ?? 0) + 1;
  }
  return {
    totalCrafts: records.totalCrafts + 1,
    qualityCrafts: records.qualityCrafts + (qualityLevel > 0 ? 1 : 0),
    masterworkCrafts: records.masterworkCrafts + (event.masterwork ? 1 : 0),
    craftOnlyCrafts: records.craftOnlyCrafts + (event.item.craftOnly ? 1 : 0),
    craftOnlySlots: nextCraftOnlySlots,
    highestTier: Math.max(records.highestTier, tier),
    bestQualityLevel: Math.max(records.bestQualityLevel, qualityLevel),
    recipes: {
      ...records.recipes,
      [event.recipeId]: {
        crafts: recipeRecord.crafts + 1,
        bestQualityLevel: Math.max(recipeRecord.bestQualityLevel, qualityLevel),
        masterworkCrafts:
          recipeRecord.masterworkCrafts + (event.masterwork ? 1 : 0),
        ...(event.craftedAt ? { lastCraftedAt: event.craftedAt } : {}),
      },
    },
    slots: {
      ...records.slots,
      [event.item.slot]: {
        crafts: slotRecord.crafts + 1,
        bestQualityLevel: Math.max(slotRecord.bestQualityLevel, qualityLevel),
        masterworkCrafts:
          slotRecord.masterworkCrafts + (event.masterwork ? 1 : 0),
        highestTier: Math.max(slotRecord.highestTier, tier),
      },
    },
  };
}

export function guildWorkshopRecipeIdForEquipmentId(
  equipmentId: V2EquipmentId,
): GuildWorkshopRecipeId | undefined {
  return GUILD_WORKSHOP_RECIPE_IDS.find(
    (id) => GUILD_WORKSHOP_RECIPES[id].equipmentId === equipmentId,
  );
}

export function guildWorkshopEquipmentRecordViews(
  raw: unknown,
): Partial<
  Record<
    V2EquipmentId,
    GuildWorkshopRecipeRecord & {
      recipeId: GuildWorkshopRecipeId;
    }
  >
> {
  const records = parseGuildWorkshopCraftRecords(raw);
  const out: Partial<
    Record<
      V2EquipmentId,
      GuildWorkshopRecipeRecord & {
        recipeId: GuildWorkshopRecipeId;
      }
    >
  > = {};
  for (const [recipeId, record] of Object.entries(records.recipes)) {
    if (!record) continue;
    const id = recipeId as GuildWorkshopRecipeId;
    out[GUILD_WORKSHOP_RECIPES[id].equipmentId] = { ...record, recipeId: id };
  }
  return out;
}

export function guildWorkshopCraftRecordTitleIds(
  records: GuildWorkshopCraftRecords,
): string[] {
  const out: string[] = [];
  if (
    records.bestQualityLevel >= 2 &&
    records.qualityCrafts >=
      BLACKSMITH_CRAFT_RECORD_TITLE_THRESHOLDS.doubleStarQuality
  ) {
    out.push("artisan_double_star_smith");
  }
  if (
    records.masterworkCrafts >=
    BLACKSMITH_CRAFT_RECORD_TITLE_THRESHOLDS.masterworkCrafts
  ) {
    out.push("artisan_masterwork_smith");
  }
  if (records.highestTier >= BLACKSMITH_CRAFT_RECORD_TITLE_THRESHOLDS.highTier) {
    out.push("artisan_high_tier_smith");
  }
  const craftOnlySlotCount = (
    ["weapon", "armor", "gloves", "boots", "ring", "necklace"] as const
  ).filter((slot) => (records.craftOnlySlots[slot] ?? 0) > 0).length;
  if (
    craftOnlySlotCount >=
    BLACKSMITH_CRAFT_RECORD_TITLE_THRESHOLDS.craftOnlySlotCount
  ) {
    out.push("artisan_full_kit_smith");
  }
  return out;
}

export function isGuildWorkshopCraftMode(
  v: unknown,
): v is GuildWorkshopCraftMode {
  return v === "normal" || v === "masterwork";
}

/** 개량 재료로 쓸 수 있는 미장착·미잠금 장비. 낮은 강화/품질/굴림부터 자동 소모한다. */
export function guildWorkshopBaseEquipmentCandidates(
  owned: readonly V2EquipInstance[],
  equipped: Partial<Record<V2EquipSlot, string>>,
  recipe: GuildWorkshopRecipe,
): V2EquipInstance[] {
  if (!recipe.baseEquipmentId) return [];
  const equippedIids = new Set(Object.values(equipped));
  return owned
    .filter(
      (instance) =>
        instance.id === recipe.baseEquipmentId &&
        instance.locked !== true &&
        !equippedIids.has(instance.iid),
    )
    .sort((a, b) => {
      const enhanceDiff = (a.enhance?.level ?? 0) - (b.enhance?.level ?? 0);
      if (enhanceDiff !== 0) return enhanceDiff;
      const qualityDiff =
        (a.craftQuality?.level ?? 0) - (b.craftQuality?.level ?? 0);
      if (qualityDiff !== 0) return qualityDiff;
      const catalogPower = V2_EQUIPMENT[recipe.baseEquipmentId!].power;
      const powerDiff = (a.roll?.power ?? catalogPower) - (b.roll?.power ?? catalogPower);
      if (powerDiff !== 0) return powerDiff;
      return a.iid.localeCompare(b.iid);
    });
}

export function spendGuildWorkshopBaseEquipment(
  owned: readonly V2EquipInstance[],
  equipped: Partial<Record<V2EquipSlot, string>>,
  recipe: GuildWorkshopRecipe,
): { owned: V2EquipInstance[]; consumed: V2EquipInstance | null } | null {
  if (!recipe.baseEquipmentId) return { owned: [...owned], consumed: null };
  const consumed = guildWorkshopBaseEquipmentCandidates(owned, equipped, recipe)[0];
  if (!consumed) return null;
  return {
    owned: owned.filter((instance) => instance.iid !== consumed.iid),
    consumed,
  };
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
): Partial<Record<string, number>> {
  const out = guildWorkshopRecipeResourceMaterialCost(recipe, mode);
  const mult =
    mode === "masterwork" ? GUILD_WORKSHOP_MASTERWORK_MATERIAL_COST_MULT : 1;
  for (const [id, amount] of Object.entries(recipe.materialCost ?? {})) {
    out[id] = (out[id] ?? 0) + Math.max(0, Math.ceil((amount ?? 0) * mult));
  }
  for (const [id, amount] of Object.entries(recipe.specialMaterialCost ?? {})) {
    out[id] = (out[id] ?? 0) + Math.max(0, Math.ceil((amount ?? 0) * mult));
  }
  return out;
}

export function guildWorkshopRecipeResourceMaterialCost(
  recipe: GuildWorkshopRecipe,
  mode: GuildWorkshopCraftMode = "normal",
): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {};
  const equipmentTier = V2_EQUIPMENT[recipe.equipmentId].tier;
  for (const [kind, amount] of Object.entries(
    guildWorkshopRecipeResourceCost(recipe, mode),
  )) {
    const materialId =
      kind === "crop"
        ? guildWorkshopWoodMaterialForTier(equipmentTier)
        : guildWorkshopMiningMaterialForTier(equipmentTier);
    out[materialId] = (out[materialId] ?? 0) + Math.max(0, amount ?? 0);
  }
  return out;
}

export function guildWorkshopMaterialName(id: string): string {
  return (
    (SETTLEMENT_MATERIALS as Record<string, { name?: string }>)[id]?.name ??
    (WOODCUTTING_MATERIALS as Record<string, { name?: string }>)[id]?.name ??
    (MINING_MATERIALS as Record<string, { name?: string }>)[id]?.name ??
    (GUILD_WORKSHOP_MATERIALS as Record<string, { name?: string }>)[id]?.name ??
    (MONSTER_CRAFT_MATERIALS as Record<string, { name?: string }>)[id]?.name ??
    (COOP_REWARD_MATERIALS as Record<string, { name?: string }>)[id]?.name ??
    (STORM_EXPEDITION_MATERIALS as Record<string, { name?: string }>)[id]?.name ??
    id
  );
}

function guildWorkshopCostText(
  _cost: Partial<Record<ProductionKind, number>>,
  materialCost: Partial<Record<string, number>>,
): string {
  return [
    ...Object.entries(materialCost).map(([id, amount]) => {
      return `${guildWorkshopMaterialName(id)} ${amount}`;
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

export type GuildWorkshopMaterialSubstitution = {
  requiredMaterialId: GuildWorkshopMaterialId;
  requiredMaterialName: string;
  substituteMaterialId: GuildWorkshopMaterialId;
  substituteMaterialName: string;
  count: number;
  goldCost: number;
};

export type GuildWorkshopMaterialSpendPlan = {
  ok: boolean;
  spend: Record<string, number>;
  substitutions: GuildWorkshopMaterialSubstitution[];
  extraGoldCost: number;
};

/**
 * 레시피의 각 재료를 먼저 제 용도에 예약한 뒤, 부족한 제작소 전용 재료만
 * 인벤토리에 실제로 있는 바로 윗단계 재료로 1:1 대체한다.
 */
export function guildWorkshopRecipeMaterialSpendPlan(
  materials: Record<string, number>,
  recipe: GuildWorkshopRecipe,
  mode: GuildWorkshopCraftMode = "normal",
): GuildWorkshopMaterialSpendPlan {
  const materialCost = guildWorkshopRecipeMaterialCost(recipe, mode);
  const spend: Record<string, number> = {};
  const remaining: Record<string, number> = {};
  const shortages: Array<{ id: string; count: number }> = [];

  for (const [id, amountRaw] of Object.entries(materialCost)) {
    const required = Math.max(0, Math.floor(amountRaw ?? 0));
    const owned = Math.max(0, Math.floor(materials[id] ?? 0));
    const exact = Math.min(required, owned);
    if (exact > 0) spend[id] = exact;
    remaining[id] = Math.max(0, owned - exact);
    if (exact < required) shortages.push({ id, count: required - exact });
  }
  for (const [id, amountRaw] of Object.entries(materials)) {
    if (id in remaining) continue;
    remaining[id] = Math.max(0, Math.floor(amountRaw ?? 0));
  }

  const substitutions: GuildWorkshopMaterialSubstitution[] = [];
  for (const shortage of shortages) {
    if (!GUILD_WORKSHOP_MATERIAL_IDS.includes(shortage.id as GuildWorkshopMaterialId)) {
      return { ok: false, spend: {}, substitutions: [], extraGoldCost: 0 };
    }
    const requiredMaterialId = shortage.id as GuildWorkshopMaterialId;
    const substituteMaterialId =
      GUILD_WORKSHOP_MATERIAL_SUBSTITUTE[requiredMaterialId];
    if (!substituteMaterialId) {
      return { ok: false, spend: {}, substitutions: [], extraGoldCost: 0 };
    }
    const available = Math.max(0, remaining[substituteMaterialId] ?? 0);
    if (available < shortage.count) {
      return { ok: false, spend: {}, substitutions: [], extraGoldCost: 0 };
    }
    remaining[substituteMaterialId] = available - shortage.count;
    spend[substituteMaterialId] =
      (spend[substituteMaterialId] ?? 0) + shortage.count;
    const unitGoldCost = Math.max(
      0,
      GUILD_WORKSHOP_MATERIAL_SUBSTITUTE_GOLD[requiredMaterialId] ?? 0,
    );
    substitutions.push({
      requiredMaterialId,
      requiredMaterialName: guildWorkshopMaterialName(requiredMaterialId),
      substituteMaterialId,
      substituteMaterialName: guildWorkshopMaterialName(substituteMaterialId),
      count: shortage.count,
      goldCost: unitGoldCost * shortage.count,
    });
  }

  return {
    ok: true,
    spend,
    substitutions,
    extraGoldCost: substitutions.reduce(
      (sum, substitution) => sum + substitution.goldCost,
      0,
    ),
  };
}

export function spendGuildWorkshopMaterialsFromPlan(
  materials: Record<string, number>,
  plan: GuildWorkshopMaterialSpendPlan,
): Record<string, number> {
  if (!plan.ok) return { ...materials };
  const next: Record<string, number> = { ...materials };
  for (const [id, amount] of Object.entries(plan.spend)) {
    const left = Math.max(0, Math.floor((next[id] ?? 0) - amount));
    if (left > 0) next[id] = left;
    else delete next[id];
  }
  return next;
}

export function hasGuildWorkshopRecipeResourceMaterials(
  materials: Record<string, number>,
  recipe: GuildWorkshopRecipe,
  mode: GuildWorkshopCraftMode = "normal",
): boolean {
  const materialCost = guildWorkshopRecipeResourceMaterialCost(recipe, mode);
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
  | "not_crafted"
  | "low_tier"
  | "no_material";

export type GuildWorkshopDismantlePlan = {
  materials: Record<string, number>;
  artisanXp: number;
  blockedReason?: GuildWorkshopDismantleBlockedReason;
};

export function guildWorkshopDismantleMaterialForTier(
  tierRaw: number,
): GuildWorkshopMaterialId | undefined {
  const tier = Math.max(1, Math.floor(tierRaw));
  if (tier >= 13) return GUILD_WORKSHOP_MATERIAL_ID.abyssalStarsteel;
  if (tier >= 10) return GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal;
  if (tier >= 8) return GUILD_WORKSHOP_MATERIAL_ID.sunstone;
  if (tier >= 6) return GUILD_WORKSHOP_MATERIAL_ID.mithrilShard;
  if (tier >= 4) return GUILD_WORKSHOP_MATERIAL_ID.refinedIron;
  return undefined;
}

export function guildWorkshopDismantleArtisanXpForTier(tierRaw: number): number {
  const tier = Math.max(1, Math.floor(tierRaw));
  if (tier < 4) return 0;
  return Math.max(
    1,
    Math.min(GUILD_WORKSHOP_DISMANTLE_MAX_ARTISAN_XP, Math.floor(tier / 4)),
  );
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
  if (inst.craftedBy?.profession !== "blacksmith" && !item.craftOnly) {
    return { materials: {}, artisanXp: 0, blockedReason: "not_crafted" };
  }
  const sourceRecipe = Object.values(GUILD_WORKSHOP_RECIPES).find(
    (recipe) => recipe.equipmentId === item.id,
  );
  const sourceMaterialCost = sourceRecipe
    ? guildWorkshopRecipeMaterialCost(
        sourceRecipe,
        inst.craftedBy?.masterwork === true ? "masterwork" : "normal",
      )
    : null;
  const stormRouteMaterialId = sourceMaterialCost
    ? Object.values(STORM_EXPEDITION_ROUTE_MATERIAL_ID).find(
        (id) => Math.max(0, sourceMaterialCost[id] ?? 0) > 0,
      )
    : undefined;
  if (stormRouteMaterialId) {
    const routeMaterialCost = Math.max(
      0,
      sourceMaterialCost?.[stormRouteMaterialId] ?? 0,
    );
    const amount = Math.max(
      1,
      Math.floor(
        (routeMaterialCost * STORM_EQUIPMENT_DISMANTLE_ROUTE_RECOVERY_PCT) /
          100,
      ),
    );
    return {
      materials: { [stormRouteMaterialId]: amount },
      artisanXp: guildWorkshopDismantleArtisanXpForTier(item.tier),
    };
  }
  // 실제로 사용한 제작소 촉매를 우선 회수한다. 입문 제작품처럼 촉매를 쓰지
  // 않는 장비는 실제 원가에 포함된 광석으로 폴백해 없는 재료를 새로 만들지 않는다.
  const materialId = sourceMaterialCost
    ? ([...GUILD_WORKSHOP_MATERIAL_IDS]
        .reverse()
        .find((id) => Math.max(0, sourceMaterialCost[id] ?? 0) > 0) ??
      [
        guildWorkshopMiningMaterialForTier(item.tier),
        ...Object.keys(sourceMaterialCost),
      ].find((id) => Math.max(0, sourceMaterialCost[id] ?? 0) > 0))
    : guildWorkshopDismantleMaterialForTier(item.tier);
  if (!materialId) {
    return {
      materials: {},
      artisanXp: 0,
      blockedReason: item.tier < 4 ? "low_tier" : "no_material",
    };
  }

  let amount = 1;
  if (item.craftOnly) amount += 1;
  if ((inst.craftQuality?.level ?? 0) >= 2) amount += 1;
  if (inst.craftedBy?.masterwork === true) amount += 1;
  amount = Math.min(GUILD_WORKSHOP_DISMANTLE_MAX_MATERIALS, amount);
  if (sourceMaterialCost) {
    const recoverableMaterialCost = Math.floor(
      ((sourceMaterialCost[materialId] ?? 0) *
        GUILD_WORKSHOP_DISMANTLE_MATERIAL_RECOVERY_PCT) /
        100,
    );
    amount = Math.min(amount, Math.max(0, recoverableMaterialCost));
  }

  if (amount <= 0) {
    return { materials: {}, artisanXp: 0, blockedReason: "no_material" };
  }
  return {
    materials: { [materialId]: amount },
    artisanXp: guildWorkshopDismantleArtisanXpForTier(item.tier),
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
    return 100;
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
  const level = artisanLevel(artisan[recipe.profession]);
  if (mode === "masterwork") {
    if (
      level >= BLACKSMITH_PLUS2_QUALITY_LEVEL &&
      rng() * 100 < GUILD_WORKSHOP_MASTERWORK_PLUS2_CHANCE_PCT
    ) {
      return { level: 2, bonusPct: GUILD_WORKSHOP_QUALITY_BONUS_PCT[2] };
    }
    return { level: 1, bonusPct: GUILD_WORKSHOP_QUALITY_BONUS_PCT[1] };
  }

  const chancePct = guildWorkshopQualityChancePct(
    artisan,
    recipe,
    guildBonus,
    mode,
  );
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
  baseEquipmentEligibleCount = 0,
  spendableGoldRaw = Number.MAX_SAFE_INTEGER,
) {
  const item = V2_EQUIPMENT[recipe.equipmentId];
  const levelOk = meetsGuildWorkshopRecipeLevel(artisan, recipe);
  const artisanProfessionLevel = artisanLevel(artisan[recipe.profession]);
  const smithyLevelOk =
    smithyLevel >= Math.max(1, recipe.requiredSmithyLevel ?? 1);
  const baseEquipmentOk =
    !recipe.baseEquipmentId || baseEquipmentEligibleCount >= 1;
  const resourceOk = hasGuildWorkshopRecipeResourceMaterials(materials, recipe);
  const materialOk = hasGuildWorkshopRecipeMaterials(materials, recipe);
  const materialSpendPlan = guildWorkshopRecipeMaterialSpendPlan(
    materials,
    recipe,
  );
  const masterworkResourceOk = hasGuildWorkshopRecipeResourceMaterials(
    materials,
    recipe,
    "masterwork",
  );
  const masterworkMaterialOk = hasGuildWorkshopRecipeMaterials(
    materials,
    recipe,
    "masterwork",
  );
  const masterworkMaterialSpendPlan = guildWorkshopRecipeMaterialSpendPlan(
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
  const spendableGold = Math.max(0, Math.floor(Number(spendableGoldRaw) || 0));
  const goldCost = guildWorkshopRecipeGoldCost(recipe);
  const goldOk = spendableGold >= goldCost;
  const substitutionGoldCost = materialSpendPlan.extraGoldCost;
  const substitutionGoldOk = spendableGold >= goldCost + substitutionGoldCost;
  const masterworkGoldCost = guildWorkshopRecipeGoldCost(recipe, "masterwork");
  const masterworkGoldOk = spendableGold >= masterworkGoldCost;
  const masterworkSubstitutionGoldCost =
    masterworkMaterialSpendPlan.extraGoldCost;
  const masterworkSubstitutionGoldOk =
    spendableGold >= masterworkGoldCost + masterworkSubstitutionGoldCost;
  return {
    id: recipe.id,
    equipmentId: recipe.equipmentId,
    itemName: item.name,
    slot: item.slot,
    tier: item.tier,
    craftOnly: item.craftOnly === true,
    baseEquipment: recipe.baseEquipmentId
      ? {
          equipmentId: recipe.baseEquipmentId,
          itemName: V2_EQUIPMENT[recipe.baseEquipmentId].name,
          requiredCount: 1,
          eligibleCount: Math.max(0, Math.floor(baseEquipmentEligibleCount)),
          resetOnCraft: true,
        }
      : null,
    note: recipe.note,
    cost: normalCost,
    materialCost: normalMaterialCost,
    profession: recipe.profession,
    requiredArtisanLevel: recipe.requiredArtisanLevel,
    requiredSmithyLevel: recipe.requiredSmithyLevel ?? 1,
    artisanXp: recipe.artisanXp,
    qualityChancePct,
    costText: guildWorkshopCostText(normalCost, normalMaterialCost),
    goldCost,
    goldOk,
    levelOk,
    smithyLevelOk,
    materialOk,
    resourceOk,
    canCraft:
      levelOk && smithyLevelOk && materialOk && baseEquipmentOk && goldOk,
    materialSubstitution:
      !materialOk &&
      materialSpendPlan.ok &&
      materialSpendPlan.substitutions.length > 0
        ? {
            replacements: materialSpendPlan.substitutions,
            extraGoldCost: substitutionGoldCost,
            totalGoldCost: goldCost + substitutionGoldCost,
            goldOk: substitutionGoldOk,
            canCraft:
              levelOk &&
              smithyLevelOk &&
              baseEquipmentOk &&
              substitutionGoldOk,
          }
        : null,
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
        masterworkMaterialOk &&
        baseEquipmentOk &&
        masterworkGoldOk,
      qualityChancePct: masterworkQualityChancePct,
      cost: masterworkCost,
      materialCost: masterworkMaterialCost,
      costText: guildWorkshopCostText(masterworkCost, masterworkMaterialCost),
      goldCost: masterworkGoldCost,
      goldOk: masterworkGoldOk,
      plus2Unlocked: artisanProfessionLevel >= BLACKSMITH_PLUS2_QUALITY_LEVEL,
      materialSubstitution:
        !masterworkMaterialOk &&
        masterworkMaterialSpendPlan.ok &&
        masterworkMaterialSpendPlan.substitutions.length > 0
          ? {
              replacements: masterworkMaterialSpendPlan.substitutions,
              extraGoldCost: masterworkSubstitutionGoldCost,
              totalGoldCost:
                masterworkGoldCost + masterworkSubstitutionGoldCost,
              goldOk: masterworkSubstitutionGoldOk,
              canCraft:
                levelOk &&
                masterworkLevelOk &&
                smithyLevelOk &&
                baseEquipmentOk &&
                masterworkSubstitutionGoldOk,
            }
          : null,
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
