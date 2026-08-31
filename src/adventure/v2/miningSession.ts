import {
  MINING_MATERIALS,
  MINING_NODES,
  MINING_SPOTS,
  isMiningSpotId,
  type MiningMaterialId,
  type MiningNodeId,
  type MiningSpotId,
} from "@/adventure/data/v2/miningSpots";
import {
  MINING_XP_PER_SUCCESS,
  miningFailureRate,
  miningXpForLevel,
} from "./miningProgression";
import {
  LIFE_LEVEL_CURVE_VERSION,
  applyLifeXpGain,
  normalizeLifeXp,
} from "./lifeLevelProgression";
import {
  isLifeFieldEnvironmentId,
  type LifeFieldEnvironmentId,
} from "@/adventure/data/v2/lifeFieldEnvironment";

export const MINING_SESSION_KEY = "mining-session.v1";
export const MINING_LOG_KEY = "mining-log.v1";
export const MINING_CLAIM_GRACE_MS = 30_000;
export const MINING_ORE_REWARD = 1;

export type MiningSession = {
  sessionId: string;
  spotId: MiningSpotId;
  nodeId: MiningNodeId;
  readyAt: number;
  expiresAt: number;
  failureRate?: number;
  failureRecoveryRate?: number;
  bonusOreRate?: number;
  aidItemId?: string;
  lifeEnvironmentId?: LifeFieldEnvironmentId;
  lifeEnvironmentDayKey?: string;
};

export type MiningLog = {
  levelCurveVersion: number;
  successes: number;
  xp: number;
  oreEarned: number;
  byproductsEarned: number;
  nodes: Record<string, number>;
};

export function isMiningNodeId(id: string): id is MiningNodeId {
  return Object.prototype.hasOwnProperty.call(MINING_NODES, id);
}

export function miningMaterialBalances(
  raw: unknown,
): Record<MiningMaterialId, number> {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    (Object.keys(MINING_MATERIALS) as MiningMaterialId[]).map((id) => [
      id,
      Math.max(0, Math.floor(Number(source[id]) || 0)),
    ]),
  ) as Record<MiningMaterialId, number>;
}

export function pickMiningNodeId(spotId: MiningSpotId): MiningNodeId {
  return MINING_SPOTS[spotId].nodeId;
}

export function createMiningSession(args: {
  sessionId: string;
  spotId: MiningSpotId;
  nodeId: MiningNodeId;
  now: number;
  durationMs?: number;
  failureRate?: number;
  failureRecoveryRate?: number;
  bonusOreRate?: number;
  aidItemId?: string;
  lifeEnvironmentId?: LifeFieldEnvironmentId;
  lifeEnvironmentDayKey?: string;
}): MiningSession {
  const durationMs = Math.max(
    1_000,
    Math.floor(args.durationMs ?? MINING_NODES[args.nodeId].durationMs),
  );
  const readyAt = args.now + durationMs;
  return {
    sessionId: args.sessionId,
    spotId: args.spotId,
    nodeId: args.nodeId,
    readyAt,
    expiresAt: readyAt + MINING_CLAIM_GRACE_MS,
    failureRate:
      args.failureRate ??
      miningFailureRate(MINING_NODES[args.nodeId].baseFailureRate, 1),
    failureRecoveryRate: Math.min(
      1,
      Math.max(0, Number(args.failureRecoveryRate) || 0),
    ),
    bonusOreRate: Math.min(1, Math.max(0, Number(args.bonusOreRate) || 0)),
    ...(args.aidItemId ? { aidItemId: args.aidItemId } : {}),
    ...(args.lifeEnvironmentId
      ? {
          lifeEnvironmentId: args.lifeEnvironmentId,
          lifeEnvironmentDayKey: args.lifeEnvironmentDayKey,
        }
      : {}),
  };
}

