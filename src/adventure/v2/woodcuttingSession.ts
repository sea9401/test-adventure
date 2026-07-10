// 벌목 세션 + 약점/리듬 판정 — 서버가 각 타격의 약점과 박자를 검증한다.

export const WOODCUTTING_SESSION_KEY = "woodcutting-session.v1";
export const WOODCUTTING_LOG_KEY = "woodcutting-log.v1";

export const WOODCUTTING_ROUNDS = 3;
export const CHOP_READY_MIN_MS = 900;
export const CHOP_READY_MAX_MS = 2200;
export const CHOP_REACTION_WINDOW_MS = 900;
export const CHOP_REACTION_MIN_MS = 60;
export const CHOP_SESSION_GRACE_MS = 7000;
export const CHOP_MIN_FELL_SCORE = 3;

export type WoodcuttingTreeTier = "softwood" | "hardwood" | "ancient";
export type WoodcuttingTreeId = "pine" | "birch" | "oak" | "old_cedar";
export type WoodcuttingSpot = "root" | "left" | "center" | "right";
export type WoodcuttingHitGrade = "perfect" | "good" | "clean" | "miss";
export type WoodcuttingOverallGrade = "perfect" | "good" | "clean";

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

export const WOODCUTTING_SPOTS: WoodcuttingSpot[] = [
  "root",
  "left",
  "center",
  "right",
];

export type WoodcuttingRound = {
  index: number;
  weakSpot: WoodcuttingSpot;
  readyAt: number;
  expiresAt: number;
};

export type WoodcuttingHit = {
  round: number;
  spot: WoodcuttingSpot;
  weakSpot: WoodcuttingSpot;
  reactionMs: number;
  grade: WoodcuttingHitGrade;
  score: number;
  reason: "ok" | "expired" | "too_early" | "missed_window" | "wrong_spot";
};

export type WoodcuttingSession = {
  sessionId: string;
  treeId: WoodcuttingTreeId;
  round: WoodcuttingRound;
  hits: WoodcuttingHit[];
  combo: number;
  bestCombo: number;
};

export type WoodcuttingRoundView = {
  index: number;
  total: number;
  weakSpot: WoodcuttingSpot;
  readyDelayMs: number;
  windowMs: number;
};

export function isWoodcuttingTreeId(id: string): id is WoodcuttingTreeId {
  return Object.prototype.hasOwnProperty.call(WOODCUTTING_TREES, id);
}

export function isWoodcuttingSpot(value: string): value is WoodcuttingSpot {
  return (WOODCUTTING_SPOTS as string[]).includes(value);
}

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

export function pickWoodcuttingSpot(rng: () => number): WoodcuttingSpot {
  const idx = Math.min(WOODCUTTING_SPOTS.length - 1, Math.floor(rng() * WOODCUTTING_SPOTS.length));
  return WOODCUTTING_SPOTS[idx];
}

export function createWoodcuttingRound(args: {
  index: number;
  now: number;
  rng: () => number;
}): WoodcuttingRound {
  const readyAt = args.now + rollChopReadyDelayMs(args.rng);
  return {
    index: args.index,
    weakSpot: pickWoodcuttingSpot(args.rng),
    readyAt,
    expiresAt: woodcuttingExpiresAtFor(readyAt),
  };
}

export function woodcuttingRoundView(
  round: WoodcuttingRound,
  now: number,
): WoodcuttingRoundView {
  return {
    index: round.index,
    total: WOODCUTTING_ROUNDS,
    weakSpot: round.weakSpot,
    readyDelayMs: Math.max(0, round.readyAt - now),
    windowMs: CHOP_REACTION_WINDOW_MS,
  };
}

export function parseWoodcuttingRound(raw: unknown): WoodcuttingRound | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.index !== "number" || !Number.isFinite(r.index)) return null;
  if (typeof r.weakSpot !== "string" || !isWoodcuttingSpot(r.weakSpot)) return null;
  if (typeof r.readyAt !== "number" || !Number.isFinite(r.readyAt)) return null;
  if (typeof r.expiresAt !== "number" || !Number.isFinite(r.expiresAt)) return null;
  const index = Math.floor(r.index);
  if (index < 1 || index > WOODCUTTING_ROUNDS) return null;
  return {
    index,
    weakSpot: r.weakSpot,
    readyAt: r.readyAt,
    expiresAt: r.expiresAt,
  };
}

export function parseWoodcuttingHit(raw: unknown): WoodcuttingHit | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.spot !== "string" || !isWoodcuttingSpot(r.spot)) return null;
  if (typeof r.weakSpot !== "string" || !isWoodcuttingSpot(r.weakSpot)) return null;
  const grade = String(r.grade);
  const reason = String(r.reason);
  if (!["perfect", "good", "clean", "miss"].includes(grade)) return null;
  if (!["ok", "expired", "too_early", "missed_window", "wrong_spot"].includes(reason)) {
    return null;
  }
  return {
    round: Math.max(1, Math.floor(Number(r.round) || 1)),
    spot: r.spot,
    weakSpot: r.weakSpot,
    reactionMs: Math.floor(Number(r.reactionMs) || 0),
    grade: grade as WoodcuttingHitGrade,
    score: Math.max(0, Math.floor(Number(r.score) || 0)),
    reason: reason as WoodcuttingHit["reason"],
  };
}

