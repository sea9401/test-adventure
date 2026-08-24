import {
  V2_EQUIPMENT,
  effectiveStats,
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { enhancedPower } from "@/adventure/data/v2/v2Enhance";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";

export type EquipmentCodexBulkCandidate = {
  inst: V2EquipInstance;
  ownedCount: number;
};

export function compareEquipmentCodexCandidate(
  a: V2EquipInstance,
  b: V2EquipInstance,
): number {
  const itemA = V2_EQUIPMENT[a.id];
  const itemB = V2_EQUIPMENT[b.id];
  const enhanceA = a.enhance?.level ?? 0;
  const enhanceB = b.enhance?.level ?? 0;
  if (enhanceA !== enhanceB) return enhanceA - enhanceB;

  const qualityA = itemA ? (rollQualityPct(itemA, a.roll) ?? 50) : 50;
  const qualityB = itemB ? (rollQualityPct(itemB, b.roll) ?? 50) : 50;
  if (qualityA !== qualityB) return qualityA - qualityB;

  const powerA = itemA
    ? enhancedPower(effectiveStats(itemA, a.roll).power, a.enhance)
    : 0;
  const powerB = itemB
    ? enhancedPower(effectiveStats(itemB, b.roll).power, b.enhance)
    : 0;
  if (powerA !== powerB) return powerA - powerB;
  return a.iid.localeCompare(b.iid);
}

export function selectEquipmentCodexBulkCandidates({
  owned,
  equipped,
  registeredIds,
  slot,
}: {
  owned: readonly V2EquipInstance[];
  equipped: Partial<Record<V2EquipSlot, string>>;
  registeredIds: ReadonlySet<string>;
  slot: V2EquipSlot;
}): EquipmentCodexBulkCandidate[] {
  const equippedIids = new Set(Object.values(equipped).filter(Boolean));
  const ownedCounts = new Map<string, number>();
  const eligible = new Map<string, V2EquipInstance[]>();

  for (const inst of owned) {
    const item = V2_EQUIPMENT[inst.id];
    if (!item || item.slot !== slot) continue;
    ownedCounts.set(inst.id, (ownedCounts.get(inst.id) ?? 0) + 1);
    if (
      registeredIds.has(inst.id) ||
      inst.locked ||
      equippedIids.has(inst.iid)
    ) {
      continue;
    }
    const instances = eligible.get(inst.id) ?? [];
    instances.push(inst);
    eligible.set(inst.id, instances);
  }

  return [...eligible.entries()]
    .map(([itemId, instances]) => ({
      inst: [...instances].sort(compareEquipmentCodexCandidate)[0],
      ownedCount: ownedCounts.get(itemId) ?? instances.length,
    }))
    .filter(
      (candidate): candidate is EquipmentCodexBulkCandidate =>
        candidate.inst !== undefined,
    )
    .sort((a, b) => {
      const itemA = V2_EQUIPMENT[a.inst.id];
      const itemB = V2_EQUIPMENT[b.inst.id];
      return (
        itemA.tier - itemB.tier ||
        itemA.name.localeCompare(itemB.name, "ko") ||
        a.inst.iid.localeCompare(b.inst.iid)
      );
    });
}
