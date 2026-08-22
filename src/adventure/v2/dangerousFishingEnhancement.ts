import {
  isDangerousLineId,
  isDangerousReelId,
  isDangerousRodId,
  type DangerousFishRarity,
  type DangerousGearKind,
  type DangerousLineId,
  type DangerousReelId,
  type DangerousRodId,
} from "@/adventure/data/v2/dangerousFishing";
import { selectCatchMaterials } from "./dangerousFishingExchange";
import type {
  DangerousFishingState,
  DangerousGearEnhancements,
} from "./dangerousFishingState";

export type { DangerousGearEnhancements } from "./dangerousFishingState";

export type DangerousGearEnhancementLevel = 1 | 2 | 3;

export const DANGEROUS_GEAR_ENHANCEMENT_COSTS = {
  1: {
    materials: { common: 6, rare: 4 },
    fishingCoins: 1_000,
  },
  2: {
    materials: { rare: 8, epic: 5 },
    fishingCoins: 3_000,
  },
  3: {
    materials: { epic: 8, legendary: 3 },
    fishingCoins: 8_000,
  },
} as const satisfies Record<
  DangerousGearEnhancementLevel,
  {
    materials: Partial<Record<DangerousFishRarity, number>>;
    fishingCoins: number;
  }
>;

type DangerousGearId = DangerousRodId | DangerousReelId | DangerousLineId;

type EnhancementSource =
  | DangerousGearEnhancements
  | Pick<DangerousFishingState, "gearEnhancements">;

type EnhancementFunding = {
  fishingCoins: number;
  materials: Readonly<Record<string, number>>;
};

type EnhancementFailure = {
  ok: false;
  error:
    | "invalid_kind"
    | "invalid_item"
    | "not_owned"
    | "max_level"
    | "invalid_level"
    | "insufficient_fishing_coins"
    | "insufficient_materials";
};

type EnhancementSuccess = {
  ok: true;
  state: DangerousFishingState;
  nextLevel: DangerousGearEnhancementLevel;
  selectedMaterials?: Record<string, number>;
  fishingCoins?: number;
  materials?: Record<string, number>;
};

export type DangerousGearEnhancementResult =
  | EnhancementFailure
  | EnhancementSuccess;

function enhancementLevels(source: EnhancementSource): DangerousGearEnhancements {
  return "gearEnhancements" in source ? source.gearEnhancements : source;
}

function enhancementLevel(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(3, Math.floor(value)));
}

function validGearId(kind: unknown, gearId: unknown): gearId is DangerousGearId {
  if (kind === "rod") return isDangerousRodId(gearId);
  if (kind === "reel") return isDangerousReelId(gearId);
  if (kind === "line") return isDangerousLineId(gearId);
  return false;
}

export function dangerousGearEnhancementLevel(
  source: EnhancementSource,
  kind: unknown,
  gearId: unknown,
): number {
  if (!validGearId(kind, gearId)) return 0;
  const enhancements = enhancementLevels(source);
  if (kind === "rod") {
    return enhancementLevel(enhancements.rods[gearId as DangerousRodId]);
  }
  if (kind === "reel") {
    return enhancementLevel(enhancements.reels[gearId as DangerousReelId]);
  }
  return enhancementLevel(enhancements.lines[gearId as DangerousLineId]);
}

function enhancementCost(
  nextLevel: number,
): (typeof DANGEROUS_GEAR_ENHANCEMENT_COSTS)[DangerousGearEnhancementLevel] | null {
  if (nextLevel !== 1 && nextLevel !== 2 && nextLevel !== 3) return null;
  return DANGEROUS_GEAR_ENHANCEMENT_COSTS[nextLevel];
}

