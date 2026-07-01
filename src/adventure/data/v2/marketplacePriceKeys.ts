import {
  V2_EQUIPMENT,
  parseCraftedBy,
  parseInstanceCraftQuality,
  type V2EquipInstance,
} from "./v2Equipment";

export function marketplaceCraftPriceKey(
  itemId: string,
  opts: {
    craftedBy?: unknown;
    craftQuality?: unknown;
    enhance?: unknown;
    craftOnly?: boolean;
  },
): string {
  const craftedBy = parseCraftedBy(opts.craftedBy);
  const craftQuality = parseInstanceCraftQuality(
    opts.craftQuality,
    opts.enhance,
    craftedBy,
  );
  if (opts.craftOnly) return `${itemId}#craftOnly`;
  if (craftedBy?.masterwork) return `${itemId}#masterwork`;
  if ((craftQuality?.level ?? 0) >= 2) return `${itemId}#quality2`;
  if ((craftQuality?.level ?? 0) >= 1) return `${itemId}#quality1`;
  if (craftedBy) return `${itemId}#crafted`;
  return itemId;
}

export function marketplacePriceKeyForPayload(
  itemId: string,
  payload: unknown,
): string {
  const raw =
    payload != null && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as {
          craftedBy?: unknown;
          craftQuality?: unknown;
          enhance?: unknown;
        })
      : {};
  return marketplaceCraftPriceKey(itemId, {
    craftedBy: raw.craftedBy,
    craftQuality: raw.craftQuality,
    enhance: raw.enhance,
    craftOnly: V2_EQUIPMENT[itemId as keyof typeof V2_EQUIPMENT]?.craftOnly,
  });
}

export function marketplacePriceKeyForEquipInstance(
  inst: V2EquipInstance,
): string {
  return marketplaceCraftPriceKey(inst.id, {
    craftedBy: inst.craftedBy,
    craftQuality: inst.craftQuality,
    enhance: inst.enhance,
    craftOnly: V2_EQUIPMENT[inst.id]?.craftOnly,
  });
}
