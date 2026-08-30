import {
  V2_EQUIPMENT,
  type V2EquipInstance,
} from "@/adventure/data/v2/v2Equipment";

export function boundEquipmentDisposalView(instance: V2EquipInstance) {
  const item = V2_EQUIPMENT[instance.id];
  return {
    iid: instance.iid,
    itemId: instance.id,
    itemName: item.name,
    bound: instance.bound === true,
    ...(instance.liberation ? { liberation: instance.liberation } : {}),
  };
}
