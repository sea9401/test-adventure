import {
  type V2Equipment,
  type V2EquipmentId,
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";

export function equippedInstanceForMarketplaceItem(
  item: V2Equipment,
  owned: readonly V2EquipInstance[],
  equipped: Partial<Record<V2EquipSlot, string>>,
): V2EquipInstance | null {
  const equippedIid = equipped[item.slot];
  if (!equippedIid) return null;
  return owned.find((instance) => instance.iid === equippedIid) ?? null;
}

export function equippedItemIdsForMarketplace(
  owned: readonly V2EquipInstance[],
  equipped: Partial<Record<V2EquipSlot, string>>,
): ReadonlySet<V2EquipmentId> {
  const byIid = new Map(owned.map((instance) => [instance.iid, instance.id]));
  return new Set(
    Object.values(equipped)
      .map((iid) => (iid ? byIid.get(iid) : undefined))
      .filter((id): id is V2EquipmentId => id !== undefined),
  );
}
