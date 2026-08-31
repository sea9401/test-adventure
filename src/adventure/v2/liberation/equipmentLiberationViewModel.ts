import {
  canLiberateEquipment,
  EQUIPMENT_LIBERATION_LEVEL_DISTRIBUTIONS,
  formatLiberationOptionRoll,
  type LiberationLineCount,
  type LiberationRank,
} from "@/adventure/data/v2/equipmentLiberation";
import {
  EQUIPMENT_LIBERATION_POOLS,
  firstLineProbability,
  type LiberationOptionId,
} from "@/adventure/data/v2/equipmentLiberationCatalog";
import {
  V2_EQUIPMENT,
  v2EquipCatalogTierToDisplayTier,
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";

const SLOT_ORDER: readonly V2EquipSlot[] = [
  "weapon",
  "armor",
  "gloves",
  "boots",
  "ring",
  "necklace",
];

export const LIBERATION_LINE_COUNT_CHANCES: readonly {
  lineCount: LiberationLineCount;
  chancePct: number;
}[] = [
  { lineCount: 1, chancePct: 50 },
  { lineCount: 2, chancePct: 35 },
  { lineCount: 3, chancePct: 15 },
];

const RANK_LEVEL_SUMMARIES: Record<LiberationRank, string> = {
  3: "해방 3 · Lv.1~5",
  2: "해방 2 · Lv.5~10",
  1: "해방 1 · Lv.10~20",
};

export function liberationPromotionChancePct(rank: LiberationRank): number {
  return rank === 3 ? 5 : rank === 2 ? 1 : 0;
}

export function liberationRankLevelSummary(rank: LiberationRank): string {
  return RANK_LEVEL_SUMMARIES[rank];
}

export function liberationRankLevelDistribution(
  rank: LiberationRank,
): readonly { level: number; chancePct: number }[] {
  return EQUIPMENT_LIBERATION_LEVEL_DISTRIBUTIONS[rank].map(
    ([level, chancePct]) => ({ level, chancePct }),
  );
}

export { formatLiberationOptionRoll };

export type LiberationCandidateRow = {
  iid: string;
  item: V2EquipInstance;
  name: string;
  slot: V2EquipSlot;
  displayTier: number;
  isEquipped: boolean;
  rank?: LiberationRank;
  lineCount?: LiberationLineCount;
};

export function liberationCandidateRows(
  owned: readonly V2EquipInstance[],
  equipped: Partial<Record<V2EquipSlot, string>>,
): LiberationCandidateRow[] {
  const equippedIids = new Set(Object.values(equipped));
  return owned
    .flatMap((instance) => {
      const item = V2_EQUIPMENT[instance.id];
      if (!item || !canLiberateEquipment(item, instance)) return [];
      return [
        {
          iid: instance.iid,
          item: instance,
          name: item.name,
          slot: item.slot,
          displayTier: v2EquipCatalogTierToDisplayTier(item.tier),
          isEquipped: equippedIids.has(instance.iid),
          rank: instance.liberation?.rank,
          lineCount: instance.liberation?.lineCount,
        },
      ];
    })
    .sort((left, right) =>
      Number(right.isEquipped) - Number(left.isEquipped) ||
      SLOT_ORDER.indexOf(left.slot) - SLOT_ORDER.indexOf(right.slot) ||
      left.name.localeCompare(right.name, "ko"),
    );
}

export type LiberationOptionProbabilityRow = {
  id: LiberationOptionId;
  label: string;
  weight: number;
  firstLineChancePct: number;
};

export function liberationOptionProbabilityRows(
  slot: V2EquipSlot,
): LiberationOptionProbabilityRow[] {
  return EQUIPMENT_LIBERATION_POOLS[slot].map((option) => ({
    id: option.id,
    label: option.label,
    weight: option.weight,
    firstLineChancePct: firstLineProbability(slot, option.id) * 100,
  }));
}
