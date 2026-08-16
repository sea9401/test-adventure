// 자동 벌목 세션 — 서버 완료 시각이 지난 뒤에만 통나무 1개를 지급한다.

import {
  WOODCUTTING_SPOTS,
  WOODCUTTING_MATERIALS,
  WOODCUTTING_TREES,
  isWoodcuttingSpotId,
  type WoodcuttingMaterialId,
  type WoodcuttingSpotId,
  type WoodcuttingTreeId,
} from "@/adventure/data/v2/woodcuttingSpots";
import {
  WOODCUTTING_XP_PER_CUT,
  woodcuttingFailureRate,
  woodcuttingXpForLevel,
} from "./woodcuttingProgression";
import {
  LIFE_LEVEL_CURVE_VERSION,
  applyLifeXpGain,
  normalizeLifeXp,
} from "./lifeLevelProgression";
import {
  isLifeFieldEnvironmentId,
  type LifeFieldEnvironmentId,
} from "@/adventure/data/v2/lifeFieldEnvironment";

export {
  WOODCUTTING_MATERIALS,
  WOODCUTTING_TREES,
} from "@/adventure/data/v2/woodcuttingSpots";
export type { WoodcuttingTreeId } from "@/adventure/data/v2/woodcuttingSpots";

export const WOODCUTTING_SESSION_KEY = "woodcutting-session.v4";
export const WOODCUTTING_LOG_KEY = "woodcutting-log.v1";
export const WOODCUTTING_CLAIM_GRACE_MS = 30_000;
export const WOODCUTTING_MATERIAL_REWARD = 1;
// 기존 호출처와 세이브 테스트가 사용하는 이름. 보상 단위는 이제 수종별 원목이다.
export const WOODCUTTING_TIMBER_REWARD = WOODCUTTING_MATERIAL_REWARD;

export type WoodcuttingSession = {
  sessionId: string;
  spotId: WoodcuttingSpotId;
  treeId: WoodcuttingTreeId;
  readyAt: number;
  expiresAt: number;
  failureRate?: number;
  failureRecoveryRate?: number;
  bonusLogRate?: number;
  aidItemId?: string;
  lifeEnvironmentId?: LifeFieldEnvironmentId;
  lifeEnvironmentDayKey?: string;
};

export function isWoodcuttingTreeId(id: string): id is WoodcuttingTreeId {
  return Object.prototype.hasOwnProperty.call(WOODCUTTING_TREES, id);
}

export function woodcuttingMaterialBalances(
  raw: unknown,
): Record<WoodcuttingMaterialId, number> {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    (Object.keys(WOODCUTTING_MATERIALS) as WoodcuttingMaterialId[]).map((id) => [
      id,
      Math.max(0, Math.floor(Number(source[id]) || 0)),
    ]),
  ) as Record<WoodcuttingMaterialId, number>;
}

export function pickWoodcuttingTreeId(
  spotId: WoodcuttingSpotId,
): WoodcuttingTreeId {
  return WOODCUTTING_SPOTS[spotId].treeId;
}

export function createWoodcuttingSession(args: {
  sessionId: string;
  spotId: WoodcuttingSpotId;
  treeId: WoodcuttingTreeId;
  now: number;
  durationMs?: number;
  failureRate?: number;
  failureRecoveryRate?: number;
  bonusLogRate?: number;
  aidItemId?: string;
  lifeEnvironmentId?: LifeFieldEnvironmentId;
  lifeEnvironmentDayKey?: string;
}): WoodcuttingSession {
  const durationMs = Math.max(
    1_000,
    Math.floor(args.durationMs ?? WOODCUTTING_TREES[args.treeId].durationMs),
  );
  const readyAt = args.now + durationMs;
  return {
    sessionId: args.sessionId,
    spotId: args.spotId,
    treeId: args.treeId,
    readyAt,
    expiresAt: readyAt + WOODCUTTING_CLAIM_GRACE_MS,
    failureRate:
      args.failureRate ??
      woodcuttingFailureRate(WOODCUTTING_TREES[args.treeId].baseFailureRate, 1),
    failureRecoveryRate: Math.min(
      1,
      Math.max(0, Number(args.failureRecoveryRate) || 0),
    ),
    bonusLogRate: Math.min(1, Math.max(0, Number(args.bonusLogRate) || 0)),
    ...(args.aidItemId ? { aidItemId: args.aidItemId } : {}),
    ...(args.lifeEnvironmentId
      ? {
          lifeEnvironmentId: args.lifeEnvironmentId,
          lifeEnvironmentDayKey: args.lifeEnvironmentDayKey,
        }
      : {}),
  };
}

