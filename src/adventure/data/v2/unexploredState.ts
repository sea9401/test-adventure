import {
  parseUnexploredTraces,
  type UnexploredTraceState,
} from "./unexploredRewards";
import {
  isUnexploredNodeId,
  type UnexploredNodeId,
} from "./unexploredTree";

export const UNEXPLORED_ACHIEVEMENT_IDS = [
  "boss_kinds_1",
  "boss_kinds_3",
  "boss_kinds_6",
  "boss_kinds_9",
  "boss_kinds_12",
  "first_unexplored_hunt",
  "first_special_kill",
  "first_summon_stone_craft",
  "activate_two_pools",
  "activate_three_pools",
] as const;

export type UnexploredAchievementId =
  (typeof UNEXPLORED_ACHIEVEMENT_IDS)[number];

export type UnexploredCraftReceipt = {
  requestId: string;
  bossId: string;
  craftedAt: number;
};

export type UnexploredSave = {
  explorationXp: number;
  xpPoints: number;
  achievementIds: UnexploredAchievementId[];
  selectedNodeIds: UnexploredNodeId[];
  traces: UnexploredTraceState;
  craftReceipts: UnexploredCraftReceipt[];
};

const achievementIdSet = new Set<string>(UNEXPLORED_ACHIEVEMENT_IDS);
const MAX_XP_POINTS = 30;
const MAX_ACHIEVEMENT_POINTS = 10;
const MAX_CRAFT_RECEIPTS = 50;

function nonNegativeInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(maximum, Math.floor(number));
}

function uniqueKnownValues<T extends string>(
  raw: unknown,
  isKnown: (value: unknown) => value is T,
): T[] {
  if (!Array.isArray(raw)) return [];
  const values: T[] = [];
  const seen = new Set<T>();
  for (const value of raw) {
    if (!isKnown(value) || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

function isAchievementId(value: unknown): value is UnexploredAchievementId {
  return typeof value === "string" && achievementIdSet.has(value);
}

function parseCraftReceipts(raw: unknown): UnexploredCraftReceipt[] {
  if (!Array.isArray(raw)) return [];
  const receipts = raw.flatMap((entry): UnexploredCraftReceipt[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const source = entry as Record<string, unknown>;
    const requestId = typeof source.requestId === "string"
      ? source.requestId.trim()
      : "";
    const bossId = typeof source.bossId === "string" ? source.bossId.trim() : "";
    const craftedAt = Number(source.craftedAt);
    return requestId && bossId && Number.isFinite(craftedAt) && craftedAt >= 0
      ? [{ requestId, bossId, craftedAt: Math.floor(craftedAt) }]
      : [];
  });

  const latestByRequestId = new Map<string, UnexploredCraftReceipt>();
  for (const receipt of receipts) latestByRequestId.set(receipt.requestId, receipt);
  return [...latestByRequestId.values()].slice(-MAX_CRAFT_RECEIPTS);
}

export function emptyUnexploredSave(): UnexploredSave {
  return {
    explorationXp: 0,
    xpPoints: 0,
    achievementIds: [],
    selectedNodeIds: [],
    traces: {},
    craftReceipts: [],
  };
}

export function parseUnexploredSave(raw: unknown): UnexploredSave {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyUnexploredSave();
  }
  const source = raw as Record<string, unknown>;
  return {
    explorationXp: nonNegativeInteger(source.explorationXp),
    xpPoints: nonNegativeInteger(source.xpPoints, MAX_XP_POINTS),
    achievementIds: uniqueKnownValues(source.achievementIds, isAchievementId),
    selectedNodeIds: uniqueKnownValues(source.selectedNodeIds, isUnexploredNodeId),
    traces: parseUnexploredTraces(source.traces),
    craftReceipts: parseCraftReceipts(source.craftReceipts),
  };
}

export function unexploredEarnedPoints(
  level: number,
  save: UnexploredSave,
): number {
  const levelPoint = Number(level) >= 100 ? 1 : 0;
  const xpPoints = Math.min(
    MAX_XP_POINTS,
    Math.max(nonNegativeInteger(save.xpPoints), levelPoint),
  );
  return xpPoints + Math.min(MAX_ACHIEVEMENT_POINTS, save.achievementIds.length);
}

export function canChangeUnexploredNodes(level: number): boolean {
  return Number(level) >= 100;
}

export function canUseUnexplored(
  level: number,
  save: UnexploredSave,
): boolean {
  return canChangeUnexploredNodes(level) && save.selectedNodeIds.includes("start");
}
