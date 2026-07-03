// 발굴 미니게임 — 격자 + 단서(뜨/따/미/차) 추리 + 매장지 적중. 서버 권위 순수 코어.
//
// 설계: docs/treasure-hunt-plan.md §4 §7
// open 이 격자/매장지/골동품을 서버에서 굴려 세션에 박제(클라는 격자만 본다), dig 가 이
// 순수 함수로 단서를 계산하고 적중을 판정한다. 매 dig 가 세션을 갱신(여러 번 호출).
//
// 봇 방지: 매장지·골동품(희귀도·보존상태)은 open 때 서버에서만 굴려 세션에 박제 → 클라가
// 결과를 못 만든다. 단서(거리 밴드)는 서버 계산. 조각 funnel 이 시도 자체를 throttle.

import {
  ANTIQUES,
  ANTIQUE_TIERS,
  ANTIQUE_TIER_ORDER,
  isAntiqueId,
  rollCondition,
  MIN_CONDITION,
  type AntiqueId,
  type AntiqueTheme,
  type AntiqueTier,
} from "@/adventure/data/v2/antique";

export const TREASURE_SESSION_KEY = "treasure-session.v1";

/** 격자 한 변 길이 (5×5). (다이얼) */
export const GRID_SIZE = 5;
/** 발굴 시도 횟수(예산). (다이얼) */
export const DIGS_ALLOWED = 6;
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
export const CONDITION_BONUS_PER_REMAINING_DIG = 3;
export const MAX_DIG_EFFICIENCY_CONDITION_BONUS = 15;

export type TreasureDigToolId = "shovel" | "probe";

export type TreasureDigTool = {
  id: TreasureDigToolId;
  name: string;
  summary: string;
  effectLabel: string;
};

export const TREASURE_DIG_TOOLS: readonly TreasureDigTool[] = [
  {
    id: "shovel",
    name: "삽",
    summary: "선택한 칸을 직접 파냅니다.",
    effectLabel: "적중 시 즉시 발굴",
  },
  {
    id: "probe",
    name: "탐침",
    summary: "흙을 크게 파내지 않고 주변 지층을 찔러봅니다.",
    effectLabel: "선택 칸과 상하좌우 단서 확인 · 행동 1회",
  },
] as const;

export const DEFAULT_TREASURE_DIG_TOOL_ID: TreasureDigToolId = "shovel";

export function isTreasureDigToolId(v: unknown): v is TreasureDigToolId {
  return TREASURE_DIG_TOOLS.some((tool) => tool.id === v);
}

export type TreasureSiteOptionId =
  | "old_market"
  | "royal_tomb"
  | "collapsed_shrine";

export type TreasureSiteOption = {
  id: TreasureSiteOptionId;
  name: string;
  summary: string;
  effectLabel: string;
  digsAllowedMod: number;
  conditionBonus: number;
  tierWeightMultiplier?: Partial<Record<AntiqueTier, number>>;
  themeWeightMultiplier?: Partial<Record<AntiqueTheme, number>>;
};

export const TREASURE_SITE_OPTIONS: readonly TreasureSiteOption[] = [
  {
    id: "old_market",
    name: "옛 시장터",
    summary: "주화와 장신구가 많이 묻힌 넓은 터.",
    effectLabel: "주화·장신구 확률 증가 · 발굴 +1회 · 보존 -3",
    digsAllowedMod: 1,
    conditionBonus: -3,
    themeWeightMultiplier: { coin: 2.2, ornament: 1.6 },
    tierWeightMultiplier: { common: 1.15, uncommon: 1.15 },
  },
  {
    id: "royal_tomb",
    name: "왕가의 묘역",
    summary: "깊이 봉인된 대신 값진 부장품이 나올 수 있는 곳.",
    effectLabel: "희귀 이상 확률 증가 · 발굴 -1회",
    digsAllowedMod: -1,
    conditionBonus: 0,
    tierWeightMultiplier: { rare: 1.65, epic: 1.85, legendary: 2.1 },
  },
  {
    id: "collapsed_shrine",
    name: "무너진 사당",
    summary: "유물장식이 온전한 상태로 남기 쉬운 조용한 폐허.",
    effectLabel: "유물장식 확률 증가 · 보존 +8",
    digsAllowedMod: 0,
    conditionBonus: 8,
    themeWeightMultiplier: { relic: 2.3 },
  },
] as const;

export const DEFAULT_TREASURE_SITE_OPTION_ID: TreasureSiteOptionId =
  "old_market";

export function isTreasureSiteOptionId(v: unknown): v is TreasureSiteOptionId {
  return TREASURE_SITE_OPTIONS.some((site) => site.id === v);
}

