import {
  V2_EQUIPMENT,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";

export const EQUIPMENT_CODEX_KEY = "equipment-codex.v1";

// 신규 장비가 추가되면 여기에 다음 단계만 이어 붙인다. 기존 보상은 회수하지 않는다.
export const EQUIPMENT_CODEX_SP_MILESTONES = [15, 35, 65, 100, 130] as const;

export type EquipmentCodexState = {
  registeredIds: V2EquipmentId[];
};

const VALID_EQUIPMENT_IDS: ReadonlySet<string> = new Set(
  Object.keys(V2_EQUIPMENT),
);

export const EQUIPMENT_CODEX_TOTAL = Object.keys(V2_EQUIPMENT).length;

export const CRAFT_ONLY_CODEX_REWARDS = [
  { count: 4, titleId: "artisan_codex_collector", label: "장인표 수집가" },
  { count: 8, titleId: "artisan_codex_curator", label: "장인표 감정가" },
  { count: 10, titleId: "artisan_codex_master", label: "장인표 전승자" },
] as const;

export function parseEquipmentCodex(raw: unknown): EquipmentCodexState {
  const source =
    raw && typeof raw === "object"
      ? (raw as { registeredIds?: unknown; registered?: unknown })
      : {};
  const idsRaw = Array.isArray(source.registeredIds)
    ? source.registeredIds
    : Array.isArray(source.registered)
      ? source.registered
      : [];
  const seen = new Set<string>();
  const registeredIds: V2EquipmentId[] = [];
  for (const id of idsRaw) {
    if (typeof id !== "string") continue;
    if (!VALID_EQUIPMENT_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    registeredIds.push(id as V2EquipmentId);
  }
  registeredIds.sort(compareEquipmentIds);
  return { registeredIds };
}

export function equipmentCodexSpBonusForCount(count: number): number {
  return EQUIPMENT_CODEX_SP_MILESTONES.filter((need) => count >= need).length;
}

export function nextEquipmentCodexMilestone(count: number): number | null {
  return EQUIPMENT_CODEX_SP_MILESTONES.find((need) => count < need) ?? null;
}

export function equipmentCodexSummary(raw: unknown) {
  const codex = parseEquipmentCodex(raw);
  const registeredCount = codex.registeredIds.length;
  return {
    registeredIds: codex.registeredIds,
    registeredCount,
    total: EQUIPMENT_CODEX_TOTAL,
    spBonus: equipmentCodexSpBonusForCount(registeredCount),
    milestones: [...EQUIPMENT_CODEX_SP_MILESTONES],
    nextMilestone: nextEquipmentCodexMilestone(registeredCount),
  };
}

export function countCraftOnlyEquipmentCodex(ids: Iterable<string>): number {
  let count = 0;
  for (const id of new Set(ids)) {
    if (
      VALID_EQUIPMENT_IDS.has(id) &&
      V2_EQUIPMENT[id as V2EquipmentId]?.craftOnly
    ) {
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

export function withRegisteredEquipmentId(
  raw: unknown,
  id: V2EquipmentId,
): { codex: EquipmentCodexState; added: boolean } {
  const codex = parseEquipmentCodex(raw);
  if (codex.registeredIds.includes(id)) return { codex, added: false };
  return {
    codex: parseEquipmentCodex({
      registeredIds: [...codex.registeredIds, id],
    }),
    added: true,
  };
}

function compareEquipmentIds(a: V2EquipmentId, b: V2EquipmentId): number {
  const ia = V2_EQUIPMENT[a];
  const ib = V2_EQUIPMENT[b];
  return (
    ia.tier - ib.tier ||
    ia.slot.localeCompare(ib.slot) ||
    ia.name.localeCompare(ib.name, "ko")
  );
}
