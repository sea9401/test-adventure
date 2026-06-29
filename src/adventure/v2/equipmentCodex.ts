import {
  V2_EQUIPMENT,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";

export const EQUIPMENT_CODEX_KEY = "equipment-codex.v1";

const VALID_EQUIPMENT_IDS = new Set(Object.keys(V2_EQUIPMENT));

export type EquipmentCodexSave = {
  registeredIds?: unknown;
};

export const CRAFT_ONLY_CODEX_REWARDS = [
  { count: 4, titleId: "artisan_codex_collector", label: "장인표 수집가" },
  { count: 8, titleId: "artisan_codex_curator", label: "장인표 감정가" },
  { count: 10, titleId: "artisan_codex_master", label: "장인표 전승자" },
] as const;

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

export function countCraftOnlyEquipmentCodex(
  ids: Iterable<string>,
): number {
  let count = 0;
  for (const id of new Set(ids)) {
    if (VALID_EQUIPMENT_IDS.has(id) && V2_EQUIPMENT[id as V2EquipmentId]?.craftOnly) {
      count += 1;
    }
  }
  return count;
}

export function craftOnlyCodexRewardTitleIds(count: number): string[] {
  return CRAFT_ONLY_CODEX_REWARDS.filter((reward) => count >= reward.count).map(
    (reward) => reward.titleId,
  );
}
