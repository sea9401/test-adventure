import { isFishId, type FishId } from "@/adventure/data/v2/fish";

export const FISH_SPECIMEN_SAVE_KEY = "fishing-specimens.v1";
export const FISH_SPECIMEN_ITEM_PREFIX = "fish_specimen_";

export type FishSpecimenInventory = {
  version: 1;
  items: Partial<Record<FishId, number>>;
};

export function emptyFishSpecimenInventory(): FishSpecimenInventory {
  return { version: 1, items: {} };
}

export function parseFishSpecimenInventory(raw: unknown): FishSpecimenInventory {
  if (!raw || typeof raw !== "object") return emptyFishSpecimenInventory();
  const source = raw as Record<string, unknown>;
  if (!source.items || typeof source.items !== "object") return emptyFishSpecimenInventory();

  const items: Partial<Record<FishId, number>> = {};
  for (const [fishId, value] of Object.entries(source.items as Record<string, unknown>)) {
    if (!isFishId(fishId) || typeof value !== "number" || !Number.isFinite(value)) continue;
    const quantity = Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value));
    if (quantity > 0) items[fishId] = quantity;
  }
  return { version: 1, items };
}

export function fishSpecimenItemId(fishId: FishId): string {
  return `${FISH_SPECIMEN_ITEM_PREFIX}${fishId}`;
}

export function fishIdFromSpecimenItemId(itemId: string): FishId | null {
  if (!itemId.startsWith(FISH_SPECIMEN_ITEM_PREFIX)) return null;
  const fishId = itemId.slice(FISH_SPECIMEN_ITEM_PREFIX.length);
  return isFishId(fishId) ? fishId : null;
}

function validQuantity(quantity: number): boolean {
  return Number.isSafeInteger(quantity) && quantity > 0;
}

export function addFishSpecimen(
  inventory: FishSpecimenInventory,
  fishId: FishId,
  quantity = 1,
): FishSpecimenInventory {
  if (!validQuantity(quantity)) throw new RangeError("invalid_fish_specimen_quantity");
  const current = inventory.items[fishId] ?? 0;
  if (current > Number.MAX_SAFE_INTEGER - quantity) {
    throw new RangeError("fish_specimen_quantity_overflow");
  }
  return {
    version: 1,
    items: { ...inventory.items, [fishId]: current + quantity },
  };
}

export function removeFishSpecimen(
  inventory: FishSpecimenInventory,
  fishId: FishId,
  quantity = 1,
): FishSpecimenInventory | null {
  if (!validQuantity(quantity)) return null;
  const current = inventory.items[fishId] ?? 0;
  if (current < quantity) return null;

  const items = { ...inventory.items };
  const remaining = current - quantity;
  if (remaining > 0) items[fishId] = remaining;
  else delete items[fishId];
  return { version: 1, items };
}