export function parseMiningSession(raw: unknown): MiningSession | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.sessionId !== "string" || value.sessionId.length === 0) return null;
  if (typeof value.spotId !== "string" || !isMiningSpotId(value.spotId)) return null;
  if (typeof value.nodeId !== "string" || !isMiningNodeId(value.nodeId)) return null;
  if (typeof value.readyAt !== "number" || !Number.isFinite(value.readyAt)) return null;
  if (typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt)) return null;
  const storedFailureRate = Number(value.failureRate);
  const storedFailureRecoveryRate = Number(value.failureRecoveryRate);
  const storedBonusOreRate = Number(value.bonusOreRate);
  return {
    sessionId: value.sessionId,
    spotId: value.spotId,
    nodeId: value.nodeId,
    readyAt: value.readyAt,
    expiresAt: value.expiresAt,
    failureRate: Number.isFinite(storedFailureRate)
      ? Math.min(1, Math.max(0, storedFailureRate))
      : undefined,
    failureRecoveryRate: Number.isFinite(storedFailureRecoveryRate)
      ? Math.min(1, Math.max(0, storedFailureRecoveryRate))
      : undefined,
    bonusOreRate: Number.isFinite(storedBonusOreRate)
      ? Math.min(1, Math.max(0, storedBonusOreRate))
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

function parseMiningLogFields(raw: unknown): MiningLog {
  const empty: MiningLog = {
    levelCurveVersion: LIFE_LEVEL_CURVE_VERSION,
    successes: 0,
    xp: 0,
    oreEarned: 0,
    byproductsEarned: 0,
    nodes: {},
  };
  if (!raw || typeof raw !== "object") return empty;
  const value = raw as Record<string, unknown>;
  const successes = Math.max(0, Math.floor(Number(value.successes) || 0));
  const nodes: Record<string, number> = {};
  if (value.nodes && typeof value.nodes === "object") {
    for (const [id, count] of Object.entries(value.nodes as Record<string, unknown>)) {
      if (!isMiningNodeId(id)) continue;
      const number = Number(count);
      if (Number.isFinite(number) && number > 0) nodes[id] = Math.floor(number);
    }
  }
  const hasStoredXp = Object.prototype.hasOwnProperty.call(value, "xp");
  const storedXp = Number(value.xp);
  return {
    levelCurveVersion: Number.isFinite(Number(value.levelCurveVersion))
      ? Math.max(1, Math.floor(Number(value.levelCurveVersion)))
      : 1,
    successes,
    xp:
      hasStoredXp && Number.isFinite(storedXp)
        ? Math.max(0, Math.floor(storedXp))
        : successes * MINING_XP_PER_SUCCESS,
    oreEarned: Math.max(0, Math.floor(Number(value.oreEarned) || 0)),
    byproductsEarned: Math.max(
      0,
      Math.floor(Number(value.byproductsEarned) || 0),
    ),
    nodes,
  };
}

export function parseMiningLogWithLevelMigration(raw: unknown): {
  log: MiningLog;
  levelCurveMigrated: boolean;
} {
  const log = parseMiningLogFields(raw);
  const normalized = normalizeLifeXp({
    xp: log.xp,
    levelCurveVersion: log.levelCurveVersion,
    legacyThreshold: miningXpForLevel,
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

export function parseMiningLog(raw: unknown): MiningLog {
  return parseMiningLogWithLevelMigration(raw).log;
}

export function miningAttemptSucceeds(
  failureRate: number,
  roll: number = Math.random(),
): boolean {
  const safeFailureRate = Math.min(1, Math.max(0, Number(failureRate) || 0));
  return roll >= safeFailureRate;
}

export function recordMiningSuccess(
  log: MiningLog,
  args: { nodeId: MiningNodeId; ore: number; byproducts: number; xp: number },
): MiningLog {
  const xp = applyLifeXpGain({
    xp: log.xp,
    gainedXp: args.xp,
    legacyThreshold: miningXpForLevel,
  }).xp;
  return {
    ...log,
    levelCurveVersion: Math.max(
      LIFE_LEVEL_CURVE_VERSION,
      log.levelCurveVersion,
    ),
    successes: log.successes + 1,
    xp,
    oreEarned: log.oreEarned + Math.max(0, Math.floor(args.ore)),
    byproductsEarned:
      log.byproductsEarned + Math.max(0, Math.floor(args.byproducts)),
    nodes: {
      ...log.nodes,
      [args.nodeId]: (log.nodes[args.nodeId] ?? 0) + 1,
    },
  };
}
