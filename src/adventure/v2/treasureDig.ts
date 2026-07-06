// 발굴 미니게임 — 지도 1장으로 채운 드릴 연료를 쓰며 지하 터널을 여는 상태 머신.
//
// open 이 골동품과 숨은 지도 타일을 서버 세션에 봉인하고, action 은 이 순수 함수로만
// 진행된다. 클라는 공개/스캔된 지층과 연료만 보고 어느 방향으로 더 팔지 결정한다.

import {
  ANTIQUES,
  ANTIQUE_THEME_LABEL,
  ANTIQUE_TIERS,
  isAntiqueId,
  pickAntiqueId,
  rollCondition,
  MIN_CONDITION,
  type AntiqueId,
} from "@/adventure/data/v2/antique";

export const TREASURE_SESSION_KEY = "treasure-session.v1";

export const TREASURE_GRID_SIZE = 7;
export const TREASURE_GRID_HEIGHT = 10;
export const TREASURE_MAX_ENERGY = 32;
export const ACTIONS_ALLOWED = 36;
export const TREASURE_START_BOMBS = 2;
export const TREASURE_START_ROPES = 1;
export const MAX_DEPTH = TREASURE_GRID_HEIGHT - 1;
export const COLLAPSE_RISK = 100;

export const TREASURE_SITE_OPTIONS = [
  "old_market",
  "royal_tomb",
  "collapsed_shrine",
] as const;
export type TreasureSiteOptionId = (typeof TREASURE_SITE_OPTIONS)[number];
export const DEFAULT_TREASURE_SITE_OPTION_ID: TreasureSiteOptionId = "old_market";

export type TreasureAction =
  | "excavate"
  | "move"
  | "scan"
  | "bomb"
  | "secure"
  | "rope"
  | "retreat";

export type TreasureActionTarget = {
  cell?: number;
};

export type TreasureCellKind =
  | "camp"
  | "soil"
  | "dense"
  | "rock"
  | "clue"
  | "cache"
  | "supply"
  | "relic"
  | "fissure";

export const TREASURE_ACTION_LABEL: Record<TreasureAction, string> = {
  excavate: "발굴",
  move: "이동",
  scan: "탐지",
  bomb: "폭약",
  secure: "보강",
  rope: "로프 귀환",
  retreat: "귀환",
};

export const TREASURE_ACTION_HELP: Record<TreasureAction, string> = {
  excavate: "드릴을 인접한 흙벽에 넣어 터널을 냅니다. 지층마다 연료 소모가 다릅니다.",
  move: "이미 뚫린 터널로 이동합니다. 연료 1을 씁니다.",
  scan: "주변 흙벽의 반응을 읽습니다. 연료 2를 씁니다.",
  bomb: "폭약 1개로 인접한 흙벽을 안전하게 뚫습니다. 암반과 균열에 특히 좋습니다.",
  secure: "버팀목을 세워 터널을 보강하고 위험을 낮춥니다. 연료 2를 씁니다.",
  rope: "로프 1개로 바로 귀환합니다. 위험 페널티를 크게 줄여 보존상태를 지킵니다.",
  retreat: "지금 들고 있는 발견물을 챙겨 발굴을 끝냅니다.",
};

export type TreasureActionRecord = {
  action: TreasureAction;
  cell?: number;
  depth: number;
  haul: number;
  stability: number;
  risk: number;
  insight: number;
  energy: number;
  message: string;
};

export type TreasureTools = {
  bombs: number;
  ropes: number;
};

export type TreasureCell = {
  index: number;
  kind: TreasureCellKind;
  revealed: boolean;
  scanned: boolean;
  depleted: boolean;
};

export type TreasureCellPublic = {
  index: number;
  x: number;
  y: number;
  revealed: boolean;
  scanned: boolean;
  depleted: boolean;
  adjacent: boolean;
  current: boolean;
  reachable: boolean;
  cost: number;
  kind?: TreasureCellKind;
  label?: string;
  reward?: string;
};

export type TreasureHint = {
  key: string;
  label: string;
};

export type TreasureSession = {
  siteId: string;
  /** 기존 탐사지 선택/업적 호환용 ID. 지도형 발굴에서는 보상 로직의 공개 정보가 아니다. */
  siteOptionId: TreasureSiteOptionId;
  /** 박제된 골동품 종류 (서버 전용 비밀). */
  antiqueId: AntiqueId;
  /** 서버가 굴린 기초 보존상태. 최종 보존상태의 운 요소. */
  condition: number;
  /** 지반 불안정도. 높을수록 위험 타일의 피해가 커진다. */
  instability: number;
  /** 가로 칸 수. 저장 키 호환 때문에 이름은 gridSize 유지. */
  gridSize: number;
  gridHeight: number;
  position: number;
  camp: number;
  energy: number;
  maxEnergy: number;
  tools: TreasureTools;
  cells: TreasureCell[];
  /** 입구에서 아래로 가장 깊게 내려간 y 좌표. */
  depth: number;
  maxDepth: number;
  /** 현재 들고 있는 발견물 가치. 성공 회수 전까지는 확정 보상이 아니다. */
  haul: number;
  stability: number;
  risk: number;
  insight: number;
  actionsAllowed: number;
  actions: TreasureActionRecord[];
  openedAt: number;
};

export type TreasureSitePublic = {
  siteId: string;
  gridSize: number;
  gridHeight: number;
  position: number;
  camp: number;
  energy: number;
  maxEnergy: number;
  tools: TreasureTools;
  cells: TreasureCellPublic[];
  depth: number;
  maxDepth: number;
  haul: number;
  stability: number;
  risk: number;
  insight: number;
  actionsAllowed: number;
  actionsUsed: number;
  canRetreat: boolean;
  forcedRetreat: boolean;
  adjacentHidden: number;
  summary: TreasureRunSummary;
  hints: TreasureHint[];
  actions: TreasureActionRecord[];
};

