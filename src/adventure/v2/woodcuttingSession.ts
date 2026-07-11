// 자동 벌목 세션 — 서버 완료 시각이 지난 뒤에만 통나무 1개를 지급한다.

import {
  WOODCUTTING_SPOTS,
  WOODCUTTING_TREES,
  isWoodcuttingSpotId,
  type WoodcuttingSpotId,
  type WoodcuttingTreeId,
} from "@/adventure/data/v2/woodcuttingSpots";

export { WOODCUTTING_TREES } from "@/adventure/data/v2/woodcuttingSpots";
export type { WoodcuttingTreeId } from "@/adventure/data/v2/woodcuttingSpots";

export const WOODCUTTING_SESSION_KEY = "woodcutting-session.v4";
export const WOODCUTTING_LOG_KEY = "woodcutting-log.v1";
export const WOODCUTTING_CLAIM_GRACE_MS = 30_000;
export const WOODCUTTING_TIMBER_REWARD = 1;

export type WoodcuttingSession = {
  sessionId: string;
  spotId: WoodcuttingSpotId;
  treeId: WoodcuttingTreeId;
  readyAt: number;
  expiresAt: number;
};

export function isWoodcuttingTreeId(id: string): id is WoodcuttingTreeId {
  return Object.prototype.hasOwnProperty.call(WOODCUTTING_TREES, id);
}

export function pickWoodcuttingTreeId(
  spotId: WoodcuttingSpotId,
  rng: () => number,
): WoodcuttingTreeId {
  const trees = WOODCUTTING_SPOTS[spotId].trees;
  const total = trees.reduce((sum, tree) => sum + tree.weight, 0);
  let roll = rng() * total;
  for (const tree of trees) {
    roll -= tree.weight;
    if (roll <= 0) return tree.treeId;
  }
  return trees[trees.length - 1].treeId;
}

export function createWoodcuttingSession(args: {
  sessionId: string;
  spotId: WoodcuttingSpotId;
  treeId: WoodcuttingTreeId;
  now: number;
}): WoodcuttingSession {
  const readyAt = args.now + WOODCUTTING_TREES[args.treeId].durationMs;
  return {
    sessionId: args.sessionId,
    spotId: args.spotId,
    treeId: args.treeId,
    readyAt,
    expiresAt: readyAt + WOODCUTTING_CLAIM_GRACE_MS,
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
  return {
    sessionId: value.sessionId,
    spotId: value.spotId,
    treeId: value.treeId,
    readyAt: value.readyAt,
    expiresAt: value.expiresAt,
  };
}

export type WoodcuttingLog = {
  cuts: number;
  perfectCuts: number;
  timberEarned: number;
  bestReactionMs: number | null;
  bestCombo: number;
  trees: Record<string, number>;
};

export function parseWoodcuttingLog(raw: unknown): WoodcuttingLog {
  const empty: WoodcuttingLog = {
    cuts: 0,
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
  return {
    cuts: Math.max(0, Math.floor(Number(value.cuts) || 0)),
    perfectCuts: Math.max(0, Math.floor(Number(value.perfectCuts) || 0)),
    timberEarned: Math.max(0, Math.floor(Number(value.timberEarned) || 0)),
    bestReactionMs: Number.isFinite(best) && best > 0 ? Math.floor(best) : null,
    bestCombo: Math.max(0, Math.floor(Number(value.bestCombo) || 0)),
    trees,
  };
}

export function recordWoodcuttingSuccess(
  log: WoodcuttingLog,
  args: { treeId: WoodcuttingTreeId; timber: number },
): WoodcuttingLog {
  return {
    ...log,
    cuts: log.cuts + 1,
    timberEarned: log.timberEarned + args.timber,
    trees: {
      ...log.trees,
      [args.treeId]: (log.trees[args.treeId] ?? 0) + 1,
    },
  };
}
