// v2 타일 전쟁 브릿지 — 영토 PvP(약탈/정복/수비/영주/명성)를 자유 타일 정착지 위로 이전.
//
// 설계: 옛 거점 전쟁 엔진은 `outpostId: text` 키 + 이미 길드 소유(occupiedByGuildId).
//   타일을 "합성 거점 id" `tile:col,row` 로 같은 엔진에 편입한다(전 테이블/라우트 재사용).
//   많은 라우트가 정적 카탈로그(OUTPOSTS)에서 거점 메타(tier/type/neutral 등)를 읽으므로,
//   id → 메타 해석을 단일 chokepoint(resolveOutpostMeta)로 모아 tile id 면 tile_settlements
//   에서 메타를 합성한다.
//
// ⚠️ Phase 0 = 헬퍼 + resolver + 플래그 "정의·배선만". tile id 는 아직 생성되지 않으므로
//   (점령행이 Phase 1 부터) tile 분기는 inert. 카탈로그 id 동작은 byte-identical.
//   게이트 = V2_TILE_WARFARE (settlementWarfareConfig.ts).

import type { Outpost, OutpostTier } from "./types";
import { MAP_BOUNDS, OUTPOST_BY_ID } from "./outposts";
import { computeNextAttackAt } from "./npcAttack";
import { tileFortMaxHp, POST_CAPTURE_PROTECT_MS } from "./outpostSiege";
import {
  TILE_BOARD_SIZE,
  TILE_OUTPOSTS,
  TILE_SETTLEMENT_TIERS,
  areTilesAdjacent4,
  tileSettlementName,
  type TileCoord,
  type TileSettlementTier,
} from "./tileConfig";

// 합성 거점 id 접두사 — 카탈로그 id 와 충돌하지 않는 네임스페이스.
export const TILE_OUTPOST_PREFIX = "tile:";

// (col,row) → 합성 거점 id.
export const tileOutpostId = (col: number, row: number): string =>
  `${TILE_OUTPOST_PREFIX}${col},${row}`;

// 합성 거점 id 인가?
export const isTileOutpostId = (id: string): boolean =>
  id.startsWith(TILE_OUTPOST_PREFIX);

// 합성 거점 id → (col,row). 형식 불일치/카탈로그 id 면 null.
export function parseTileOutpostId(id: string): TileCoord | null {
  if (!isTileOutpostId(id)) return null;
  const m = /^(-?\d+),(-?\d+)$/.exec(id.slice(TILE_OUTPOST_PREFIX.length));
  if (!m) return null;
  return { col: Number(m[1]), row: Number(m[2]) };
}

// 거점 id → 사람이 읽는 표시 이름. 카탈로그 거점이면 카탈로그 name, 타일 거점이면 좌표 결정적
//   이름(tileSettlementName)으로 폴백 — id 만으로 DB 없이 계산하는 헬퍼라 창립자가 지은 실제
//   tile_settlements.name(found·rename)은 반영하지 못한다. 지도·헤더는 occupations.villageName
//   /synthTileOutpost(name) 로 실제 이름을 쓰고, 이 헬퍼는 DB 없이 부르는 2차 표면(토벌/알림/
//   전광판/침입자 패널)의 좌표 폴백 용도. 미해석 id 는 원시 id 폴백.
export function outpostDisplayName(id: string): string {
  const cat = OUTPOST_BY_ID.get(id);
  if (cat) return cat.name;
  const pos = parseTileOutpostId(id);
  if (pos) return tileSettlementName(pos.col, pos.row);
  return id;
}

// 타일 정착지 tier(frontier/village/city/metropolis) → 거점 tier(1..4).
//   단조 매핑(index+1): 공성 난이도·챔피언 강도·점령 쿨다운 스케일이 tier 를 쓴다.
export function tileTierToOutpostTier(tier: TileSettlementTier): OutpostTier {
  const i = TILE_SETTLEMENT_TIERS.indexOf(tier);
  const t = i >= 0 ? i + 1 : 1;
  return t as OutpostTier;
}

// 타일 정착지 → 합성 Outpost 메타. 정착지=마을형(village: 상점·hub·기본 챔피언).
//   position 은 (col,row) 를 대륙 좌표로 결정적 매핑(거리/렌더 폴백용·전쟁 핵심 경로엔 비사용).
export function synthTileOutpost(
  col: number,
  row: number,
  tier: TileSettlementTier,
  name?: string | null,
): Outpost {
  return {
    id: tileOutpostId(col, row),
    name: name ?? tileSettlementName(col, row),
    type: "village",
    tier: tileTierToOutpostTier(tier),
    position: {
      x: Math.round(((col + 0.5) / TILE_BOARD_SIZE) * MAP_BOUNDS.width),
      y: Math.round(((row + 0.5) / TILE_BOARD_SIZE) * MAP_BOUNDS.height),
    },
    neutral: false,
  };
}

