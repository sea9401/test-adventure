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
  effectiveStats,
  powerWithBonuses,
  v2EquipCatalogTierToDisplayTier,
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";

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
  3: "마법부여 1단계 · Lv.1~5",
  2: "마법부여 2단계 · Lv.5~10",
  1: "마법부여 3단계 · Lv.10~20",
};

export function enchantmentStage(rank: LiberationRank): 1 | 2 | 3 {
  return rank === 3 ? 1 : rank === 2 ? 2 : 3;
}

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
  acquiredIndex: number;
  qualityPct: number | null;
  effectivePower: number;
  stage: 0 | 1 | 2 | 3;
  rank?: LiberationRank;
  lineCount?: LiberationLineCount;
};

export type EnchantmentEquipmentSlotFilter = "all" | V2EquipSlot;

export type EnchantmentEquipmentSortMode =
  | "default"
  | "acquired"
  | "tier"
  | "roll"
  | "power"
  | "enchantment";

export const ENCHANTMENT_EQUIPMENT_SLOT_TABS: readonly {
  key: EnchantmentEquipmentSlotFilter;
  label: string;
}[] = [
  { key: "all", label: "전체" },
  { key: "weapon", label: "무기" },
  { key: "armor", label: "갑옷" },
  { key: "gloves", label: "장갑" },
  { key: "boots", label: "신발" },
  { key: "ring", label: "반지" },
  { key: "necklace", label: "목걸이" },
];

function compareLiberationCandidatesDefault(
  left: LiberationCandidateRow,
  right: LiberationCandidateRow,
): number {
  return (
    Number(right.isEquipped) - Number(left.isEquipped) ||
    SLOT_ORDER.indexOf(left.slot) - SLOT_ORDER.indexOf(right.slot) ||
    left.name.localeCompare(right.name, "ko") ||
    left.iid.localeCompare(right.iid)
  );
}

export function liberationCandidateRows(
  owned: readonly V2EquipInstance[],
  equipped: Partial<Record<V2EquipSlot, string>>,
): LiberationCandidateRow[] {
  const equippedIids = new Set(Object.values(equipped));
  return owned
    .flatMap((instance, acquiredIndex) => {
      const item = V2_EQUIPMENT[instance.id];
      if (!item || !canLiberateEquipment(item, instance)) return [];
      const rank = instance.liberation?.rank;
      const stage: LiberationCandidateRow["stage"] = rank
        ? enchantmentStage(rank)
        : 0;
      return [
        {
          iid: instance.iid,
          item: instance,
          name: item.name,
          slot: item.slot,
          displayTier: v2EquipCatalogTierToDisplayTier(item.tier),
          isEquipped: equippedIids.has(instance.iid),
          acquiredIndex,
          qualityPct: rollQualityPct(item, instance.roll),
          effectivePower: powerWithBonuses(
            effectiveStats(item, instance.roll).power,
            instance.enhance,
            instance.craftQuality,
          ),
          stage,
          rank,
          lineCount: instance.liberation?.lineCount,
        },
      ];
    })
    .sort(compareLiberationCandidatesDefault);
}

export function enchantmentCandidateCounts(
  rows: readonly LiberationCandidateRow[],
): Record<EnchantmentEquipmentSlotFilter, number> {
  const counts: Record<EnchantmentEquipmentSlotFilter, number> = {
    all: rows.length,
    weapon: 0,
    armor: 0,
    gloves: 0,
    boots: 0,
    ring: 0,
    necklace: 0,
  };
  for (const row of rows) counts[row.slot] += 1;
  return counts;
}

export function filterAndSortLiberationCandidates(
  rows: readonly LiberationCandidateRow[],
  controls: {
    query: string;
    slot: EnchantmentEquipmentSlotFilter;
    sort: EnchantmentEquipmentSortMode;
  },
): LiberationCandidateRow[] {
  const query = controls.query.trim().toLocaleLowerCase("ko");
  const filtered = rows.filter(
    (row) =>
      (controls.slot === "all" || row.slot === controls.slot) &&
      (!query || row.name.toLocaleLowerCase("ko").includes(query)),
  );
  return [...filtered].sort((left, right) => {
    let compared = 0;
    if (controls.sort === "acquired") {
      compared = right.acquiredIndex - left.acquiredIndex;
    } else if (controls.sort === "tier") {
      compared = right.displayTier - left.displayTier;
    } else if (controls.sort === "roll") {
      const leftQuality = left.qualityPct;
      const rightQuality = right.qualityPct;
      if (leftQuality == null && rightQuality != null) compared = 1;
      else if (leftQuality != null && rightQuality == null) compared = -1;
      else if (leftQuality != null && rightQuality != null) {
        compared = rightQuality - leftQuality;
      }
    } else if (controls.sort === "power") {
      compared = right.effectivePower - left.effectivePower;
    } else if (controls.sort === "enchantment") {
      compared = right.stage - left.stage;
    }
    return compared || compareLiberationCandidatesDefault(left, right);
  });
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