export function selectEnhancementMaterials(
  materials: Readonly<Record<string, number>>,
  nextLevel: number,
): Record<string, number> | null {
  const cost = enhancementCost(nextLevel);
  if (!cost) return null;

  const selected: Record<string, number> = {};
  for (const [rarity, count] of Object.entries(cost.materials) as [
    DangerousFishRarity,
    number,
  ][]) {
    const raritySelection = selectCatchMaterials(rarity, materials, count);
    if (Object.values(raritySelection).reduce((sum, value) => sum + value, 0) !== count) {
      return null;
    }
    Object.assign(selected, raritySelection);
  }
  return selected;
}

function isOwned(
  state: DangerousFishingState,
  kind: DangerousGearKind,
  gearId: DangerousGearId,
): boolean {
  if (kind === "rod") return state.ownedGear.rods.includes(gearId as DangerousRodId);
  if (kind === "reel") return state.ownedGear.reels.includes(gearId as DangerousReelId);
  return state.ownedGear.lines.includes(gearId as DangerousLineId);
}

function withEnhancement(
  state: DangerousFishingState,
  kind: DangerousGearKind,
  gearId: DangerousGearId,
  nextLevel: DangerousGearEnhancementLevel,
): DangerousFishingState {
  const gearEnhancements: DangerousGearEnhancements = {
    rods: { ...state.gearEnhancements.rods },
    reels: { ...state.gearEnhancements.reels },
    lines: { ...state.gearEnhancements.lines },
  };
  if (kind === "rod") gearEnhancements.rods[gearId as DangerousRodId] = nextLevel;
  else if (kind === "reel") gearEnhancements.reels[gearId as DangerousReelId] = nextLevel;
  else gearEnhancements.lines[gearId as DangerousLineId] = nextLevel;
  return { ...state, gearEnhancements };
}

function subtractMaterials(
  materials: Readonly<Record<string, number>>,
  selected: Readonly<Record<string, number>>,
): Record<string, number> {
  const next = { ...materials };
  for (const [materialId, count] of Object.entries(selected)) {
    const remaining = (next[materialId] ?? 0) - count;
    if (remaining > 0) next[materialId] = remaining;
    else next[materialId] = 0;
  }
  return next;
}

export function enhanceDangerousGear(
  state: DangerousFishingState,
  requestedNextLevel: number,
  kind: unknown,
  gearId: unknown,
  funding?: EnhancementFunding,
): DangerousGearEnhancementResult {
  if (kind !== "rod" && kind !== "reel" && kind !== "line") {
    return { ok: false, error: "invalid_kind" };
  }
  if (!validGearId(kind, gearId)) return { ok: false, error: "invalid_item" };
  if (!isOwned(state, kind, gearId)) return { ok: false, error: "not_owned" };

  const currentLevel = dangerousGearEnhancementLevel(state, kind, gearId);
  if (currentLevel >= 3) return { ok: false, error: "max_level" };
  if (requestedNextLevel !== currentLevel + 1) {
    return { ok: false, error: "invalid_level" };
  }
  const nextLevel = requestedNextLevel as DangerousGearEnhancementLevel;

  let selectedMaterials: Record<string, number> | undefined;
  if (funding) {
    const cost = DANGEROUS_GEAR_ENHANCEMENT_COSTS[nextLevel];
    if (
      !Number.isSafeInteger(funding.fishingCoins) ||
      funding.fishingCoins < cost.fishingCoins
    ) {
      return { ok: false, error: "insufficient_fishing_coins" };
    }
    selectedMaterials = selectEnhancementMaterials(funding.materials, nextLevel) ?? undefined;
    if (!selectedMaterials) return { ok: false, error: "insufficient_materials" };
  }

  const nextState = withEnhancement(state, kind, gearId, nextLevel);
  if (!funding || !selectedMaterials) {
    return { ok: true, state: nextState, nextLevel };
  }
  return {
    ok: true,
    state: nextState,
    nextLevel,
    selectedMaterials,
    fishingCoins:
      funding.fishingCoins - DANGEROUS_GEAR_ENHANCEMENT_COSTS[nextLevel].fishingCoins,
    materials: subtractMaterials(funding.materials, selectedMaterials),
  };
}
