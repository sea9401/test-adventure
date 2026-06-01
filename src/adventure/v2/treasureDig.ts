// 발굴 미니게임 — 격자 + 단서(뜨/따/미/차) 추리 + 매장지 적중. 서버 권위 순수 코어.
//
// 설계: docs/treasure-hunt-plan.md §4 §7
// open 이 격자/매장지/골동품을 서버에서 굴려 세션에 박제(클라는 격자만 본다), dig 가 이
// 순수 함수로 단서를 계산하고 적중을 판정한다. 매 dig 가 세션을 갱신(여러 번 호출).
//
// 봇 방지: 매장지·골동품(희귀도·보존상태)은 open 때 서버에서만 굴려 세션에 박제 → 클라가
// 결과를 못 만든다. 단서(거리 밴드)는 서버 계산. 조각 funnel 이 시도 자체를 throttle.

import {
  isAntiqueId,
  pickAntiqueId,
  rollCondition,
  MIN_CONDITION,
  type AntiqueId,
} from "@/adventure/data/v2/antique";

export const TREASURE_SESSION_KEY = "treasure-session.v1";

/** 격자 한 변 길이 (5×5). (다이얼) */
export const GRID_SIZE = 5;
/** 발굴 시도 횟수(예산). (다이얼) */
export const DIGS_ALLOWED = 6;
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

// 단서 — 매장지까지의 체비셰프 거리 밴드. (거리 0 = 적중)
export type DigClue = "hot" | "warm" | "lukewarm" | "cold";

export const DIG_CLUE_LABEL: Record<DigClue, string> = {
  hot: "뜨거움",
  warm: "따뜻함",
  lukewarm: "미지근함",
  cold: "차가움",
};

export type DigRecord = { cell: number; clue: DigClue };

export type TreasureSession = {
  siteId: string;
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
  gridSize: number;
  digsAllowed: number;
  digsUsed: number;
  digs: DigRecord[];
};

export function toPublicSite(s: TreasureSession): TreasureSitePublic {
  return {
    siteId: s.siteId,
    gridSize: s.gridSize,
    digsAllowed: s.digsAllowed,
    digsUsed: s.digs.length,
    digs: s.digs.map((d) => ({ cell: d.cell, clue: d.clue })),
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

// 새 발굴 지점 굴림(순수) — 매장지·골동품·보존상태 박제. siteId 는 라우트가 발급.
export function rollNewSession(args: {
  siteId: string;
  rng: () => number;
  now: number;
}): TreasureSession {
  const { siteId, rng, now } = args;
  const treasureCell = Math.min(TOTAL_CELLS - 1, Math.floor(rng() * TOTAL_CELLS));
  const antiqueId = pickAntiqueId(rng);
  const condition = rollCondition(antiqueId, rng);
  return {
    siteId,
    gridSize: GRID_SIZE,
    treasureCell,
    antiqueId,
    condition,
    digsAllowed: DIGS_ALLOWED,
    digs: [],
    openedAt: now,
  };
}

export type DigResult =
  | { kind: "invalid"; session: TreasureSession }
  | { kind: "miss"; clue: DigClue; session: TreasureSession }
  | { kind: "exhausted"; clue: DigClue; session: TreasureSession }
  | { kind: "hit"; session: TreasureSession };

// 한 번 파기(순수). 범위/중복/예산 가드 후 거리 단서·적중 판정. nextSession 반환.
export function applyDig(session: TreasureSession, cell: number): DigResult {
  if (
    !Number.isInteger(cell) ||
    cell < 0 ||
    cell >= session.gridSize * session.gridSize
  ) {
    return { kind: "invalid", session };
  }
  // 예산 소진(이미 끝났어야 함) 또는 같은 셀 재발굴 → 무효(소비 없음).
  if (session.digs.length >= session.digsAllowed) {
    return { kind: "invalid", session };
  }
  if (session.digs.some((d) => d.cell === cell)) {
    return { kind: "invalid", session };
  }
  const d = chebyshev(cell, session.treasureCell, session.gridSize);
  if (d === 0) {
    const next: TreasureSession = {
      ...session,
      digs: [...session.digs, { cell, clue: "hot" }],
    };
    return { kind: "hit", session: next };
  }
  const clue = clueForDistance(d);
  const next: TreasureSession = {
    ...session,
    digs: [...session.digs, { cell, clue }],
  };
  if (next.digs.length >= session.digsAllowed) {
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
  for (const d of r.digs) {
    if (!d || typeof d !== "object") return null;
    const cell = (d as { cell?: unknown }).cell;
    const clue = (d as { clue?: unknown }).clue;
    if (typeof cell !== "number" || !Number.isInteger(cell) || cell < 0 || cell >= total) {
      return null;
    }
    if (seen.has(cell)) return null;
    if (!isDigClue(clue)) return null;
    // 내부 정합 — 저장된 단서가 매장지까지 거리와 일치해야 한다. 손상/위조(매장지·단서를
    // 따로 조작)된 세션을 차단(다이얼 값과 무관하게 관계만 검증).
    if (clue !== clueForDistance(chebyshev(cell, treasureCell, gridSize))) return null;
    seen.add(cell);
    digs.push({ cell, clue });
  }
  if (digs.length > digsAllowed) return null;
  const openedAt =
    typeof r.openedAt === "number" && Number.isFinite(r.openedAt) ? r.openedAt : 0;
  return {
    siteId: r.siteId,
    gridSize,
    treasureCell,
    antiqueId: r.antiqueId,
    condition,
    digsAllowed,
    digs,
    openedAt,
  };
}
