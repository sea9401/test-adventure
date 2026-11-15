import {
  parseUnexploredTraces,
  type UnexploredTraceState,
} from "./unexploredRewards";
import {
  UNEXPLORED_BOSS_IDS,
  unexploredBossEquipmentCraftRecipe,
  type UnexploredBossId,
} from "./unexploredBosses";
import {
  UNEXPLORED_MAX_DIFFICULTY,
  isUnexploredDifficultyCap,
  isUnexploredNodeId,
  type UnexploredNodeId,
} from "./unexploredTree";
import {
  EXPLORATION_MAX_XP_POINTS,
  explorationGrade,
  explorationGradeBonusPoints,
} from "./unexploredGrade";
import type { V2EquipmentId } from "./v2Equipment";

type UnexploredBossAchievementId = `defeat_${UnexploredBossId}`;

const UNEXPLORED_BOSS_ACHIEVEMENT_IDS = UNEXPLORED_BOSS_IDS.map(
  (bossId): UnexploredBossAchievementId => `defeat_${bossId}`,
);

export const UNEXPLORED_ACHIEVEMENT_IDS = [
  "first_personal_boss",
  ...UNEXPLORED_BOSS_ACHIEVEMENT_IDS,
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

// 프리셋은 다섯 칸이다. 넷째·다섯째 칸은 탐사 등급으로 열린다(unexploredGrade.ts).
export const UNEXPLORED_PRESET_INDEXES = [0, 1, 2, 3, 4] as const;
export type UnexploredPresetIndex = (typeof UNEXPLORED_PRESET_INDEXES)[number];
/** 프리셋 칸마다의 노드 배분. 읽은 세이브는 항상 UNEXPLORED_PRESET_INDEXES 길이다. */
export type UnexploredNodePresets = UnexploredNodeId[][];
/** 프리셋마다 이용자가 고른 최대 난이도. 길이는 프리셋 칸 수와 같다. */
export type UnexploredDifficultyCaps = number[];

export function isUnexploredPresetIndex(value: unknown): value is UnexploredPresetIndex {
  return (UNEXPLORED_PRESET_INDEXES as readonly unknown[]).includes(value);
}

export type UnexploredSave = {
  explorationXp: number;
  explorationProgressVersion: 2;
  xpPoints: number;
  achievementIds: UnexploredAchievementId[];
  selectedNodeIds: UnexploredNodeId[];
  activePresetIndex: UnexploredPresetIndex;
  nodePresets: UnexploredNodePresets;
  difficultyCaps: UnexploredDifficultyCaps;
  traces: UnexploredTraceState;
  craftReceipts: UnexploredCraftReceipt[];
  equipmentCraftReceipts: UnexploredEquipmentCraftReceipt[];
};

const achievementIdSet = new Set<string>(UNEXPLORED_ACHIEVEMENT_IDS);
const MAX_XP_POINTS = EXPLORATION_MAX_XP_POINTS;
// 업적마다 1포인트. 보스 업적이 늘면 상한도 함께 늘어나도록 목록 길이를 쓴다.
const MAX_ACHIEVEMENT_POINTS = UNEXPLORED_ACHIEVEMENT_IDS.length;
const MAX_CRAFT_RECEIPTS = 50;
const EXPLORATION_PROGRESS_VERSION = 2;
// v1은 사냥 EXP 원값을 저장했다. 운영 기본 배율에서 미개척지 1승이 3,300 EXP였으므로
// 남은 진행도만 승리 단위로 환산하고, 이미 획득한 xpPoints는 그대로 보존한다.
const LEGACY_EXPLORATION_XP_PER_WIN = 3_300;

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

function parseDifficultyCaps(raw: unknown): UnexploredDifficultyCaps {
  const source = Array.isArray(raw) ? raw : [];
  const cap = (value: unknown) =>
    isUnexploredDifficultyCap(value) ? value : UNEXPLORED_MAX_DIFFICULTY;
  return UNEXPLORED_PRESET_INDEXES.map((index) => cap(source[index]));
}

/** 지금 쓰는 프리셋에 적용되는 최대 난이도. */
export function unexploredDifficultyCap(
  save: Pick<UnexploredSave, "activePresetIndex" | "difficultyCaps">,
): number {
  return save.difficultyCaps[save.activePresetIndex];
}

export function emptyUnexploredSave(): UnexploredSave {
  return {
    explorationXp: 0,
    explorationProgressVersion: EXPLORATION_PROGRESS_VERSION,
    xpPoints: 0,
    achievementIds: [],
    selectedNodeIds: [],
    activePresetIndex: 0,
    nodePresets: UNEXPLORED_PRESET_INDEXES.map(() => []),
    difficultyCaps: UNEXPLORED_PRESET_INDEXES.map(() => UNEXPLORED_MAX_DIFFICULTY),
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
  const activePresetIndex = isUnexploredPresetIndex(source.activePresetIndex)
    ? source.activePresetIndex
    : 0;
  const rawPresets = Array.isArray(source.nodePresets) ? source.nodePresets : [];
  const nodePresets: UnexploredNodePresets = UNEXPLORED_PRESET_INDEXES.map((index) =>
    uniqueKnownValues(rawPresets[index], isUnexploredNodeId),
  );
  // Keep the existing active-allocation field authoritative for hunt/progression
  // writers, and migrate legacy allocations into the default first slot.
  const selectedNodeIds = uniqueKnownValues(
    source.selectedNodeIds ?? nodePresets[activePresetIndex],
    isUnexploredNodeId,
  );
  nodePresets[activePresetIndex] = [...selectedNodeIds];
  const rawExplorationXp = nonNegativeInteger(source.explorationXp);
  const explorationXp =
    source.explorationProgressVersion === EXPLORATION_PROGRESS_VERSION
      ? rawExplorationXp
      : Math.floor(rawExplorationXp / LEGACY_EXPLORATION_XP_PER_WIN);
  return {
    explorationXp,
    explorationProgressVersion: EXPLORATION_PROGRESS_VERSION,
    xpPoints: nonNegativeInteger(source.xpPoints, MAX_XP_POINTS),
    achievementIds: uniqueKnownValues(source.achievementIds, isAchievementId),
    selectedNodeIds,
    activePresetIndex,
    nodePresets,
    difficultyCaps: parseDifficultyCaps(source.difficultyCaps),
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
  return (
    xpPoints +
    Math.min(MAX_ACHIEVEMENT_POINTS, save.achievementIds.length) +
    explorationGradeBonusPoints(explorationGrade(save))
  );
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
