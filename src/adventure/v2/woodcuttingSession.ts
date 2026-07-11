// 자동 벌목 세션 — 서버 완료 시각이 지난 뒤에만 통나무를 지급한다.

export const WOODCUTTING_SESSION_KEY = "woodcutting-session.v3";
export const WOODCUTTING_LOG_KEY = "woodcutting-log.v1";
export const WOODCUTTING_CLAIM_GRACE_MS = 30_000;

export type WoodcuttingTreeTier = "softwood" | "hardwood" | "ancient";
export type WoodcuttingTreeId = "pine" | "birch" | "oak" | "old_cedar";

export type WoodcuttingTree = {
  id: WoodcuttingTreeId;
  name: string;
  tier: WoodcuttingTreeTier;
  baseTimber: number;
  weight: number;
  durationMs: number;
  chops: number;
};

export const WOODCUTTING_TREES: Record<WoodcuttingTreeId, WoodcuttingTree> = {
  pine: {
    id: "pine",
    name: "소나무",
    tier: "softwood",
    baseTimber: 2,
    weight: 58,
    durationMs: 3_000,
    chops: 5,
  },
  birch: {
    id: "birch",
    name: "자작나무",
    tier: "softwood",
    baseTimber: 2,
    weight: 32,
    durationMs: 3_600,
    chops: 6,
  },
  oak: {
    id: "oak",
    name: "참나무",
    tier: "hardwood",
    baseTimber: 3,
    weight: 9,
    durationMs: 4_500,
    chops: 8,
  },
  old_cedar: {
    id: "old_cedar",
    name: "고목 삼나무",
    tier: "ancient",
    baseTimber: 5,
    weight: 1,
    durationMs: 5_400,
    chops: 9,
  },
};

export type WoodcuttingSession = {
  sessionId: string;
  treeId: WoodcuttingTreeId;
  readyAt: number;
  expiresAt: number;
};

export function isWoodcuttingTreeId(id: string): id is WoodcuttingTreeId {
  return Object.prototype.hasOwnProperty.call(WOODCUTTING_TREES, id);
}

export function pickWoodcuttingTreeId(rng: () => number): WoodcuttingTreeId {
  const entries = Object.values(WOODCUTTING_TREES);
  const total = entries.reduce((sum, tree) => sum + tree.weight, 0);
  let roll = rng() * total;
  for (const tree of entries) {
    roll -= tree.weight;
    if (roll <= 0) return tree.id;
  }
  return entries[entries.length - 1].id;
}

export function createWoodcuttingSession(args: {
  sessionId: string;
  treeId: WoodcuttingTreeId;
  now: number;
}): WoodcuttingSession {
  const readyAt = args.now + WOODCUTTING_TREES[args.treeId].durationMs;
  return {
    sessionId: args.sessionId,
    treeId: args.treeId,
    readyAt,
    expiresAt: readyAt + WOODCUTTING_CLAIM_GRACE_MS,
  };
}

export function parseWoodcuttingSession(raw: unknown): WoodcuttingSession | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.sessionId !== "string" || value.sessionId.length === 0) return null;
  if (typeof value.treeId !== "string" || !isWoodcuttingTreeId(value.treeId)) return null;
  if (typeof value.readyAt !== "number" || !Number.isFinite(value.readyAt)) return null;
  if (typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt)) return null;
  return {
    sessionId: value.sessionId,
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