export function treasureSiteOptionById(
  siteOptionId: TreasureSiteOptionId,
): TreasureSiteOption {
  return (
    TREASURE_SITE_OPTIONS.find((site) => site.id === siteOptionId) ??
    TREASURE_SITE_OPTIONS[0]
  );
}

// 단서 — 매장지까지의 체비셰프 거리 밴드. (거리 0 = 적중)
export type DigClue = "hot" | "warm" | "lukewarm" | "cold";

export const DIG_CLUE_LABEL: Record<DigClue, string> = {
  hot: "뜨거움",
  warm: "따뜻함",
  lukewarm: "미지근함",
  cold: "차가움",
};

export type DigRecord = {
  cell: number;
  clue: DigClue;
  tool: TreasureDigToolId;
  /** 이 단서가 소비한 행동 수. 탐침으로 같이 드러난 주변 칸은 0일 수 있다. */
  actionCost: number;
};

export type TreasureSession = {
  siteId: string;
  /** 유저가 선택한 탐사지 타입. 오래된 세션은 파싱 시 기본값으로 보정한다. */
  siteOptionId: TreasureSiteOptionId;
  gridSize: number;
  /** 매장지 셀 (서버 전용 비밀). */
  treasureCell: number;
  /** 박제된 골동품 종류 (비밀). */
  antiqueId: AntiqueId;
  /** 박제된 보존상태 (비밀). */
  condition: number;
  digsAllowed: number;
  /** 파낸 셀 + 각 단서 (digsUsed = digs.length). 단서는 비밀 아님 — 유저가 얻은 정보. */
  digs: DigRecord[];
  openedAt: number;
};

// 클라에 내려보내는 공개 뷰 — 비밀(매장지/골동품/보존상태) 제거.
export type TreasureSitePublic = {
  siteId: string;
  siteOption: Pick<TreasureSiteOption, "id" | "name" | "summary" | "effectLabel"> & {
    digsAllowedMod: number;
    conditionBonus: number;
  };
  gridSize: number;
  digsAllowed: number;
  digsUsed: number;
  digs: DigRecord[];
};

export function toPublicSite(s: TreasureSession): TreasureSitePublic {
  const siteOption = treasureSiteOptionById(s.siteOptionId);
  return {
    siteId: s.siteId,
    siteOption: {
      id: siteOption.id,
      name: siteOption.name,
      summary: siteOption.summary,
      effectLabel: siteOption.effectLabel,
      digsAllowedMod: siteOption.digsAllowedMod,
      conditionBonus: siteOption.conditionBonus,
    },
    gridSize: s.gridSize,
    digsAllowed: s.digsAllowed,
    digsUsed: treasureActionsUsed(s),
    digs: s.digs.map((d) => ({
      cell: d.cell,
      clue: d.clue,
      tool: d.tool,
      actionCost: d.actionCost,
    })),
  };
}

// 셀 인덱스 → (행, 열). 인덱스 = 행 × gridSize + 열.
function cellRowCol(cell: number, gridSize: number): [number, number] {
  return [Math.floor(cell / gridSize), cell % gridSize];
}

// 두 셀의 체비셰프 거리 — max(|Δ행|, |Δ열|).
export function chebyshev(a: number, b: number, gridSize: number): number {
  const [ra, ca] = cellRowCol(a, gridSize);
  const [rb, cb] = cellRowCol(b, gridSize);
  return Math.max(Math.abs(ra - rb), Math.abs(ca - cb));
}

// 거리 → 단서 밴드. (거리 0 = 적중이라 여기 안 옴.)
export function clueForDistance(d: number): DigClue {
  if (d <= 1) return "hot";
  if (d === 2) return "warm";
  if (d === 3) return "lukewarm";
  return "cold";
}

function clampCondition(condition: number): number {
  return Math.max(MIN_CONDITION, Math.min(100, Math.floor(condition)));
}

export function treasureActionsUsed(session: TreasureSession): number {
  return session.digs.reduce((sum, dig) => sum + dig.actionCost, 0);
}

function pickAntiqueIdForSite(
  rng: () => number,
  siteOption: TreasureSiteOption,
): AntiqueId {
  const antiques = Object.values(ANTIQUES);
  const tierCounts = antiques.reduce(
    (counts, antique) => counts.set(antique.tier, (counts.get(antique.tier) ?? 0) + 1),
    new Map<AntiqueTier, number>(),
  );
  const candidates = antiques.map((antique) => {
    const tierMeta = ANTIQUE_TIERS[antique.tier];
    const tierMultiplier = siteOption.tierWeightMultiplier?.[antique.tier] ?? 1;
    const themeMultiplier =
      siteOption.themeWeightMultiplier?.[antique.theme] ?? 1;
    const baseWeight = tierMeta.digRarityWeight / (tierCounts.get(antique.tier) ?? 1);
    return {
      antique,
      weight: Math.max(
        0,
        baseWeight * tierMultiplier * themeMultiplier,
      ),
    };
  });
  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  let roll = rng() * total;
  for (const candidate of candidates) {
    if (roll < candidate.weight) return candidate.antique.id;
    roll -= candidate.weight;
  }
  const fallbackTier = ANTIQUE_TIER_ORDER[0];
  return (
    Object.values(ANTIQUES).find((antique) => antique.tier === fallbackTier)
      ?.id ?? "clay_shard"
  );
}

