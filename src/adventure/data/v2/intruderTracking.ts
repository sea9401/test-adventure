// 거점 침입자 트래킹 — character.v2 의 JSON 필드 두 개로 구현.
//
// `lastHuntedOutpost`: 마지막 사냥 거점 + 시각. 점령 길드가 TTL 안에 토벌 가능.
// `ejectedFrom`: 토벌된 정보. 침입자의 다음 hunt 응답에 1회 surface 후 삭제.
//
// 단일 source = saves_kv 의 character.v2. 분리 테이블 없이 JSON path 쿼리로
// 침입자 목록 조회 (v2 staging 부하 수준에선 충분, 부하 측정 후 별도 인덱스/테이블 분리는 후속).

// TTL — 10분. claim cooldown 톤. 마지막 사냥 후 이 시간 안엔 토벌 대상.
export const INTRUDER_TTL_MS = 10 * 60 * 1000;

export type LastHuntedOutpost = {
  outpostId: string;
  at: number; // epoch ms
};

export type EjectedFrom = {
  outpostId: string;
  byGuildId: number;
  at: number; // 토벌된 시각
};

export type TileIntruderPosition = {
  col?: unknown;
  row?: unknown;
  at?: unknown;
};

function parseTileCoordPart(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  if (typeof raw === "string" && /^-?\d+$/.test(raw)) return Number(raw);
  return null;
}

export function parseTileIntruderPosition(
  raw: TileIntruderPosition | null | undefined,
): { col: number; row: number; at?: unknown } | null {
  const col = parseTileCoordPart(raw?.col);
  const row = parseTileCoordPart(raw?.row);
  if (col == null || row == null) return null;
  return { col, row, at: raw?.at };
}

// raw JSON → LastHuntedOutpost. 모양 어긋나면 null.
export function parseLastHuntedOutpost(raw: unknown): LastHuntedOutpost | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<LastHuntedOutpost>;
  if (
    typeof r.outpostId === "string" &&
    r.outpostId.length > 0 &&
    typeof r.at === "number" &&
    Number.isFinite(r.at) &&
    r.at > 0
  ) {
    return { outpostId: r.outpostId, at: r.at };
  }
  return null;
}

export function parseEjectedFrom(raw: unknown): EjectedFrom | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<EjectedFrom>;
  if (
    typeof r.outpostId === "string" &&
    r.outpostId.length > 0 &&
    typeof r.byGuildId === "number" &&
    Number.isFinite(r.byGuildId) &&
    typeof r.at === "number" &&
    Number.isFinite(r.at) &&
    r.at > 0
  ) {
    return {
      outpostId: r.outpostId,
      byGuildId: r.byGuildId,
      at: r.at,
    };
  }
  return null;
}

// 침입자가 토벌 가능한 상태인지 — outpost 일치 + TTL 안.
export function isIntruderActive(
  last: LastHuntedOutpost | null,
  outpostId: string,
  nowMs: number,
): boolean {
  if (!last) return false;
  if (last.outpostId !== outpostId) return false;
  return last.at >= nowMs - INTRUDER_TTL_MS;
}

// 타일 정착지 침입은 현재 좌표가 권위다. at 은 체류시간/약탈 준비 표시용 보조값이라,
// 예전 저장처럼 누락돼도 토벌 목록에서는 침입자로 보여야 한다(eject 도 같은 좌표 기준).
export function isTileIntruderPresent(
  tilePos: TileIntruderPosition | null | undefined,
  col: number,
  row: number,
): boolean {
  const parsed = parseTileIntruderPosition(tilePos);
  return parsed?.col === col && parsed.row === row;
}

export function tileIntruderEnteredAt(
  tilePos: TileIntruderPosition | null | undefined,
  fallbackAt: number,
): number {
  return typeof tilePos?.at === "number" &&
    Number.isFinite(tilePos.at) &&
    tilePos.at > 0
    ? tilePos.at
    : fallbackAt;
}
