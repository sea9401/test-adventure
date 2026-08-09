import type { CatalogOption } from "./adminCatalogOptions";
import type { AttachmentEntry } from "./ui/AttachmentPicker";
import {
  CULTIVATION_RESET_POTION_ITEM_ID,
  LEVEL_100_ELIXIR_ITEM_ID,
  MUSEUN_ADMIN_GIFT_ITEM_IDS,
  MUSEUN_CASH_ITEMS,
} from "@/adventure/data/v2/museunCashItems";

const STAMINA_POTION_ITEM_ID = "stamina_potion" as const;
const ADMIN_MAIL_UTILITY_ITEM_IDS = [
  CULTIVATION_RESET_POTION_ITEM_ID,
  LEVEL_100_ELIXIR_ITEM_ID,
] as const;
const ADMIN_MAIL_UTILITY_ITEM_ID_SET = new Set<string>(
  ADMIN_MAIL_UTILITY_ITEM_IDS,
);

export function adminMailConsumableOptions(): CatalogOption[] {
  return [
    {
      id: STAMINA_POTION_ITEM_ID,
      name: "스태미나 회복약",
      label: "스태미나 회복약",
    },
    ...ADMIN_MAIL_UTILITY_ITEM_IDS.map((id) => ({
      id,
      name: MUSEUN_CASH_ITEMS[id].name,
      label: MUSEUN_CASH_ITEMS[id].name,
    })),
  ];
}

export function adminMailCashItemOptions(): CatalogOption[] {
  return MUSEUN_ADMIN_GIFT_ITEM_IDS.filter(
    (id) => !ADMIN_MAIL_UTILITY_ITEM_ID_SET.has(id),
  ).map((id) => ({
    id,
    name: MUSEUN_CASH_ITEMS[id].name,
    label: `${MUSEUN_CASH_ITEMS[id].name} (${MUSEUN_CASH_ITEMS[id].coinPrice.toLocaleString()}코인 상품)`,
  }));
}

export function splitAdminMailConsumables(
  entries: readonly AttachmentEntry[],
  cashItemEntries: readonly AttachmentEntry[] = [],
): {
  staminaPotions: number;
  cashItems: { itemId: string; count: number }[];
} {
  let staminaPotions = 0;
  const cashItems = cashItemEntries.flatMap((entry) => {
    const count = Math.max(0, Math.floor(Number(entry.count) || 0));
    return count > 0 ? [{ itemId: entry.id, count }] : [];
  });

  for (const entry of entries) {
    const count = Math.max(0, Math.floor(Number(entry.count) || 0));
    if (count <= 0) continue;
    if (entry.id === STAMINA_POTION_ITEM_ID) {
      staminaPotions += count;
    } else if (ADMIN_MAIL_UTILITY_ITEM_ID_SET.has(entry.id)) {
      cashItems.push({ itemId: entry.id, count });
    }
  }

  return { staminaPotions, cashItems };
}