export function treasureConditionAfterHit(session: TreasureSession): number {
  const remaining = Math.max(0, session.digsAllowed - treasureActionsUsed(session));
  const efficiencyBonus = Math.min(
    MAX_DIG_EFFICIENCY_CONDITION_BONUS,
    remaining * CONDITION_BONUS_PER_REMAINING_DIG,
  );
  return clampCondition(session.condition + efficiencyBonus);
}

// 새 발굴 지점 굴림(순수) — 매장지·골동품·보존상태 박제. siteId 는 라우트가 발급.
export function rollNewSession(args: {
  siteId: string;
  siteOptionId?: TreasureSiteOptionId;
  rng: () => number;
  now: number;
}): TreasureSession {
  const {
    siteId,
    siteOptionId = DEFAULT_TREASURE_SITE_OPTION_ID,
    rng,
    now,
  } = args;
  const siteOption = treasureSiteOptionById(siteOptionId);
  const treasureCell = Math.min(TOTAL_CELLS - 1, Math.floor(rng() * TOTAL_CELLS));
  const antiqueId = pickAntiqueIdForSite(rng, siteOption);
  const condition = clampCondition(
    rollCondition(antiqueId, rng) + siteOption.conditionBonus,
  );
  return {
    siteId,
    siteOptionId: siteOption.id,
    gridSize: GRID_SIZE,
    treasureCell,
    antiqueId,
    condition,
    digsAllowed: Math.max(1, DIGS_ALLOWED + siteOption.digsAllowedMod),
    digs: [],
    openedAt: now,
  };
}

export type DigResult =
  | { kind: "invalid"; session: TreasureSession }
  | { kind: "probe"; clue: DigClue; revealed: DigRecord[]; session: TreasureSession }
  | { kind: "miss"; clue: DigClue; session: TreasureSession }
  | { kind: "exhausted"; clue: DigClue; session: TreasureSession }
  | { kind: "hit"; session: TreasureSession };

function clueForCell(session: TreasureSession, cell: number): DigClue {
  return clueForDistance(chebyshev(cell, session.treasureCell, session.gridSize));
}

function probeCellsFor(cell: number, gridSize: number): number[] {
  const [row, col] = cellRowCol(cell, gridSize);
  const cells = [cell];
  if (row > 0) cells.push(cell - gridSize);
  if (row < gridSize - 1) cells.push(cell + gridSize);
  if (col > 0) cells.push(cell - 1);
  if (col < gridSize - 1) cells.push(cell + 1);
  return cells;
}

function hasShovelDig(session: TreasureSession, cell: number): boolean {
  return session.digs.some((dig) => dig.cell === cell && dig.tool === "shovel");
}

function addShovelDig(session: TreasureSession, cell: number): DigRecord[] {
  const clue = clueForCell(session, cell);
  const existingIndex = session.digs.findIndex((dig) => dig.cell === cell);
  if (existingIndex < 0) {
    return [...session.digs, { cell, clue, tool: "shovel", actionCost: 1 }];
  }
  return session.digs.map((dig, index) =>
    index === existingIndex
      ? {
          cell,
          clue,
          tool: "shovel",
          actionCost: dig.actionCost + 1,
        }
      : dig,
  );
}

