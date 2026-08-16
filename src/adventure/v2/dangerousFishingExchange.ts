import {
  DANGEROUS_FISH,
  dangerousBossMaterialId,
  dangerousCatchMaterialId,
  type DangerousBaitId,
  type DangerousFishRarity,
  type DangerousGearKind,
  type DangerousLineId,
  type DangerousReelId,
  type DangerousRodId,
} from "@/adventure/data/v2/dangerousFishing";

export const DANGEROUS_TIDAL_TITLE_ID = "dangerous_tidal_conqueror";
export const DANGEROUS_ABYSS_TITLE_ID = "dangerous_abyss_conqueror";
export const DANGEROUS_ABYSSAL_PROFILE_BORDER_ITEM_ID =
  "dangerous_abyssal_profile_border";

export type DangerousFishingExchangeOutput =
  | { kind: "bait"; baitId: DangerousBaitId; count: number }
  | {
      kind: "gear";
      gearKind: DangerousGearKind;
      gearId: DangerousRodId | DangerousReelId | DangerousLineId;
    }
  | { kind: "title"; titleId: string }
  | { kind: "cosmetic"; itemId: string };

export type DangerousFishingExchangeCost =
  | { kind: "catch"; rarity: DangerousFishRarity; count: number }
  | {
      kind: "materials";
      materials: Record<string, number>;
      fishingCoins: number;
    };

export type DangerousFishingExchangeEntry = {
  id: string;
  name: string;
  description: string;
  cost: DangerousFishingExchangeCost;
  output: DangerousFishingExchangeOutput;
  repeatable: boolean;
};

const tidalTokenId = dangerousBossMaterialId("tidal_colossus");
const abyssTokenId = dangerousBossMaterialId("abyss_kraken");

export const DANGEROUS_FISHING_EXCHANGE_ENTRIES: readonly DangerousFishingExchangeEntry[] = [
  {
    id: "catch_common_to_reef_bait",
    name: "일반 어획물 납품",
    description: "일반 위험 해역 어획물을 암초 향 미끼로 바꿉니다.",
    cost: { kind: "catch", rarity: "common", count: 4 },
    output: { kind: "bait", baitId: "reef_bait", count: 5 },
    repeatable: true,
  },
  {
    id: "catch_rare_to_blood_bait",
    name: "희귀 어획물 납품",
    description: "희귀 위험 해역 어획물을 핏빛 미끼로 바꿉니다.",
    cost: { kind: "catch", rarity: "rare", count: 4 },
    output: { kind: "bait", baitId: "blood_bait", count: 5 },
    repeatable: true,
  },
  {
    id: "catch_epic_to_luminous_bait",
    name: "영웅 어획물 납품",
    description: "영웅 위험 해역 어획물을 발광 미끼로 바꿉니다.",
    cost: { kind: "catch", rarity: "epic", count: 3 },
    output: { kind: "bait", baitId: "luminous_bait", count: 5 },
    repeatable: true,
  },
  {
    id: "catch_legendary_to_abyss_bait",
    name: "전설 어획물 납품",
    description: "전설 위험 해역 어획물을 심연 응축 미끼로 바꿉니다.",
    cost: { kind: "catch", rarity: "legendary", count: 2 },
    output: { kind: "bait", baitId: "abyss_bait", count: 5 },
    repeatable: true,
  },
  {
    id: "token_maelstrom_reel",
    name: "대소용돌이 릴 증표 교환",
    description: "해일의 거신 증표로 대소용돌이 릴을 할인 교환합니다.",
    cost: {
      kind: "materials",
      materials: { [tidalTokenId]: 8 },
      fishingCoins: 20_000,
    },
    output: { kind: "gear", gearKind: "reel", gearId: "maelstrom_reel" },
    repeatable: false,
  },
  {
    id: "token_abyss_chain_line",
    name: "심연 사슬줄 증표 교환",
    description: "심연 크라켄 증표로 심연 사슬줄을 할인 교환합니다.",
    cost: {
      kind: "materials",
      materials: { [abyssTokenId]: 8 },
      fishingCoins: 35_000,
    },
    output: {
      kind: "gear",
      gearKind: "line",
      gearId: "abyss_chain_line",
    },
    repeatable: false,
  },
  {
    id: "token_leviathan_rod",
    name: "레비아탄 낚싯대 증표 교환",
    description: "두 거대어 증표로 레비아탄 낚싯대를 할인 교환합니다.",
    cost: {
      kind: "materials",
      materials: { [tidalTokenId]: 8, [abyssTokenId]: 4 },
      fishingCoins: 40_000,
    },
    output: { kind: "gear", gearKind: "rod", gearId: "leviathan_rod" },
    repeatable: false,
  },
  {
    id: "token_tidal_title",
    name: "파도를 거둔 자",
    description: "해일의 거신 공동 제압을 기념하는 칭호입니다.",
    cost: {
      kind: "materials",
      materials: { [tidalTokenId]: 10 },
      fishingCoins: 0,
    },
    output: { kind: "title", titleId: DANGEROUS_TIDAL_TITLE_ID },
    repeatable: false,
  },
  {
    id: "token_abyss_title",
    name: "심연을 낚은 자",
    description: "심연 크라켄 공동 제압을 기념하는 칭호입니다.",
    cost: {
      kind: "materials",
      materials: { [abyssTokenId]: 10 },
      fishingCoins: 0,
    },
    output: { kind: "title", titleId: DANGEROUS_ABYSS_TITLE_ID },
    repeatable: false,
  },
  {
    id: "token_abyssal_border",
    name: "심해의 지배자",
    description: "두 거대어의 잔광을 담은 영구 프로필 테두리입니다.",
    cost: {
      kind: "materials",
      materials: { [tidalTokenId]: 15, [abyssTokenId]: 15 },
      fishingCoins: 0,
    },
    output: {
      kind: "cosmetic",
      itemId: DANGEROUS_ABYSSAL_PROFILE_BORDER_ITEM_ID,
    },
    repeatable: false,
  },
  {
    id: "token_tidal_to_luminous_bait",
    name: "해일 증표 미끼 교환",
    description: "남은 해일의 거신 증표를 발광 미끼로 바꿉니다.",
    cost: {
      kind: "materials",
      materials: { [tidalTokenId]: 1 },
      fishingCoins: 0,
    },
    output: { kind: "bait", baitId: "luminous_bait", count: 5 },
    repeatable: true,
  },
  {
    id: "token_abyss_to_abyss_bait",
    name: "심연 증표 미끼 교환",
    description: "남은 심연 크라켄 증표를 심연 응축 미끼로 바꿉니다.",
    cost: {
      kind: "materials",
      materials: { [abyssTokenId]: 1 },
      fishingCoins: 0,
    },
    output: { kind: "bait", baitId: "abyss_bait", count: 5 },
    repeatable: true,
  },
];