export function parseWoodcuttingSession(raw: unknown): WoodcuttingSession | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.sessionId !== "string" || r.sessionId.length === 0) return null;
  if (typeof r.treeId !== "string" || !isWoodcuttingTreeId(r.treeId)) return null;
  const round = parseWoodcuttingRound(r.round);
  if (!round) return null;
  const hits = Array.isArray(r.hits)
    ? r.hits.map(parseWoodcuttingHit).filter((h): h is WoodcuttingHit => h != null)
    : [];
  return {
    sessionId: r.sessionId,
    treeId: r.treeId,
    round,
    hits: hits.slice(0, WOODCUTTING_ROUNDS),
    combo: Math.max(0, Math.floor(Number(r.combo) || 0)),
    bestCombo: Math.max(0, Math.floor(Number(r.bestCombo) || 0)),
  };
}

export type ChopJudgment = {
  grade: WoodcuttingHitGrade;
  score: number;
  reason: WoodcuttingHit["reason"];
};

export function judgeChop(args: {
  spot: WoodcuttingSpot;
  weakSpot: WoodcuttingSpot;
  reactionMs: number;
  serverNow: number;
  readyAt: number;
  expiresAt: number;
}): ChopJudgment {
  const { spot, weakSpot, reactionMs, serverNow, readyAt, expiresAt } = args;
  if (serverNow > expiresAt) return { grade: "miss", score: 0, reason: "expired" };
  if (serverNow < readyAt) return { grade: "miss", score: 0, reason: "too_early" };
  if (reactionMs < CHOP_REACTION_MIN_MS) {
    return { grade: "miss", score: 0, reason: "too_early" };
  }
  if (reactionMs > CHOP_REACTION_WINDOW_MS) {
    return { grade: "miss", score: 0, reason: "missed_window" };
  }
  if (spot !== weakSpot) return { grade: "miss", score: 0, reason: "wrong_spot" };
  if (reactionMs <= 230) return { grade: "perfect", score: 3, reason: "ok" };
  if (reactionMs <= 520) return { grade: "good", score: 2, reason: "ok" };
  return { grade: "clean", score: 1, reason: "ok" };
}

export function applyWoodcuttingHit(
  session: WoodcuttingSession,
  args: {
    spot: WoodcuttingSpot;
    reactionMs: number;
    serverNow: number;
  },
): { session: WoodcuttingSession; hit: WoodcuttingHit; complete: boolean } {
  const judgment = judgeChop({
    spot: args.spot,
    weakSpot: session.round.weakSpot,
    reactionMs: args.reactionMs,
    serverNow: args.serverNow,
    readyAt: session.round.readyAt,
    expiresAt: session.round.expiresAt,
  });
  const hit: WoodcuttingHit = {
    round: session.round.index,
    spot: args.spot,
    weakSpot: session.round.weakSpot,
    reactionMs: Math.max(0, Math.floor(args.reactionMs)),
    grade: judgment.grade,
    score: judgment.score,
    reason: judgment.reason,
  };
  const combo = judgment.score > 0 ? session.combo + 1 : 0;
  const hits = [...session.hits, hit].slice(0, WOODCUTTING_ROUNDS);
  return {
    session: {
      ...session,
      hits,
      combo,
      bestCombo: Math.max(session.bestCombo, combo),
    },
    hit,
    complete: hits.length >= WOODCUTTING_ROUNDS,
  };
}

export function totalWoodcuttingScore(hits: WoodcuttingHit[]): number {
  return hits.reduce((sum, h) => sum + Math.max(0, h.score), 0);
}

export function bestWoodcuttingReactionMs(hits: WoodcuttingHit[]): number | null {
  const values = hits
    .filter((h) => h.score > 0 && h.reactionMs > 0)
    .map((h) => h.reactionMs);
  if (values.length === 0) return null;
  return Math.min(...values);
}

export function woodcuttingOverallGrade(
  score: number,
): WoodcuttingOverallGrade {
  if (score >= 8) return "perfect";
  if (score >= 6) return "good";
  return "clean";
}

export function woodcuttingTimberReward(
  tree: WoodcuttingTree,
  hits: WoodcuttingHit[],
  bestCombo: number,
): { timber: number; grade: WoodcuttingOverallGrade | null; score: number } {
  const score = totalWoodcuttingScore(hits);
  if (score < CHOP_MIN_FELL_SCORE) return { timber: 0, grade: null, score };
  const scoreBonus = Math.floor((score - CHOP_MIN_FELL_SCORE) / 3);
  const comboBonus = bestCombo >= WOODCUTTING_ROUNDS ? 1 : 0;
  return {
    timber: tree.baseTimber + scoreBonus + comboBonus,
    grade: woodcuttingOverallGrade(score),
    score,
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
    bestCombo: Math.max(0, Math.floor(Number(r.bestCombo) || 0)),
    trees,
  };
}

export function recordWoodcuttingSuccess(
  log: WoodcuttingLog,
  args: {
    treeId: WoodcuttingTreeId;
    timber: number;
    bestReactionMs: number | null;
    grade: WoodcuttingOverallGrade;
    bestCombo: number;
  },
): WoodcuttingLog {
  const nextBest =
    args.bestReactionMs == null
      ? log.bestReactionMs
      : log.bestReactionMs == null
        ? args.bestReactionMs
        : Math.min(log.bestReactionMs, args.bestReactionMs);
  return {
    cuts: log.cuts + 1,
    perfectCuts: log.perfectCuts + (args.grade === "perfect" ? 1 : 0),
    timberEarned: log.timberEarned + args.timber,
    bestReactionMs: nextBest,
    bestCombo: Math.max(log.bestCombo, args.bestCombo),
    trees: {
      ...log.trees,
      [args.treeId]: (log.trees[args.treeId] ?? 0) + 1,
    },
  };
}
