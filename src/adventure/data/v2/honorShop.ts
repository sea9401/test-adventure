import { HONOR_SHOP_STAMINA_POTION_COST } from "./settlementWarfareConfig";
import {
  GUILD_WORKSHOP_MATERIALS,
  GUILD_WORKSHOP_MATERIAL_ID,
  type GuildWorkshopMaterialId,
} from "./guildWorkshopMaterials";

export type HonorShopItem = {
  id: string;
  name: string;
  cost: number;
  quantity: 1;
  grantKind: "stamina_potion" | "material";
  targetId: "stamina_potion" | GuildWorkshopMaterialId;
};

const MATERIAL_PRICES: readonly [GuildWorkshopMaterialId, number][] = [
  [GUILD_WORKSHOP_MATERIAL_ID.refinedIron, 10],
  [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard, 20],
  [GUILD_WORKSHOP_MATERIAL_ID.sunstone, 40],
  [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal, 50],
  [GUILD_WORKSHOP_MATERIAL_ID.abyssalStarsteel, 70],
];

export const HONOR_SHOP_ITEMS: readonly HonorShopItem[] = [
  {
    id: "stamina_potion",
    name: "스태미나 회복약",
    cost: HONOR_SHOP_STAMINA_POTION_COST,
    quantity: 1,
    grantKind: "stamina_potion",
    targetId: "stamina_potion",
  },
  ...MATERIAL_PRICES.map(([materialId, cost]) => ({
    id: materialId,
    name: GUILD_WORKSHOP_MATERIALS[materialId].name,
    cost,
    quantity: 1 as const,
    grantKind: "material" as const,
    targetId: materialId,
  })),
];

export function honorShopItem(itemId: unknown): HonorShopItem | undefined {
  return typeof itemId === "string"
    ? HONOR_SHOP_ITEMS.find((item) => item.id === itemId)
    : undefined;
}