// 한 번 행동(순수). 삽은 한 칸을 파고, 탐침은 선택 칸+상하좌우 단서를 공개한다.
export function applyDig(
  session: TreasureSession,
  cell: number,
  tool: TreasureDigToolId = DEFAULT_TREASURE_DIG_TOOL_ID,
): DigResult {
  if (
    !Number.isInteger(cell) ||
    cell < 0 ||
    cell >= session.gridSize * session.gridSize
  ) {
    return { kind: "invalid", session };
  }
  // 예산 소진(이미 끝났어야 함) → 무효(소비 없음).
  if (treasureActionsUsed(session) >= session.digsAllowed) {
    return { kind: "invalid", session };
  }

  if (tool === "probe") {
    const knownCells = new Set(session.digs.map((dig) => dig.cell));
    const revealed = probeCellsFor(cell, session.gridSize)
      .filter((probeCell) => !knownCells.has(probeCell))
      .map((probeCell, index) => ({
        cell: probeCell,
        clue: clueForCell(session, probeCell),
        tool: "probe" as const,
        actionCost: index === 0 ? 1 : 0,
      }));
    if (revealed.length === 0) return { kind: "invalid", session };
    const next: TreasureSession = {
      ...session,
      digs: [...session.digs, ...revealed],
    };
    const centerClue = clueForCell(session, cell);
    if (treasureActionsUsed(next) >= session.digsAllowed) {
      return { kind: "exhausted", clue: centerClue, session: next };
    }
    return { kind: "probe", clue: centerClue, revealed, session: next };
  }

  if (hasShovelDig(session, cell)) return { kind: "invalid", session };

  const d = chebyshev(cell, session.treasureCell, session.gridSize);
  if (d === 0) {
    const next: TreasureSession = {
      ...session,
      digs: addShovelDig(session, cell),
    };
    return { kind: "hit", session: next };
  }
  const clue = clueForDistance(d);
  const next: TreasureSession = {
    ...session,
    digs: addShovelDig(session, cell),
  };
  if (treasureActionsUsed(next) >= session.digsAllowed) {
    return { kind: "exhausted", clue, session: next };
  }
  return { kind: "miss", clue, session: next };
}

function isDigClue(v: unknown): v is DigClue {
  return v === "hot" || v === "warm" || v === "lukewarm" || v === "cold";
}

// 손상/빈 입력은 null(=열린 세션 없음). 위조 가드: 비밀 필드 범위·격자 정합·digs 정합.
export function parseTreasureSession(raw: unknown): TreasureSession | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.siteId !== "string" || !r.siteId) return null;
  const gridSize = r.gridSize;
  if (typeof gridSize !== "number" || !Number.isInteger(gridSize) || gridSize < 1) {
    return null;
  }
  const total = gridSize * gridSize;
  const treasureCell = r.treasureCell;
  if (
    typeof treasureCell !== "number" ||
    !Number.isInteger(treasureCell) ||
    treasureCell < 0 ||
    treasureCell >= total
  ) {
    return null;
  }
  if (typeof r.antiqueId !== "string" || !isAntiqueId(r.antiqueId)) return null;
  const siteOptionId = isTreasureSiteOptionId(r.siteOptionId)
    ? r.siteOptionId
    : DEFAULT_TREASURE_SITE_OPTION_ID;
  const condition = r.condition;
  if (
    typeof condition !== "number" ||
    !Number.isInteger(condition) ||
    condition < MIN_CONDITION ||
    condition > 100
  ) {
    return null;
  }
  const digsAllowed = r.digsAllowed;
  if (
    typeof digsAllowed !== "number" ||
    !Number.isInteger(digsAllowed) ||
    digsAllowed < 1
  ) {
    return null;
  }
  if (!Array.isArray(r.digs)) return null;
  const digs: DigRecord[] = [];
  const seen = new Set<number>();
  let actionsUsed = 0;
  for (const d of r.digs) {
    if (!d || typeof d !== "object") return null;
    const cell = (d as { cell?: unknown }).cell;
    const clue = (d as { clue?: unknown }).clue;
    const rawTool = (d as { tool?: unknown }).tool;
    const tool = isTreasureDigToolId(rawTool) ? rawTool : DEFAULT_TREASURE_DIG_TOOL_ID;
    const rawActionCost = (d as { actionCost?: unknown }).actionCost;
    const actionCost =
      typeof rawActionCost === "number" &&
      Number.isInteger(rawActionCost) &&
      rawActionCost >= 0
        ? rawActionCost
        : 1;
    if (tool === "shovel" && actionCost < 1) return null;
    if (tool === "probe" && actionCost > 1) return null;
    if (typeof cell !== "number" || !Number.isInteger(cell) || cell < 0 || cell >= total) {
      return null;
    }
    if (seen.has(cell)) return null;
    if (!isDigClue(clue)) return null;
    // 내부 정합 — 저장된 단서가 매장지까지 거리와 일치해야 한다. 손상/위조(매장지·단서를
    // 따로 조작)된 세션을 차단(다이얼 값과 무관하게 관계만 검증).
    if (clue !== clueForDistance(chebyshev(cell, treasureCell, gridSize))) return null;
    seen.add(cell);
    actionsUsed += actionCost;
    digs.push({ cell, clue, tool, actionCost });
  }
  if (actionsUsed > digsAllowed) return null;
  const openedAt =
    typeof r.openedAt === "number" && Number.isFinite(r.openedAt) ? r.openedAt : 0;
  return {
    siteId: r.siteId,
    siteOptionId,
    gridSize,
    treasureCell,
    antiqueId: r.antiqueId,
    condition,
    digsAllowed,
    digs,
    openedAt,
  };
}