// id → 거점 메타 해석(단일 chokepoint).
//   - 카탈로그 id: OUTPOST_BY_ID.get (없으면 undefined) — 기존 OUTPOSTS.find 와 동치.
//   - tile id: tile(티어·이름) 가 주어지면 합성, 없으면 undefined(메타 합성 불가).
//   반환 undefined 는 기존 .find()/.get() 의 미존재와 동일 시맨틱.
export function resolveOutpostMeta(
  id: string,
  tile?: { tier: TileSettlementTier; name?: string | null },
): Outpost | undefined {
  if (isTileOutpostId(id)) {
    const pos = parseTileOutpostId(id);
    if (!pos || !tile) return undefined;
    return synthTileOutpost(pos.col, pos.row, tile.tier, tile.name);
  }
  return OUTPOST_BY_ID.get(id);
}

// id 가 "아는 거점"인가 — 카탈로그 거점이거나 합성 타일 거점.
//   war/overview·occupations 등 행 필터(OUTPOST_BY_ID.has)가 tile 행을 떨구지 않게 한다.
//   Phase 0: tile id 미존재라 OUTPOST_BY_ID.has 와 byte-identical.
export const isKnownOutpostId = (id: string): boolean =>
  isTileOutpostId(id) || OUTPOST_BY_ID.has(id);

// === Phase 1: 타일 길드 점령행 ============================================

export type TileOccupationValues = {
  outpostId: string;
  occupiedByUserId: string;
  // 길드 소유면 길드 id, 솔로(무길드) 소유면 null — 스키마상 둘 다 nullable.
  occupiedByGuildId: number | null;
  policy: "open";
  taxRate: string;
  nextAttackAt: Date;
  fortHp: number;
  fortMaxHp: number;
  fortUpdatedAt: Date;
  protectedUntil: Date;
};

// 타일 정착지 점령행 insert 값 — claim 라우트의 신규 점령 패턴 미러(공성/세율/쿨다운 동일).
//   소유 = 창립자(occupiedByUserId) + 길드(occupiedByGuildId, 무길드 솔로면 null). 순수 함수
//   (DB 미접촉·now 주입으로 결정적)라 단위 테스트 가능.
export function buildTileOccupationValues(args: {
  userId: string;
  guildId: number | null;
  col: number;
  row: number;
  tier: TileSettlementTier;
  now: number;
}): TileOccupationValues {
  const { userId, guildId, col, row, tier, now } = args;
  return {
    outpostId: tileOutpostId(col, row),
    occupiedByUserId: userId,
    occupiedByGuildId: guildId,
    policy: "open",
    taxRate: "0.100",
    nextAttackAt: computeNextAttackAt(tileTierToOutpostTier(tier), now),
    fortHp: tileFortMaxHp(col, row, tileTierToOutpostTier(tier)),
    fortMaxHp: tileFortMaxHp(col, row, tileTierToOutpostTier(tier)),
    fortUpdatedAt: new Date(now),
    protectedUntil: new Date(now + POST_CAPTURE_PROTECT_MS),
  };
}

// === 중립 거점 인접(영토 PvP 부트스트랩) ============================================
// 땅 없는 길드는 "중립 거점(리베라 같은 절대중립 거점)"에 인접한 칸을 정복해 첫 발판을 얻는다.
//   보드 위 중립 거점 칸 = TILE_OUTPOSTS 중 카탈로그 메타가 neutral 인 것(현재 리베라 4,4 하나).
export const NEUTRAL_TILE_OUTPOST_CELLS: TileCoord[] = TILE_OUTPOSTS.filter(
  (t) => OUTPOST_BY_ID.get(t.id)?.neutral,
).map((t) => ({ col: t.col, row: t.row }));

// (col,row) 칸이 중립 거점 칸 중 하나와 4방향 인접인가.
export function isTileAdjacentToNeutralOutpost(
  col: number,
  row: number,
): boolean {
  return NEUTRAL_TILE_OUTPOST_CELLS.some((c) =>
    areTilesAdjacent4(col, row, c.col, c.row),
  );
}
