import {
  parseUnexploredTraces,
  type UnexploredTraceState,
} from "./unexploredRewards";
import { unexploredBossEquipmentCraftRecipe } from "./unexploredBosses";
import {
  isUnexploredNodeId,
  type UnexploredNodeId,
} from "./unexploredTree";
import type { V2EquipmentId } from "./v2Equipment";

export const UNEXPLORED_ACHIEVEMENT_IDS = [
  "first_personal_boss",
  "defeat_tracking_weapon",
  "defeat_toxic_blood_lord",
  "defeat_glacial_colossus",
  "defeat_invincible_fortress",
  "defeat_all_personal_bosses",
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
  baseGoldCost?: number;
  goldCost?: number;
  liberationDiscountPct?: number;
};

export type UnexploredEquipmentCraftReceipt = {
  requestId: string;
  equipmentId: V2EquipmentId;
  equipmentIid: string;
  craftedAt: number;
};

export type UnexploredSave = {
  explorationXp: number;
  xpPoints: number;
  achievementIds: UnexploredAchievementId[];
  selectedNodeIds: UnexploredNodeId[];
  traces: UnexploredTraceState;
  craftReceipts: UnexploredCraftReceipt[];
  equipmentCraftReceipts: UnexploredEquipmentCraftReceipt[];
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
    const baseGoldCost = nonNegativeInteger(source.baseGoldCost);
    const goldCost = nonNegativeInteger(source.goldCost);
    const liberationDiscountPct = Math.min(
      100,
      nonNegativeInteger(source.liberationDiscountPct),
    );
    return requestId && bossId && Number.isFinite(craftedAt) && craftedAt >= 0
      ? [{
          requestId,
          bossId,
          craftedAt: Math.floor(craftedAt),
          ...(source.baseGoldCost != null ? { baseGoldCost } : {}),
          ...(source.goldCost != null ? { goldCost } : {}),
          ...(source.liberationDiscountPct != null
            ? { liberationDiscountPct }
            : {}),
        }]
      : [];
  });

  const latestByRequestId = new Map<string, UnexploredCraftReceipt>();
  for (const receipt of receipts) latestByRequestId.set(receipt.requestId, receipt);
  return [...latestByRequestId.values()].slice(-MAX_CRAFT_RECEIPTS);
}

function parseEquipmentCraftReceipts(
  raw: unknown,
): UnexploredEquipmentCraftReceipt[] {
  if (!Array.isArray(raw)) return [];
  const latestByRequestId = new Map<
    string,
    UnexploredEquipmentCraftReceipt
  >();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const source = entry as Record<string, unknown>;
    const requestId = typeof source.requestId === "string"
      ? source.requestId.trim()
      : "";
    const recipe = unexploredBossEquipmentCraftRecipe(source.equipmentId);
    const equipmentIid = typeof source.equipmentIid === "string"
      ? source.equipmentIid.trim()
      : "";
    const craftedAt = Number(source.craftedAt);
    if (
      !requestId ||
      !recipe ||
      !equipmentIid ||
      !Number.isFinite(craftedAt) ||
      craftedAt < 0
    ) {
      continue;
    }
    latestByRequestId.delete(requestId);
    latestByRequestId.set(requestId, {
      requestId,
      equipmentId: recipe.equipmentId,
      equipmentIid,
      craftedAt: Math.floor(craftedAt),
    });
  }
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
    equipmentCraftReceipts: [],
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
    equipmentCraftReceipts: parseEquipmentCraftReceipts(
      source.equipmentCraftReceipts,
    ),
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