export const DANGEROUS_FISHING_EXCHANGE_ENTRY_BY_ID = new Map(
  DANGEROUS_FISHING_EXCHANGE_ENTRIES.map((entry) => [entry.id, entry]),
);

const fishEntries = Object.values(DANGEROUS_FISH);
const fishByMaterialId = new Map(
  fishEntries.map((fish, index) => [
    dangerousCatchMaterialId(fish.id),
    { fish, index },
  ]),
);

export function eligibleCatchMaterialIds(
  rarity: DangerousFishRarity,
): string[] {
  return fishEntries
    .filter((fish) => fish.rarity === rarity)
    .map((fish) => dangerousCatchMaterialId(fish.id));
}

export function selectCatchMaterials(
  rarity: DangerousFishRarity,
  materials: Readonly<Record<string, number>>,
  requiredCount: number,
): Record<string, number> {
  if (!Number.isSafeInteger(requiredCount) || requiredCount <= 0) return {};
  const candidates = eligibleCatchMaterialIds(rarity)
    .map((materialId) => {
      const quantity = materials[materialId] ?? 0;
      const definition = fishByMaterialId.get(materialId);
      return { materialId, quantity, definition };
    })
    .filter(
      (candidate) =>
        candidate.definition &&
        Number.isSafeInteger(candidate.quantity) &&
        candidate.quantity > 0,
    )
    .sort((a, b) => {
      if (a.quantity !== b.quantity) return b.quantity - a.quantity;
      const valueDiff =
        a.definition!.fish.cargoValue - b.definition!.fish.cargoValue;
      return valueDiff !== 0
        ? valueDiff
        : a.definition!.index - b.definition!.index;
    });

  const selected: Record<string, number> = {};
  let remaining = requiredCount;
  for (const candidate of candidates) {
    const quantity = Math.min(candidate.quantity, remaining);
    if (quantity > 0) selected[candidate.materialId] = quantity;
    remaining -= quantity;
    if (remaining === 0) return selected;
  }
  return {};
}

export function validateCatchSelection(
  rarity: DangerousFishRarity,
  requiredCount: number,
  selected: Readonly<Record<string, number>>,
): boolean {
  if (!Number.isSafeInteger(requiredCount) || requiredCount <= 0) return false;
  const eligible = new Set(eligibleCatchMaterialIds(rarity));
  let total = 0;
  for (const [materialId, quantity] of Object.entries(selected)) {
    if (
      !eligible.has(materialId) ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    ) {
      return false;
    }
    total += quantity;
  }
  return total === requiredCount;
}
