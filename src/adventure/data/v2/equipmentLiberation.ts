import {
  v2EquipCatalogTierToDisplayTier,
  type V2EquipInstance,
  type V2EquipSlot,
  type V2Equipment,
} from "./v2Equipment";
import {
  EQUIPMENT_LIBERATION_POOLS,
  liberationOptionDefinition,
  type LiberationOptionId,
  type LiberationOptionUnit,
} from "./equipmentLiberationCatalog";

export type LiberationRank = 1 | 2 | 3;
export type LiberationLineCount = 1 | 2 | 3;
export type LiberationOptionRoll = {
  id: LiberationOptionId;
  level: number;
};
export type V2LiberationState = {
  rank: LiberationRank;
  lineCount: LiberationLineCount;
  revision: number;
  options: LiberationOptionRoll[];
};

export const EQUIPMENT_LIBERATION_GOLD_COST = 15_000_000;

export const EQUIPMENT_LIBERATION_LINE_COUNT_PROBABILITIES = {
  1: 0.5,
  2: 0.35,
  3: 0.15,
} as const satisfies Record<LiberationLineCount, number>;

export const EQUIPMENT_LIBERATION_PROMOTION_PROBABILITIES = {
  3: 0.05,
  2: 0.01,
} as const satisfies Record<2 | 3, number>;

export const EQUIPMENT_LIBERATION_LEVEL_DISTRIBUTIONS = {
  3: [
    [1, 24],
    [2, 22],
    [3, 20],
    [4, 18],
    [5, 16],
  ],
  2: [
    [5, 19],
    [6, 18],
    [7, 17],
    [8, 16],
    [9, 15],
    [10, 15],
  ],
  1: [
    [10, 10.2],
    [11, 10.2],
    [12, 10.2],
    [13, 10.2],
    [14, 10.2],
    [15, 9],
    [16, 9],
    [17, 9],
    [18, 8],
    [19, 8],
    [20, 6],
  ],
} as const satisfies Record<LiberationRank, readonly (readonly [number, number])[]>;

function randomUnit(rng: () => number): number {
  const value = Number(rng());
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, 1 - Number.EPSILON);
}

function rollLineCount(rng: () => number): LiberationLineCount {
  const roll = randomUnit(rng);
  if (roll < EQUIPMENT_LIBERATION_LINE_COUNT_PROBABILITIES[1]) return 1;
  if (
    roll <
    EQUIPMENT_LIBERATION_LINE_COUNT_PROBABILITIES[1] +
      EQUIPMENT_LIBERATION_LINE_COUNT_PROBABILITIES[2]
  ) return 2;
  return 3;
}

function rollLevel(rank: LiberationRank, rng: () => number): number {
  const roll = randomUnit(rng) * 100;
  let cumulative = 0;
  for (const [level, weight] of EQUIPMENT_LIBERATION_LEVEL_DISTRIBUTIONS[rank]) {
    cumulative += weight;
    if (roll < cumulative) return level;
  }
  return EQUIPMENT_LIBERATION_LEVEL_DISTRIBUTIONS[rank].at(-1)![0];
}

function rollOptions(
  slot: V2EquipSlot,
  lineCount: LiberationLineCount,
  rank: LiberationRank,
  rng: () => number,
): LiberationOptionRoll[] {
  const remaining = [...EQUIPMENT_LIBERATION_POOLS[slot]];
  const options: LiberationOptionRoll[] = [];
  for (let line = 0; line < lineCount; line += 1) {
    const totalWeight = remaining.reduce((sum, option) => sum + option.weight, 0);
    let target = randomUnit(rng) * totalWeight;
    let pickedIndex = remaining.length - 1;
    for (let index = 0; index < remaining.length; index += 1) {
      target -= remaining[index].weight;
      if (target < 0) {
        pickedIndex = index;
        break;
      }
    }
    const [picked] = remaining.splice(pickedIndex, 1);
    options.push({ id: picked.id, level: rollLevel(rank, rng) });
  }
  return options;
}

export function rollInitialLiberation(
  slot: V2EquipSlot,
  rng: () => number,
): V2LiberationState {
  const lineCount = rollLineCount(rng);
  return {
    rank: 3,
    lineCount,
    revision: 1,
    options: rollOptions(slot, lineCount, 3, rng),
  };
}