export function parseWoodcuttingSession(raw: unknown): WoodcuttingSession | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.sessionId !== "string" || value.sessionId.length === 0) return null;
  if (typeof value.spotId !== "string" || !isWoodcuttingSpotId(value.spotId)) return null;
  if (typeof value.treeId !== "string" || !isWoodcuttingTreeId(value.treeId)) return null;
  if (typeof value.readyAt !== "number" || !Number.isFinite(value.readyAt)) return null;
  if (typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt)) return null;
  const storedFailureRate = Number(value.failureRate);
  const storedFailureRecoveryRate = Number(value.failureRecoveryRate);
  const storedBonusLogRate = Number(value.bonusLogRate);
  return {
    sessionId: value.sessionId,
    spotId: value.spotId,
    treeId: value.treeId,
    readyAt: value.readyAt,
    expiresAt: value.expiresAt,
    failureRate: Number.isFinite(storedFailureRate)
      ? Math.min(1, Math.max(0, storedFailureRate))
      : undefined,
    failureRecoveryRate: Number.isFinite(storedFailureRecoveryRate)
      ? Math.min(1, Math.max(0, storedFailureRecoveryRate))
      : undefined,
    bonusLogRate: Number.isFinite(storedBonusLogRate)
      ? Math.min(1, Math.max(0, storedBonusLogRate))
      : undefined,
    aidItemId: typeof value.aidItemId === "string" ? value.aidItemId : undefined,
    lifeEnvironmentId:
      isLifeFieldEnvironmentId(value.lifeEnvironmentId)
        ? value.lifeEnvironmentId
        : undefined,
    lifeEnvironmentDayKey:
      typeof value.lifeEnvironmentDayKey === "string"
        ? value.lifeEnvironmentDayKey
        : undefined,
  };
}

export function woodcuttingAttemptSucceeds(
  failureRate: number,
  roll = Math.random(),
): boolean {
  const safeFailureRate = Math.min(1, Math.max(0, Number(failureRate) || 0));
  const safeRoll = Math.min(1, Math.max(0, Number(roll) || 0));
  return safeRoll >= safeFailureRate;
}

export type WoodcuttingLog = {
  levelCurveVersion: number;
  cuts: number;
  xp: number;
  perfectCuts: number;
  timberEarned: number;
  bestReactionMs: number | null;
  bestCombo: number;
  trees: Record<string, number>;
};

function parseWoodcuttingLogFields(raw: unknown): WoodcuttingLog {
  const empty: WoodcuttingLog = {
    levelCurveVersion: LIFE_LEVEL_CURVE_VERSION,
    cuts: 0,
    xp: 0,
    perfectCuts: 0,
    timberEarned: 0,
    bestReactionMs: null,
    bestCombo: 0,
    trees: {},
  };
  if (!raw || typeof raw !== "object") return empty;
  const value = raw as Record<string, unknown>;
  const trees: Record<string, number> = {};
  if (value.trees && typeof value.trees === "object") {
    for (const [id, count] of Object.entries(value.trees as Record<string, unknown>)) {
      if (!isWoodcuttingTreeId(id)) continue;
      const number = Number(count);
      if (Number.isFinite(number) && number > 0) trees[id] = Math.floor(number);
    }
  }
  const best = Number(value.bestReactionMs);
  const cuts = Math.max(0, Math.floor(Number(value.cuts) || 0));
  const hasStoredXp = Object.prototype.hasOwnProperty.call(value, "xp");
  const storedXp = Number(value.xp);
  return {
    levelCurveVersion: Number.isFinite(Number(value.levelCurveVersion))
      ? Math.max(1, Math.floor(Number(value.levelCurveVersion)))
      : 1,
    cuts,
    xp:
      hasStoredXp && Number.isFinite(storedXp)
        ? Math.max(0, Math.floor(storedXp))
        : cuts * WOODCUTTING_XP_PER_CUT,
    perfectCuts: Math.max(0, Math.floor(Number(value.perfectCuts) || 0)),
    timberEarned: Math.max(0, Math.floor(Number(value.timberEarned) || 0)),
    bestReactionMs: Number.isFinite(best) && best > 0 ? Math.floor(best) : null,
    bestCombo: Math.max(0, Math.floor(Number(value.bestCombo) || 0)),
    trees,
  };
}

export function parseWoodcuttingLogWithLevelMigration(raw: unknown): {
  log: WoodcuttingLog;
  levelCurveMigrated: boolean;
} {
  const log = parseWoodcuttingLogFields(raw);
  const normalized = normalizeLifeXp({
    xp: log.xp,
    levelCurveVersion: log.levelCurveVersion,
    legacyThreshold: woodcuttingXpForLevel,
  });
  return {
    log: {
      ...log,
      xp: normalized.xp,
      levelCurveVersion: normalized.levelCurveVersion,
    },
    levelCurveMigrated: normalized.migrated,
  };
}

export function parseWoodcuttingLog(raw: unknown): WoodcuttingLog {
  return parseWoodcuttingLogWithLevelMigration(raw).log;
}

export function recordWoodcuttingSuccess(
  log: WoodcuttingLog,
  args: { treeId: WoodcuttingTreeId; timber: number; xp: number },
): WoodcuttingLog {
  const xp = applyLifeXpGain({
    xp: log.xp,
    gainedXp: args.xp,
    legacyThreshold: woodcuttingXpForLevel,
  }).xp;
  return {
    ...log,
    levelCurveVersion: Math.max(
      LIFE_LEVEL_CURVE_VERSION,
      log.levelCurveVersion,
    ),
    cuts: log.cuts + 1,
    xp,
    timberEarned: log.timberEarned + args.timber,
    trees: {
      ...log.trees,
      [args.treeId]: (log.trees[args.treeId] ?? 0) + 1,
    },
  };
}