export type TreasureRunSummary = {
  revealed: number;
  caches: number;
  relics: number;
  supplies: number;
  fissures: number;
  deepestDistance: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function riskTax(risk: number): number {
  if (risk >= 90) return 12;
  if (risk >= 75) return 7;
  if (risk >= 60) return 3;
  return 0;
}

function xy(index: number, width: number): { x: number; y: number } {
  return { x: index % width, y: Math.floor(index / width) };
}

function indexOf(x: number, y: number, width: number): number {
  return y * width + x;
}

function distance(a: number, b: number, width: number): number {
  const av = xy(a, width);
  const bv = xy(b, width);
  return Math.abs(av.x - bv.x) + Math.abs(av.y - bv.y);
}

function verticalDepth(index: number, width: number): number {
  return xy(index, width).y;
}

function adjacentIndexes(index: number, width: number, height: number): number[] {
  const { x, y } = xy(index, width);
  const out: number[] = [];
  if (y > 0) out.push(indexOf(x, y - 1, width));
  if (x < width - 1) out.push(indexOf(x + 1, y, width));
  if (y < height - 1) out.push(indexOf(x, y + 1, width));
  if (x > 0) out.push(indexOf(x - 1, y, width));
  return out;
}

function isAdjacent(a: number, b: number, width: number): boolean {
  return distance(a, b, width) === 1;
}

function instabilityForAntique(antiqueId: AntiqueId, rng: () => number): number {
  const tier = ANTIQUES[antiqueId].tier;
  const tierTax = {
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
  }[tier];
  return tierTax + Math.floor(rng() * 7);
}

function cellCost(kind: TreasureCellKind): number {
  switch (kind) {
    case "rock":
      return 4;
    case "dense":
      return 3;
    case "cache":
    case "relic":
      return 2;
    default:
      return 1;
  }
}

function cellLabel(kind: TreasureCellKind): string {
  switch (kind) {
    case "camp":
      return "입구";
    case "soil":
      return "흙";
    case "dense":
      return "단단한 흙";
    case "rock":
      return "암반";
    case "clue":
      return "유물 반응";
    case "cache":
      return "묻힌 상자";
    case "supply":
      return "보급품";
    case "relic":
      return "고대 유물층";
    case "fissure":
      return "균열";
  }
}

function cellRewardLabel(kind: TreasureCellKind): string {
  switch (kind) {
    case "camp":
      return "귀환 지점";
    case "soil":
      return "소량 전리품";
    case "dense":
      return "중간 전리품";
    case "rock":
      return "광물 섞인 전리품";
    case "clue":
      return "판독 증가";
    case "cache":
      return "상자 전리품";
    case "supply":
      return "연료 회복";
    case "relic":
      return "큰 전리품";
    case "fissure":
      return "고위험 전리품";
  }
}

function kindFromRoll(r: number, y: number, height: number): TreasureCellKind {
  const depthRatio = height <= 1 ? 0 : y / (height - 1);
  if (r < 0.05 + depthRatio * 0.13) return "rock";
  if (r < 0.18 + depthRatio * 0.15) return "dense";
  if (r < 0.3) return "clue";
  if (r < 0.4 + depthRatio * 0.08) return "cache";
  if (r < 0.52 - depthRatio * 0.1) return "supply";
  if (r < 0.58 + depthRatio * 0.1) return "fissure";
  return "soil";
}

function buildCells(
  rng: () => number,
  width: number,
  height: number,
  camp: number,
): TreasureCell[] {
  const total = width * height;
  const cells: TreasureCell[] = [];
  const campNeighbors = new Set(adjacentIndexes(camp, width, height));
  const relicCandidates = Array.from({ length: total }, (_, i) => i).filter(
    (i) => i !== camp && verticalDepth(i, width) >= height - 3,
  );
  const relicIndex =
    relicCandidates[Math.floor(rng() * relicCandidates.length)] ?? total - 1;

  for (let i = 0; i < total; i += 1) {
    const { y } = xy(i, width);
    let kind: TreasureCellKind = "soil";
    if (i === camp) kind = "camp";
    else if (i === relicIndex) kind = "relic";
    else if (campNeighbors.has(i)) kind = rng() < 0.3 ? "cache" : "soil";
    else kind = kindFromRoll(rng(), y, height);
    cells.push({
      index: i,
      kind,
      revealed: i === camp,
      scanned: false,
      depleted: i === camp,
    });
  }
  return cells;
}

function fallbackCells(width: number, height: number, camp: number): TreasureCell[] {
  const cells = buildCells(() => 0.72, width, height, camp);
  const relic = cells[cells.length - 1];
  cells[relic.index] = { ...relic, kind: "relic", revealed: false, scanned: false };
  return cells;
}

function cellEffect(
  kind: TreasureCellKind,
  instability: number,
): {
  haul: number;
  stability: number;
  risk: number;
  insight: number;
  energy: number;
  message: string;
} {
  switch (kind) {
    case "soil":
      return {
        haul: 7,
        stability: -1,
        risk: 1,
        insight: 3,
        energy: 0,
        message: "무른 흙을 걷어내 작은 발견물을 챙겼습니다.",
      };
    case "dense":
      return {
        haul: 24,
        stability: -5,
        risk: 8 + Math.ceil(instability / 2),
        insight: 5,
        energy: 0,
        message: "단단한 흙층을 뚫고 묵직한 발견물을 챙겼습니다.",
      };
    case "rock":
      return {
        haul: 40,
        stability: -10,
        risk: 15 + instability,
        insight: 6,
        energy: 0,
        message: "암반을 깨자 광물과 뒤섞인 유물이 드러났습니다.",
      };
    case "clue":
      return {
        haul: 10,
        stability: -2,
        risk: 4,
        insight: 26,
        energy: 0,
        message: "흙결의 반응을 읽어 유물의 성격을 더 좁혔습니다.",
      };
    case "cache":
      return {
        haul: 52,
        stability: -4,
        risk: 9 + Math.ceil(instability / 2),
        insight: 10,
        energy: 0,
        message: "묻힌 상자를 열어 값나가는 조각을 챙겼습니다.",
      };
    case "supply":
      return {
        haul: 6,
        stability: 5,
        risk: -6,
        insight: 4,
        energy: 5,
        message: "낡은 보급품을 찾아 드릴 연료를 회복했습니다.",
      };
    case "relic":
      return {
        haul: 135,
        stability: -8,
        risk: 16 + instability,
        insight: 38,
        energy: 0,
        message: "고대 유물층에 닿았습니다. 큰 발견물을 확보했습니다.",
      };
    case "fissure":
      return {
        haul: 34,
        stability: -13,
        risk: 24 + instability,
        insight: 12,
        energy: 0,
        message: "균열을 비집고 들어가 발견물을 얻었지만 지반이 크게 흔들렸습니다.",
      };
    case "camp":
      return {
        haul: 0,
        stability: 0,
        risk: 0,
        insight: 0,
        energy: 0,
        message: "입구를 확인했습니다.",
      };
  }
}

function bombEffect(kind: TreasureCellKind, instability: number): ReturnType<typeof cellEffect> {
  const base = cellEffect(kind, instability);
  return {
    ...base,
    haul: clamp(base.haul * (kind === "rock" || kind === "fissure" ? 1.1 : 0.85), 0, 999),
    stability: Math.min(0, base.stability + 5),
    risk: Math.max(0, Math.floor(base.risk * 0.35)),
    insight: clamp(base.insight * 0.75, 0, 100),
    energy: base.energy,
    message:
      kind === "rock" || kind === "fissure"
        ? "폭약으로 위험한 지형을 크게 열어 발견물을 확보했습니다."
        : "폭약으로 길을 냈습니다. 빠르지만 세밀한 단서는 일부 흩어졌습니다.",
  };
}

export function finalConditionForSession(session: TreasureSession): number {
  const depthBonus = Math.min(24, session.depth * 2.8 + session.haul * 0.045);
  const energyBonus = Math.min(8, session.energy * 0.35);
  return clamp(
    session.condition * 0.42 +
      session.stability * 0.36 +
      depthBonus +
      energyBonus +
      session.insight * 0.07 -
      riskTax(session.risk),
    MIN_CONDITION,
    100,
  );
}

export function safeExitConditionForSession(session: TreasureSession): number {
  const safeSession = {
    ...session,
    risk: clamp(session.risk - 36, 0, COLLAPSE_RISK),
    stability: clamp(session.stability + 10, 0, 100),
  };
  return clamp(finalConditionForSession(safeSession) + 3, MIN_CONDITION, 100);
}

export function summaryForSession(session: TreasureSession): TreasureRunSummary {
  const revealedCells = session.cells.filter((c) => c.revealed);
  return {
    revealed: revealedCells.length,
    caches: revealedCells.filter((c) => c.kind === "cache").length,
    relics: revealedCells.filter((c) => c.kind === "relic").length,
    supplies: revealedCells.filter((c) => c.kind === "supply").length,
    fissures: revealedCells.filter((c) => c.kind === "fissure").length,
    deepestDistance: session.depth,
  };
}

export function hintsForSession(session: TreasureSession): TreasureHint[] {
  const antique = ANTIQUES[session.antiqueId];
  const tier = ANTIQUE_TIERS[antique.tier];
  const hints: TreasureHint[] = [];
  if (session.insight >= 15) {
    hints.push({
      key: "theme",
      label: `${ANTIQUE_THEME_LABEL[antique.theme]} 계열 흔적`,
    });
  }
  if (session.insight >= 35) {
    hints.push({
      key: "tier",
      label: `${tier.label} 등급 반응`,
    });
  }
  if (session.insight >= 60) {
    hints.push({
      key: "value",
      label: `온전하면 약 ${antique.baseValue.toLocaleString()}G급`,
    });
  }
  if (session.insight >= 85 || session.cells.some((c) => c.kind === "relic" && c.revealed)) {
    hints.push({
      key: "name",
      label: antique.name,
    });
  }
  return hints;
}

function toPublicCell(session: TreasureSession, cell: TreasureCell): TreasureCellPublic {
  const adjacent = isAdjacent(session.position, cell.index, session.gridSize);
  const current = session.position === cell.index;
  const visibleKind = cell.revealed || cell.scanned || current ? cell.kind : undefined;
  return {
    index: cell.index,
    ...xy(cell.index, session.gridSize),
    revealed: cell.revealed,
    scanned: cell.scanned,
    depleted: cell.depleted,
    adjacent,
    current,
    reachable: adjacent && session.energy > 0,
    cost: visibleKind ? cellCost(visibleKind) : 1,
    kind: visibleKind,
    label: visibleKind ? cellLabel(visibleKind) : undefined,
    reward: visibleKind ? cellRewardLabel(visibleKind) : undefined,
  };
}

export function toPublicSite(s: TreasureSession): TreasureSitePublic {
  const actionsUsed = s.actions.length;
  return {
    siteId: s.siteId,
    gridSize: s.gridSize,
    gridHeight: s.gridHeight,
    position: s.position,
    camp: s.camp,
    energy: s.energy,
    maxEnergy: s.maxEnergy,
    tools: { ...s.tools },
    cells: s.cells.map((c) => toPublicCell(s, c)),
    depth: s.depth,
    maxDepth: s.maxDepth,
    haul: s.haul,
    stability: s.stability,
    risk: s.risk,
    insight: s.insight,
    actionsAllowed: s.actionsAllowed,
    actionsUsed,
    canRetreat: s.haul > 0,
    forcedRetreat: s.energy <= 0 || actionsUsed >= s.actionsAllowed,
    adjacentHidden: adjacentIndexes(s.position, s.gridSize, s.gridHeight).filter(
      (i) => !s.cells[i]?.revealed,
    ).length,
    summary: summaryForSession(s),
    hints: hintsForSession(s),
    actions: s.actions.map((a) => ({ ...a })),
  };
}

export function rollNewSession(args: {
  siteId: string;
  siteOptionId?: TreasureSiteOptionId;
  rng: () => number;
  now: number;
}): TreasureSession {
  const { siteId, rng, now } = args;
  const antiqueId = pickAntiqueId(rng);
  const gridSize = TREASURE_GRID_SIZE;
  const gridHeight = TREASURE_GRID_HEIGHT;
  const camp = indexOf(Math.floor(gridSize / 2), 0, gridSize);
  return {
    siteId,
    siteOptionId: args.siteOptionId ?? DEFAULT_TREASURE_SITE_OPTION_ID,
    antiqueId,
    condition: rollCondition(antiqueId, rng),
    instability: instabilityForAntique(antiqueId, rng),
    gridSize,
    gridHeight,
    position: camp,
    camp,
    energy: TREASURE_MAX_ENERGY,
    maxEnergy: TREASURE_MAX_ENERGY,
    tools: { bombs: TREASURE_START_BOMBS, ropes: TREASURE_START_ROPES },
    cells: buildCells(rng, gridSize, gridHeight, camp),
    depth: 0,
    maxDepth: MAX_DEPTH,
    haul: 0,
    stability: 92 + Math.floor(rng() * 7),
    risk: 8 + Math.floor(rng() * 8),
    insight: 0,
    actionsAllowed: ACTIONS_ALLOWED,
    actions: [],
    openedAt: now,
  };
}

export type TreasureActionResult =
  | { kind: "invalid"; session: TreasureSession }
  | { kind: "progress"; session: TreasureSession; message: string }
  | { kind: "collapsed"; session: TreasureSession; message: string }
  | { kind: "failed"; session: TreasureSession; message: string }
  | { kind: "extracted"; session: TreasureSession; condition: number };

function appendRecord(
  session: TreasureSession,
  action: TreasureAction,
  target: TreasureActionTarget | undefined,
  message: string,
): TreasureSession {
  return {
    ...session,
    actions: [
      ...session.actions,
      {
        action,
        cell: target?.cell,
        depth: session.depth,
        haul: session.haul,
        stability: session.stability,
        risk: session.risk,
        insight: session.insight,
        energy: session.energy,
        message,
      },
    ],
  };
}

function collapseIfNeeded(session: TreasureSession): TreasureActionResult | null {
  if (session.risk >= COLLAPSE_RISK || session.stability <= 0) {
    return {
      kind: "collapsed",
      session,
      message: "갱도가 무너져 들고 있던 발견물을 모두 잃었습니다.",
    };
  }
  return null;
}

function applyExcavate(
  session: TreasureSession,
  target: TreasureActionTarget | undefined,
): TreasureActionResult {
  const cellIndex = target?.cell;
  if (typeof cellIndex !== "number" || !Number.isInteger(cellIndex)) {
    return { kind: "invalid", session };
  }
  const cell = session.cells[cellIndex];
  if (!cell || cell.revealed || !isAdjacent(session.position, cellIndex, session.gridSize)) {
    return { kind: "invalid", session };
  }
  const cost = cellCost(cell.kind);
  if (session.energy < cost) return { kind: "invalid", session };

  const effect = cellEffect(cell.kind, session.instability);
  const cells = session.cells.map((c) =>
    c.index === cellIndex
      ? { ...c, revealed: true, scanned: false, depleted: true }
      : c,
  );
  const nextPosition = cellIndex;
  const next: TreasureSession = {
    ...session,
    cells,
    position: nextPosition,
    energy: clamp(session.energy - cost + effect.energy, 0, session.maxEnergy),
    depth: Math.max(session.depth, verticalDepth(nextPosition, session.gridSize)),
    haul: clamp(session.haul + effect.haul, 0, 999),
    stability: clamp(session.stability + effect.stability, 0, 100),
    risk: clamp(session.risk + effect.risk, 0, COLLAPSE_RISK),
    insight: clamp(session.insight + effect.insight, 0, 100),
  };
  const recorded = appendRecord(next, "excavate", target, effect.message);
  return collapseIfNeeded(recorded) ?? { kind: "progress", session: recorded, message: effect.message };
}

function applyBomb(
  session: TreasureSession,
  target: TreasureActionTarget | undefined,
): TreasureActionResult {
  const cellIndex = target?.cell;
  if (session.tools.bombs <= 0) return { kind: "invalid", session };
  if (typeof cellIndex !== "number" || !Number.isInteger(cellIndex)) {
    return { kind: "invalid", session };
  }
  const cell = session.cells[cellIndex];
  if (!cell || cell.revealed || !isAdjacent(session.position, cellIndex, session.gridSize)) {
    return { kind: "invalid", session };
  }
  if (session.energy < 1) return { kind: "invalid", session };

  const effect = bombEffect(cell.kind, session.instability);
  const cells = session.cells.map((c) =>
    c.index === cellIndex
      ? { ...c, revealed: true, scanned: false, depleted: true }
      : c,
  );
  const next: TreasureSession = {
    ...session,
    cells,
    position: cellIndex,
    tools: { ...session.tools, bombs: session.tools.bombs - 1 },
    energy: clamp(session.energy - 1 + effect.energy, 0, session.maxEnergy),
    depth: Math.max(session.depth, verticalDepth(cellIndex, session.gridSize)),
    haul: clamp(session.haul + effect.haul, 0, 999),
    stability: clamp(session.stability + effect.stability, 0, 100),
    risk: clamp(session.risk + effect.risk, 0, COLLAPSE_RISK),
    insight: clamp(session.insight + effect.insight, 0, 100),
  };
  const recorded = appendRecord(next, "bomb", target, effect.message);
  return collapseIfNeeded(recorded) ?? { kind: "progress", session: recorded, message: effect.message };
}

function applyMove(
  session: TreasureSession,
  target: TreasureActionTarget | undefined,
): TreasureActionResult {
  const cellIndex = target?.cell;
  if (typeof cellIndex !== "number" || !Number.isInteger(cellIndex)) {
    return { kind: "invalid", session };
  }
  const cell = session.cells[cellIndex];
  if (!cell || !cell.revealed || !isAdjacent(session.position, cellIndex, session.gridSize)) {
    return { kind: "invalid", session };
  }
  if (session.energy < 1) return { kind: "invalid", session };
  const next: TreasureSession = {
    ...session,
    position: cellIndex,
    energy: clamp(session.energy - 1, 0, session.maxEnergy),
    depth: Math.max(session.depth, verticalDepth(cellIndex, session.gridSize)),
  };
  const message = `${cellLabel(cell.kind)} 칸으로 이동했습니다.`;
  const recorded = appendRecord(next, "move", target, message);
  return { kind: "progress", session: recorded, message };
}

function applyScan(session: TreasureSession): TreasureActionResult {
  if (session.energy < 2) return { kind: "invalid", session };
  const around = new Set(adjacentIndexes(session.position, session.gridSize, session.gridHeight));
  let scanned = 0;
  const cells = session.cells.map((c) => {
    if (!around.has(c.index) || c.revealed || c.scanned) return c;
    scanned += 1;
    return { ...c, scanned: true };
  });
  if (scanned === 0) return { kind: "invalid", session };
  const next: TreasureSession = {
    ...session,
    cells,
    energy: clamp(session.energy - 2, 0, session.maxEnergy),
    insight: clamp(session.insight + 12 + scanned * 3, 0, 100),
    risk: clamp(session.risk + 3, 0, COLLAPSE_RISK),
  };
  const message = `주변 ${scanned}칸의 지형을 탐지했습니다.`;
  const recorded = appendRecord(next, "scan", undefined, message);
  return { kind: "progress", session: recorded, message };
}

function applySecure(session: TreasureSession): TreasureActionResult {
  if (session.energy < 2) return { kind: "invalid", session };
  const next: TreasureSession = {
    ...session,
    energy: clamp(session.energy - 2, 0, session.maxEnergy),
    stability: clamp(session.stability + 16, 0, 100),
    risk: clamp(session.risk - 24 - Math.floor(session.stability / 28), 0, COLLAPSE_RISK),
    insight: clamp(session.insight + 4, 0, 100),
  };
  const message = "버팀목을 세워 지반을 붙잡았습니다.";
  const recorded = appendRecord(next, "secure", undefined, message);
  return { kind: "progress", session: recorded, message };
}

export function applyTreasureAction(
  session: TreasureSession,
  action: TreasureAction,
  target?: TreasureActionTarget,
): TreasureActionResult {
  if (!isTreasureAction(action)) return { kind: "invalid", session };

  if (action === "retreat") {
    if (session.haul <= 0) {
      const message = "챙길 발견물이 없는 상태로 귀환해 발굴이 무산됐습니다.";
      const next = appendRecord(session, action, target, message);
      return { kind: "failed", session: next, message };
    }
    const next = appendRecord(session, action, target, "발견물을 들고 지상으로 귀환했습니다.");
    return {
      kind: "extracted",
      session: next,
      condition: finalConditionForSession(next),
    };
  }

  if (action === "rope") {
    if (session.haul <= 0 || session.tools.ropes <= 0) {
      const message =
        session.haul <= 0
          ? "챙길 발견물이 없어 로프를 회수했습니다."
          : "쓸 수 있는 로프가 없습니다.";
      return { kind: "invalid", session: appendRecord(session, action, target, message) };
    }
    const safeSession: TreasureSession = {
      ...session,
      tools: { ...session.tools, ropes: session.tools.ropes - 1 },
      risk: clamp(session.risk - 36, 0, COLLAPSE_RISK),
      stability: clamp(session.stability + 10, 0, 100),
    };
    const next = appendRecord(safeSession, action, target, "로프를 타고 발견물을 안전하게 끌어올렸습니다.");
    return {
      kind: "extracted",
      session: next,
      condition: clamp(finalConditionForSession(next) + 3, MIN_CONDITION, 100),
    };
  }

  if (session.actions.length >= session.actionsAllowed || session.energy <= 0) {
    return { kind: "invalid", session };
  }

  switch (action) {
    case "excavate":
      return applyExcavate(session, target);
    case "move":
      return applyMove(session, target);
    case "scan":
      return applyScan(session);
    case "bomb":
      return applyBomb(session, target);
    case "secure":
      return applySecure(session);
  }
}

export function isTreasureAction(v: unknown): v is TreasureAction {
  return (
    v === "excavate" ||
    v === "move" ||
    v === "scan" ||
    v === "bomb" ||
    v === "secure" ||
    v === "rope" ||
    v === "retreat"
  );
}

export function isTreasureSiteOptionId(v: unknown): v is TreasureSiteOptionId {
  return (
    typeof v === "string" &&
    (TREASURE_SITE_OPTIONS as readonly string[]).includes(v)
  );
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === "object";
}

function parseCell(raw: unknown, totalCells: number): TreasureCell | null {
  if (!isRecord(raw)) return null;
  const { index, kind, revealed, scanned, depleted } = raw;
  if (
    typeof index !== "number" ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= totalCells ||
    !isTreasureCellKind(kind) ||
    typeof revealed !== "boolean" ||
    typeof scanned !== "boolean" ||
    typeof depleted !== "boolean"
  ) {
    return null;
  }
  return { index, kind, revealed, scanned, depleted };
}

function parseActionRecord(raw: unknown): TreasureActionRecord | null {
  if (!isRecord(raw)) return null;
  if (!isTreasureAction(raw.action)) return null;
  const { cell, depth, haul, stability, risk, insight, energy, message } = raw;
  if (
    typeof depth !== "number" ||
    typeof haul !== "number" ||
    typeof stability !== "number" ||
    typeof risk !== "number" ||
    typeof insight !== "number" ||
    typeof energy !== "number" ||
    typeof message !== "string"
  ) {
    return null;
  }
  if (
    depth < 0 ||
    depth > MAX_DEPTH ||
    haul < 0 ||
    haul > 999 ||
    stability < 0 ||
    stability > 100 ||
    risk < 0 ||
    risk > COLLAPSE_RISK ||
    insight < 0 ||
    insight > 100 ||
    energy < 0 ||
    energy > TREASURE_MAX_ENERGY
  ) {
    return null;
  }
  if (cell !== undefined && (typeof cell !== "number" || !Number.isInteger(cell))) {
    return null;
  }
  return {
    action: raw.action,
    cell,
    depth: clamp(depth, 0, MAX_DEPTH),
    haul: clamp(haul, 0, 999),
    stability: clamp(stability, 0, 100),
    risk: clamp(risk, 0, COLLAPSE_RISK),
    insight: clamp(insight, 0, 100),
    energy: clamp(energy, 0, TREASURE_MAX_ENERGY),
    message,
  };
}

function parseTools(raw: unknown): TreasureTools | null {
  if (raw === undefined) {
    return { bombs: TREASURE_START_BOMBS, ropes: TREASURE_START_ROPES };
  }
  if (!isRecord(raw)) return null;
  const { bombs, ropes } = raw;
  if (
    typeof bombs !== "number" ||
    typeof ropes !== "number" ||
    !Number.isInteger(bombs) ||
    !Number.isInteger(ropes) ||
    bombs < 0 ||
    bombs > TREASURE_START_BOMBS ||
    ropes < 0 ||
    ropes > TREASURE_START_ROPES
  ) {
    return null;
  }
  return { bombs, ropes };
}

function legacyRecord(
  action: TreasureAction,
  depth: number,
  haul: number,
  stability: number,
  risk: number,
  insight: number,
  energy: number,
  message: string,
): TreasureActionRecord {
  return { action, depth, haul, stability, risk, insight, energy, message };
}

function legacySessionBase(raw: Record<string, unknown>, migratedActions: number) {
  const gridSize = TREASURE_GRID_SIZE;
  const gridHeight = TREASURE_GRID_HEIGHT;
  const camp = indexOf(Math.floor(gridSize / 2), 0, gridSize);
  const cells = fallbackCells(gridSize, gridHeight, camp);
  for (const cell of cells) {
    if (distance(cell.index, camp, gridSize) <= 1) cell.revealed = true;
  }
  const position =
    adjacentIndexes(camp, gridSize, gridHeight).find(
      (i) => verticalDepth(i, gridSize) > 0,
    ) ?? camp;
  return {
    gridSize,
    gridHeight,
    camp,
    position,
    cells,
    tools: { bombs: TREASURE_START_BOMBS, ropes: TREASURE_START_ROPES },
    energy: clamp(TREASURE_MAX_ENERGY - migratedActions, 0, TREASURE_MAX_ENERGY),
    maxEnergy: TREASURE_MAX_ENERGY,
  };
}

function parseLegacyGridSession(raw: Record<string, unknown>): TreasureSession | null {
  if (typeof raw.siteId !== "string" || !raw.siteId) return null;
  if (typeof raw.antiqueId !== "string" || !isAntiqueId(raw.antiqueId)) return null;
  const condition = raw.condition;
  if (typeof condition !== "number" || condition < MIN_CONDITION || condition > 100) {
    return null;
  }
  if (
    typeof raw.gridSize !== "number" ||
    typeof raw.treasureCell !== "number" ||
    !Array.isArray(raw.digs)
  ) {
    return null;
  }
  const migratedActions = Math.min(raw.digs.length, ACTIONS_ALLOWED);
  const base = legacySessionBase(raw, migratedActions);
  const depth = clamp(Math.floor(migratedActions / 2), 0, 4);
  const haul = clamp(migratedActions * 18, 0, 140);
  const stability = clamp(92 - migratedActions * 4, 0, 100);
  const risk = clamp(14 + migratedActions * 7, 0, 82);
  const insight = clamp(migratedActions * 14, 0, 88);
  const actions: TreasureActionRecord[] = Array.from(
    { length: migratedActions },
    (_, idx) =>
      legacyRecord(
        "excavate",
        clamp(Math.floor((idx + 1) / 2), 0, 4),
        clamp((idx + 1) * 18, 0, 140),
        clamp(92 - (idx + 1) * 4, 0, 100),
        clamp(14 + (idx + 1) * 7, 0, 82),
        clamp((idx + 1) * 14, 0, 88),
        clamp(TREASURE_MAX_ENERGY - (idx + 1), 0, TREASURE_MAX_ENERGY),
        "이전 발굴 기록을 지도형 발굴로 이전했습니다.",
      ),
  );
  return {
    siteId: raw.siteId,
    siteOptionId: isTreasureSiteOptionId(raw.siteOptionId)
      ? raw.siteOptionId
      : DEFAULT_TREASURE_SITE_OPTION_ID,
    antiqueId: raw.antiqueId,
    condition: clamp(condition, MIN_CONDITION, 100),
    instability: 3,
    ...base,
    depth,
    maxDepth: MAX_DEPTH,
    haul,
    stability,
    risk,
    insight,
    actionsAllowed: ACTIONS_ALLOWED,
    actions,
    openedAt:
      typeof raw.openedAt === "number" && Number.isFinite(raw.openedAt)
        ? raw.openedAt
        : 0,
  };
}

function parseLegacyExposureSession(raw: Record<string, unknown>): TreasureSession | null {
  if (typeof raw.siteId !== "string" || !raw.siteId) return null;
  if (typeof raw.antiqueId !== "string" || !isAntiqueId(raw.antiqueId)) return null;
  const { condition, exposure, preservation, risk, certainty } = raw;
  if (
    typeof condition !== "number" ||
    typeof exposure !== "number" ||
    typeof preservation !== "number" ||
    typeof risk !== "number" ||
    typeof certainty !== "number"
  ) {
    return null;
  }
  if (
    condition < MIN_CONDITION ||
    condition > 100 ||
    exposure < 0 ||
    exposure > 100 ||
    preservation < MIN_CONDITION ||
    preservation > 100 ||
    risk < 0 ||
    risk > COLLAPSE_RISK ||
    certainty < 0 ||
    certainty > 100
  ) {
    return null;
  }
  const sourceActions = Array.isArray(raw.actions) ? raw.actions : [];
  const migratedActions = Math.min(sourceActions.length, ACTIONS_ALLOWED);
  const base = legacySessionBase(raw, migratedActions);
  const depth = clamp(Math.floor(exposure / 18), 0, MAX_DEPTH);
  const haul = clamp(exposure * 1.2 + migratedActions * 8, 0, 220);
  const stability = clamp(preservation, 0, 100);
  const insight = clamp(certainty, 0, 100);
  const actions: TreasureActionRecord[] = Array.from(
    { length: migratedActions },
    (_, idx) =>
      legacyRecord(
        "excavate",
        clamp(Math.floor(((idx + 1) / Math.max(1, migratedActions)) * depth), 0, MAX_DEPTH),
        clamp(((idx + 1) / Math.max(1, migratedActions)) * haul, 0, 220),
        clamp(100 - (idx + 1) * 5, 0, 100),
        clamp(12 + (idx + 1) * 8, 0, 90),
        clamp(((idx + 1) / Math.max(1, migratedActions)) * insight, 0, 100),
        clamp(TREASURE_MAX_ENERGY - (idx + 1), 0, TREASURE_MAX_ENERGY),
        "이전 발굴 기록을 지도형 발굴로 이전했습니다.",
      ),
  );
  return {
    siteId: raw.siteId,
    siteOptionId: isTreasureSiteOptionId(raw.siteOptionId)
      ? raw.siteOptionId
      : DEFAULT_TREASURE_SITE_OPTION_ID,
    antiqueId: raw.antiqueId,
    condition: clamp(condition, MIN_CONDITION, 100),
    instability:
      typeof raw.instability === "number" && raw.instability >= 0 && raw.instability <= 20
        ? clamp(raw.instability, 0, 20)
        : 3,
    ...base,
    depth,
    maxDepth: MAX_DEPTH,
    haul,
    stability,
    risk: clamp(risk, 0, 92),
    insight,
    actionsAllowed: ACTIONS_ALLOWED,
    actions,
    openedAt:
      typeof raw.openedAt === "number" && Number.isFinite(raw.openedAt)
        ? raw.openedAt
        : 0,
  };
}

function parseLegacyDepthSession(raw: Record<string, unknown>): TreasureSession | null {
  if (typeof raw.siteId !== "string" || !raw.siteId) return null;
  if (typeof raw.antiqueId !== "string" || !isAntiqueId(raw.antiqueId)) return null;
  const { condition, instability, depth, maxDepth, haul, stability, risk, insight } = raw;
  const actionsAllowed = raw.actionsAllowed;
  if (
    typeof condition !== "number" ||
    typeof instability !== "number" ||
    typeof depth !== "number" ||
    typeof maxDepth !== "number" ||
    typeof haul !== "number" ||
    typeof stability !== "number" ||
    typeof risk !== "number" ||
    typeof insight !== "number" ||
    typeof actionsAllowed !== "number" ||
    !Array.isArray(raw.actions)
  ) {
    return null;
  }
  const base = legacySessionBase(raw, raw.actions.length);
  const actions: TreasureActionRecord[] = [];
  for (const a of raw.actions) {
    if (!isRecord(a)) return null;
    const action =
      a.action === "secure" || a.action === "retreat" ? a.action : "excavate";
    actions.push(
      legacyRecord(
        action,
        typeof a.depth === "number" ? clamp(a.depth, 0, MAX_DEPTH) : 0,
        typeof a.haul === "number" ? clamp(a.haul, 0, 999) : 0,
        typeof a.stability === "number" ? clamp(a.stability, 0, 100) : 80,
        typeof a.risk === "number" ? clamp(a.risk, 0, COLLAPSE_RISK) : 20,
        typeof a.insight === "number" ? clamp(a.insight, 0, 100) : 0,
        TREASURE_MAX_ENERGY,
        typeof a.message === "string"
          ? a.message
          : "이전 발굴 기록을 지도형 발굴로 이전했습니다.",
      ),
    );
  }
  return {
    siteId: raw.siteId,
    siteOptionId: isTreasureSiteOptionId(raw.siteOptionId)
      ? raw.siteOptionId
      : DEFAULT_TREASURE_SITE_OPTION_ID,
    antiqueId: raw.antiqueId,
    condition: clamp(condition, MIN_CONDITION, 100),
    instability: clamp(instability, 0, 20),
    ...base,
    depth: clamp(depth, 0, MAX_DEPTH),
    maxDepth: MAX_DEPTH,
    haul: clamp(haul, 0, 999),
    stability: clamp(stability, 0, 100),
    risk: clamp(risk, 0, COLLAPSE_RISK),
    insight: clamp(insight, 0, 100),
    actionsAllowed: ACTIONS_ALLOWED,
    actions,
    openedAt:
      typeof raw.openedAt === "number" && Number.isFinite(raw.openedAt)
        ? raw.openedAt
        : 0,
  };
}

function isTreasureCellKind(v: unknown): v is TreasureCellKind {
  return (
    v === "camp" ||
    v === "soil" ||
    v === "dense" ||
    v === "rock" ||
    v === "clue" ||
    v === "cache" ||
    v === "supply" ||
    v === "relic" ||
    v === "fissure"
  );
}

// 손상/빈 입력은 null(=열린 세션 없음). 예전 세션은 새 상태로 이전해 이미 쓴 지도 조각을 보존.
export function parseTreasureSession(raw: unknown): TreasureSession | null {
  if (!isRecord(raw)) return null;
  const legacyGrid = parseLegacyGridSession(raw);
  if (legacyGrid) return legacyGrid;
  const legacyExposure = parseLegacyExposureSession(raw);
  if (legacyExposure) return legacyExposure;
  const legacyDepth =
    !Array.isArray(raw.cells) ||
    raw.gridSize !== TREASURE_GRID_SIZE ||
    raw.gridHeight !== TREASURE_GRID_HEIGHT
      ? parseLegacyDepthSession(raw)
      : null;
  if (legacyDepth) return legacyDepth;

  if (typeof raw.siteId !== "string" || !raw.siteId) return null;
  if (typeof raw.antiqueId !== "string" || !isAntiqueId(raw.antiqueId)) return null;

  const {
    condition,
    instability,
    gridSize,
    gridHeight,
    position,
    camp,
    energy,
    maxEnergy,
    tools,
    depth,
    maxDepth,
    haul,
    stability,
    risk,
    insight,
  } = raw;
  const actionsAllowed = raw.actionsAllowed;
  if (
    typeof condition !== "number" ||
    typeof instability !== "number" ||
    typeof gridSize !== "number" ||
    typeof gridHeight !== "number" ||
    typeof position !== "number" ||
    typeof camp !== "number" ||
    typeof energy !== "number" ||
    typeof maxEnergy !== "number" ||
    (tools !== undefined && !isRecord(tools)) ||
    typeof depth !== "number" ||
    typeof maxDepth !== "number" ||
    typeof haul !== "number" ||
    typeof stability !== "number" ||
    typeof risk !== "number" ||
    typeof insight !== "number" ||
    typeof actionsAllowed !== "number"
  ) {
    return null;
  }
  if (
    condition < MIN_CONDITION ||
    condition > 100 ||
    instability < 0 ||
    instability > 20 ||
    gridSize !== TREASURE_GRID_SIZE ||
    gridHeight !== TREASURE_GRID_HEIGHT ||
    !Number.isInteger(position) ||
    !Number.isInteger(camp) ||
    position < 0 ||
    position >= gridSize * gridHeight ||
    camp < 0 ||
    camp >= gridSize * gridHeight ||
    energy < 0 ||
    energy > maxEnergy ||
    maxEnergy < 1 ||
    maxEnergy > TREASURE_MAX_ENERGY ||
    depth < 0 ||
    depth > MAX_DEPTH ||
    maxDepth < 1 ||
    maxDepth > MAX_DEPTH ||
    depth > maxDepth ||
    haul < 0 ||
    haul > 999 ||
    stability < 0 ||
    stability > 100 ||
    risk < 0 ||
    risk > COLLAPSE_RISK ||
    insight < 0 ||
    insight > 100 ||
    !Number.isInteger(actionsAllowed) ||
    actionsAllowed < 1 ||
    actionsAllowed > ACTIONS_ALLOWED ||
    !Array.isArray(raw.cells) ||
    raw.cells.length !== gridSize * gridHeight ||
    !Array.isArray(raw.actions) ||
    raw.actions.length > actionsAllowed + 1
  ) {
    return null;
  }

  const cells: TreasureCell[] = [];
  const seen = new Set<number>();
  for (const c of raw.cells) {
    const parsed = parseCell(c, gridSize * gridHeight);
    if (!parsed || seen.has(parsed.index)) return null;
    cells.push(parsed);
    seen.add(parsed.index);
  }
  cells.sort((a, b) => a.index - b.index);
  if (cells[camp]?.kind !== "camp" || !cells[camp]?.revealed) return null;
  if (!cells[position]?.revealed) return null;

  const actions: TreasureActionRecord[] = [];
  for (const a of raw.actions) {
    const parsed = parseActionRecord(a);
    if (!parsed) return null;
    if (parsed.cell !== undefined && (parsed.cell < 0 || parsed.cell >= gridSize * gridHeight)) {
      return null;
    }
    actions.push(parsed);
  }

  const openedAt =
    typeof raw.openedAt === "number" && Number.isFinite(raw.openedAt)
      ? raw.openedAt
      : 0;

  const parsedTools = parseTools(tools);
  if (!parsedTools) return null;

  return {
    siteId: raw.siteId,
    siteOptionId: isTreasureSiteOptionId(raw.siteOptionId)
      ? raw.siteOptionId
      : DEFAULT_TREASURE_SITE_OPTION_ID,
    antiqueId: raw.antiqueId,
    condition: clamp(condition, MIN_CONDITION, 100),
    instability: clamp(instability, 0, 20),
    gridSize,
    gridHeight,
    position,
    camp,
    energy: clamp(energy, 0, maxEnergy),
    maxEnergy: clamp(maxEnergy, 1, TREASURE_MAX_ENERGY),
    tools: parsedTools,
    cells,
    depth: clamp(depth, 0, MAX_DEPTH),
    maxDepth: clamp(maxDepth, 1, MAX_DEPTH),
    haul: clamp(haul, 0, 999),
    stability: clamp(stability, 0, 100),
    risk: clamp(risk, 0, COLLAPSE_RISK),
    insight: clamp(insight, 0, 100),
    actionsAllowed,
    actions,
    openedAt,
  };
}
