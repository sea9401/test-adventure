// 벌목 세션 + 낙하 방향 판정 — 서버가 바람, 안전 구역, 뒤베기 정확도를 검증한다.

export const WOODCUTTING_SESSION_KEY = "woodcutting-session.v2";
export const WOODCUTTING_LOG_KEY = "woodcutting-log.v1";
export const WOODCUTTING_SESSION_MS = 90_000;
export const CHOP_MIN_FELL_SCORE = 3;

export type WoodcuttingTreeTier = "softwood" | "hardwood" | "ancient";
export type WoodcuttingTreeId = "pine" | "birch" | "oak" | "old_cedar";
export type WoodcuttingLane = -2 | -1 | 0 | 1 | 2;
export type WoodcuttingWind = -1 | 0 | 1;
export type WoodcuttingBackCut = "low" | "level" | "high";
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

export const WOODCUTTING_LANES: WoodcuttingLane[] = [-2, -1, 0, 1, 2];
export const WOODCUTTING_BACK_CUTS: WoodcuttingBackCut[] = ["low", "level", "high"];

export type WoodcuttingChallenge = {
  wind: WoodcuttingWind;
  safeLane: WoodcuttingLane;
  idealBackCut: WoodcuttingBackCut;
};

export type WoodcuttingSession = {
  sessionId: string;
  treeId: WoodcuttingTreeId;
  challenge: WoodcuttingChallenge;
  expiresAt: number;
};

export type WoodcuttingJudgment = {
  selectedLane: WoodcuttingLane;
  backCut: WoodcuttingBackCut;
  landingLane: WoodcuttingLane;
  safeLane: WoodcuttingLane;
  wind: WoodcuttingWind;
  idealBackCut: WoodcuttingBackCut;
  directionError: number;
  backCutError: number;
  score: number;
  grade: WoodcuttingOverallGrade | null;
  reason: "ok" | "unsafe_fall";
};

export function isWoodcuttingTreeId(id: string): id is WoodcuttingTreeId {
  return Object.prototype.hasOwnProperty.call(WOODCUTTING_TREES, id);
}

export function isWoodcuttingLane(value: unknown): value is WoodcuttingLane {
  return typeof value === "number" && WOODCUTTING_LANES.includes(value as WoodcuttingLane);
}

export function isWoodcuttingBackCut(value: unknown): value is WoodcuttingBackCut {
  return typeof value === "string" &&
    WOODCUTTING_BACK_CUTS.includes(value as WoodcuttingBackCut);
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

function pickOne<T>(values: readonly T[], rng: () => number): T {
  return values[Math.min(values.length - 1, Math.floor(rng() * values.length))];
}

export function createWoodcuttingChallenge(rng: () => number): WoodcuttingChallenge {
  const wind = pickOne([-1, 0, 1] as const, rng);
  // 바람을 보정할 앞베기 방향이 항상 5개 선택지 안에 남도록 안전 구역을 제한한다.
  const safeLanes = WOODCUTTING_LANES.filter((lane) => isWoodcuttingLane(lane - wind));
  return {
    wind,
    safeLane: pickOne(safeLanes, rng),
    idealBackCut: pickOne(WOODCUTTING_BACK_CUTS, rng),
  };
}

export function parseWoodcuttingChallenge(raw: unknown): WoodcuttingChallenge | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (!isWoodcuttingLane(value.wind) || Math.abs(value.wind) > 1) return null;
  if (!isWoodcuttingLane(value.safeLane)) return null;
  if (!isWoodcuttingBackCut(value.idealBackCut)) return null;
  return {
    wind: value.wind as WoodcuttingWind,
    safeLane: value.safeLane,
    idealBackCut: value.idealBackCut,
  };
}

export function parseWoodcuttingSession(raw: unknown): WoodcuttingSession | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.sessionId !== "string" || value.sessionId.length === 0) return null;
  if (typeof value.treeId !== "string" || !isWoodcuttingTreeId(value.treeId)) return null;
  const challenge = parseWoodcuttingChallenge(value.challenge);
  if (!challenge || typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt)) {
    return null;
  }
  return {
    sessionId: value.sessionId,
    treeId: value.treeId,
    challenge,
    expiresAt: value.expiresAt,
  };
}

function clampLane(value: number): WoodcuttingLane {
  return Math.max(-2, Math.min(2, value)) as WoodcuttingLane;
}

export function woodcuttingOverallGrade(score: number): WoodcuttingOverallGrade {
  if (score >= 8) return "perfect";
  if (score >= 6) return "good";
  return "clean";
}

export function judgeWoodcuttingPlan(args: {
  challenge: WoodcuttingChallenge;
  selectedLane: WoodcuttingLane;
  backCut: WoodcuttingBackCut;
}): WoodcuttingJudgment {
  const { challenge, selectedLane, backCut } = args;
  const landingLane = clampLane(selectedLane + challenge.wind);
  const directionError = Math.abs(landingLane - challenge.safeLane);
  const backCutError = Math.abs(
    WOODCUTTING_BACK_CUTS.indexOf(backCut) -
      WOODCUTTING_BACK_CUTS.indexOf(challenge.idealBackCut),
  );
  const directionScore = directionError === 0 ? 6 : directionError === 1 ? 3 : 0;
  const backCutScore = backCutError === 0 ? 3 : backCutError === 1 ? 1 : 0;
  const score = directionScore + backCutScore;
  const safe = directionError <= 1 && score >= CHOP_MIN_FELL_SCORE;
  return {
    selectedLane,
    backCut,
    landingLane,
    safeLane: challenge.safeLane,
    wind: challenge.wind,
    idealBackCut: challenge.idealBackCut,
    directionError,
    backCutError,
    score,
    grade: safe ? woodcuttingOverallGrade(score) : null,
    reason: safe ? "ok" : "unsafe_fall",
  };
}

export function woodcuttingTimberReward(
  tree: WoodcuttingTree,
  judgment: WoodcuttingJudgment,
): { timber: number; grade: WoodcuttingOverallGrade | null; score: number } {
  if (judgment.grade == null) return { timber: 0, grade: null, score: judgment.score };
  const scoreBonus = Math.floor((judgment.score - CHOP_MIN_FELL_SCORE) / 3);
  const precisionBonus = judgment.directionError === 0 && judgment.backCutError === 0 ? 1 : 0;
  return {
    timber: tree.baseTimber + scoreBonus + precisionBonus,
    grade: judgment.grade,
    score: judgment.score,
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
  args: {
    treeId: WoodcuttingTreeId;
    timber: number;
    grade: WoodcuttingOverallGrade;
  },
): WoodcuttingLog {
  return {
    ...log,
    cuts: log.cuts + 1,
    perfectCuts: log.perfectCuts + (args.grade === "perfect" ? 1 : 0),
    timberEarned: log.timberEarned + args.timber,
    trees: {
      ...log.trees,
      [args.treeId]: (log.trees[args.treeId] ?? 0) + 1,
    },
  };
}