function promotedRank(rank: LiberationRank, rng: () => number): LiberationRank {
  if (rank === 3) {
    return randomUnit(rng) < EQUIPMENT_LIBERATION_PROMOTION_PROBABILITIES[3]
      ? 2
      : 3;
  }
  if (rank === 2) {
    return randomUnit(rng) < EQUIPMENT_LIBERATION_PROMOTION_PROBABILITIES[2]
      ? 1
      : 2;
  }
  return 1;
}

export function rerollLiberation(
  slot: V2EquipSlot,
  current: V2LiberationState,
  rng: () => number,
): V2LiberationState {
  const rank = promotedRank(current.rank, rng);
  return {
    rank,
    lineCount: current.lineCount,
    revision: current.revision + 1,
    options: rollOptions(slot, current.lineCount, rank, rng),
  };
}

function isIntegerUnit(unit: LiberationOptionUnit): boolean {
  return unit === "integer" || unit === "growth_range";
}

export function liberationOptionValue(
  id: LiberationOptionId,
  level: number,
): number {
  const definition = liberationOptionDefinition(id);
  const normalizedLevel = Math.max(1, Math.min(20, Math.floor(Number(level) || 1)));
  const scaled = (definition.maxValue * normalizedLevel) / 20;
  if (isIntegerUnit(definition.unit)) return Math.max(1, Math.round(scaled));
  return Number(scaled.toFixed(4));
}

function displayLiberationNumber(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString("ko-KR")
    : value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

export function formatLiberationOptionRoll(
  option: LiberationOptionRoll,
): string {
  const definition = liberationOptionDefinition(option.id);
  const value = displayLiberationNumber(
    liberationOptionValue(option.id, option.level),
  );
  const suffix =
    definition.unit === "integer"
      ? `+${value}`
      : definition.unit === "percentage_point"
        ? `+${value}%p`
        : definition.unit === "growth_range"
          ? `+0~${value}`
          : `+${value}%`;
  return `${definition.label} ${suffix}`;
}

function isRank(value: unknown): value is LiberationRank {
  return value === 1 || value === 2 || value === 3;
}

function isLineCount(value: unknown): value is LiberationLineCount {
  return value === 1 || value === 2 || value === 3;
}

function validLevelForRank(rank: LiberationRank, level: number): boolean {
  return EQUIPMENT_LIBERATION_LEVEL_DISTRIBUTIONS[rank].some(
    ([candidate]) => candidate === level,
  );
}

export function parseLiberationState(
  raw: unknown,
  slot: V2EquipSlot,
): V2LiberationState | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const rank = Number(value.rank);
  const lineCount = Number(value.lineCount);
  const revision = Number(value.revision);
  if (
    !isRank(rank) ||
    !isLineCount(lineCount) ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    !Array.isArray(value.options) ||
    value.options.length !== lineCount
  ) {
    return undefined;
  }

  const allowedIds = new Set(
    EQUIPMENT_LIBERATION_POOLS[slot].map((option) => option.id),
  );
  const usedIds = new Set<LiberationOptionId>();
  const options: LiberationOptionRoll[] = [];
  for (const rawOption of value.options) {
    if (!rawOption || typeof rawOption !== "object" || Array.isArray(rawOption)) {
      return undefined;
    }
    const option = rawOption as Record<string, unknown>;
    const id = option.id;
    const level = Number(option.level);
    if (
      typeof id !== "string" ||
      !allowedIds.has(id as LiberationOptionId) ||
      usedIds.has(id as LiberationOptionId) ||
      !Number.isInteger(level) ||
      !validLevelForRank(rank, level)
    ) {
      return undefined;
    }
    usedIds.add(id as LiberationOptionId);
    options.push({ id: id as LiberationOptionId, level });
  }

  return { rank, lineCount, revision, options };
}

export function canLiberateEquipment(
  item: V2Equipment,
  instance: V2EquipInstance,
): boolean {
  return (
    v2EquipCatalogTierToDisplayTier(item.tier) >= 6 &&
    instance.stormRefined !== true
  );
}
