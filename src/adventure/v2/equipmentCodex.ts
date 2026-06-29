import {
  V2_EQUIPMENT,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";

export const EQUIPMENT_CODEX_KEY = "equipment-codex.v1";

const VALID_EQUIPMENT_IDS = new Set(Object.keys(V2_EQUIPMENT));

export type EquipmentCodexSave = {
  registeredIds?: unknown;
};

export function parseEquipmentCodex(raw: unknown): Set<V2EquipmentId> {
  const save = (raw ?? {}) as EquipmentCodexSave;
  const ids = new Set<V2EquipmentId>();
  if (!Array.isArray(save.registeredIds)) return ids;
  for (const id of save.registeredIds) {
    if (typeof id === "string" && VALID_EQUIPMENT_IDS.has(id)) {
      ids.add(id as V2EquipmentId);
    }
  }
  return ids;
}

export function serializeEquipmentCodex(ids: Iterable<string>) {
  return {
    registeredIds: [...new Set(ids)].filter((id) =>
      VALID_EQUIPMENT_IDS.has(id),
    ) as V2EquipmentId[],
  };
}
