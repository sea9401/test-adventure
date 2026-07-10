// 벌목 세션 + 타이밍 판정 — 낚시 cast/reel 구조를 미러한 서버 권위 코어.

export const WOODCUTTING_SESSION_KEY = "woodcutting-session.v1";
export const WOODCUTTING_LOG_KEY = "woodcutting-log.v1";

export const CHOP_READY_MIN_MS = 1800;
export const CHOP_READY_MAX_MS = 5200;
export const CHOP_REACTION_WINDOW_MS = 850;
export const CHOP_REACTION_MIN_MS = 60;
export const CHOP_SESSION_GRACE_MS = 12000;

export type WoodcuttingTreeTier = "softwood" | "hardwood" | "ancient";
export type WoodcuttingTreeId = "pine" | "birch" | "oak" | "old_cedar";

export type WoodcuttingTree = {
  id: WoodcuttingTreeId;
  name: string;
  tier: WoodcuttingTreeTier;
  baseTimber: number;
  weight: number;
};

export const WOODCUTTING_TREES: Record<WoodcuttingTreeId, WoodcuttingTree> = {
  pine: { id: "pine", name: "소나무", tier: "softwood", baseTimber: 2, weight: 58 },
  birch: { id: "birch", name: "자작나무", tier: "softwood", baseTimber: 2, weight: 32 },
  oak: { id: "oak", name: "참나무", tier: "hardwood", baseTimber: 3, weight: 9 },
  old_cedar: {
    id: "old_cedar",
    name: "고목 삼나무",
    tier: "ancient",
    baseTimber: 5,
    weight: 1,
  },
};

export function isWoodcuttingTreeId(id: string): id is WoodcuttingTreeId {
  return Object.prototype.hasOwnProperty.call(WOODCUTTING_TREES, id);
}

export type WoodcuttingSession = {
  sessionId: string;
  readyAt: number;
  expiresAt: number;
  treeId: WoodcuttingTreeId;
};

export function woodcuttingExpiresAtFor(readyAt: number): number {
  return readyAt + CHOP_REACTION_WINDOW_MS + CHOP_SESSION_GRACE_MS;
}

export function rollChopReadyDelayMs(rng: () => number): number {
  return Math.round(
    CHOP_READY_MIN_MS + rng() * (CHOP_READY_MAX_MS - CHOP_READY_MIN_MS),
  );
}

export function pickWoodcuttingTreeId(rng: () => number): WoodcuttingTreeId {
  const entries = Object.values(WOODCUTTING_TREES);
  const total = entries.reduce((sum, t) => sum + t.weight, 0);
  let roll = rng() * total;
  for (const tree of entries) {
    roll -= tree.weight;
    if (roll <= 0) return tree.id;
  }
  return entries[entries.length - 1].id;
}

export function parseWoodcuttingSession(raw: unknown): WoodcuttingSession | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.sessionId !== "string" || r.sessionId.length === 0) return null;
  if (typeof r.treeId !== "string" || !isWoodcuttingTreeId(r.treeId)) return null;
  if (typeof r.readyAt !== "number" || !Number.isFinite(r.readyAt)) return null;
  if (typeof r.expiresAt !== "number" || !Number.isFinite(r.expiresAt)) return null;
  return {
    sessionId: r.sessionId,
    readyAt: r.readyAt,
    expiresAt: r.expiresAt,
    treeId: r.treeId,
  };
}

export type ChopJudgment = {
  success: boolean;
  reason: "ok" | "expired" | "too_early" | "missed_window";
};

export function judgeChop(args: {
  reactionMs: number;
  serverNow: number;
  readyAt: number;
  expiresAt: number;
}): ChopJudgment {
  const { reactionMs, serverNow, readyAt, expiresAt } = args;
  if (serverNow > expiresAt) return { success: false, reason: "expired" };
  if (serverNow < readyAt) return { success: false, reason: "too_early" };
  if (reactionMs < CHOP_REACTION_MIN_MS) return { success: false, reason: "too_early" };
  if (reactionMs > CHOP_REACTION_WINDOW_MS)
    return { success: false, reason: "missed_window" };
  return { success: true, reason: "ok" };
}

export function chopQualityBonus(reactionMs: number): {
  grade: "perfect" | "good" | "clean";
  bonus: number;
} {
  if (reactionMs <= 220) return { grade: "perfect", bonus: 2 };
  if (reactionMs <= 480) return { grade: "good", bonus: 1 };
  return { grade: "clean", bonus: 0 };
}

export type WoodcuttingLog = {
  cuts: number;
  perfectCuts: number;
  timberEarned: number;
  bestReactionMs: number | null;
  trees: Record<string, number>;
};

export function parseWoodcuttingLog(raw: unknown): WoodcuttingLog {
  const empty: WoodcuttingLog = {
    cuts: 0,
    perfectCuts: 0,
    timberEarned: 0,
    bestReactionMs: null,
    trees: {},
  };
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Record<string, unknown>;
  const trees: Record<string, number> = {};
  if (r.trees && typeof r.trees === "object") {
    for (const [id, value] of Object.entries(r.trees as Record<string, unknown>)) {
      if (!isWoodcuttingTreeId(id)) continue;
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) trees[id] = Math.floor(n);
    }
  }
  const best = Number(r.bestReactionMs);
  return {
    cuts: Math.max(0, Math.floor(Number(r.cuts) || 0)),
    perfectCuts: Math.max(0, Math.floor(Number(r.perfectCuts) || 0)),
    timberEarned: Math.max(0, Math.floor(Number(r.timberEarned) || 0)),
    bestReactionMs: Number.isFinite(best) && best > 0 ? Math.floor(best) : null,
    trees,
  };
}

export function recordWoodcuttingSuccess(
  log: WoodcuttingLog,
  args: {
    treeId: WoodcuttingTreeId;
    timber: number;
    reactionMs: number;
    grade: "perfect" | "good" | "clean";
  },
): WoodcuttingLog {
  return {
    cuts: log.cuts + 1,
    perfectCuts: log.perfectCuts + (args.grade === "perfect" ? 1 : 0),
    timberEarned: log.timberEarned + args.timber,
    bestReactionMs:
      log.bestReactionMs == null
        ? Math.max(0, Math.floor(args.reactionMs))
        : Math.min(log.bestReactionMs, Math.max(0, Math.floor(args.reactionMs))),
    trees: {
      ...log.trees,
      [args.treeId]: (log.trees[args.treeId] ?? 0) + 1,
    },
  };
}
