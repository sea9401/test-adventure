// 좌상단 "현재 위치" 라벨 — 플레이어가 **서 있는 타일**(tilePos) 기준으로 결정.
//
// 버그 배경: V2TopBar 가 `currentOutpost.name` 만 표시했는데, 빈 타일로 이동하면 tilePos 만
//   갱신되고 currentOutpost 는 시작 거점(리베라)에 고정 → 위치 라벨이 리베라로 박혀 보였다.
//   tilePos 가 거점 칸/정착지/빈 칸 어디든 항상 갱신되므로(travelToTile), 라벨도 tilePos 에서
//   파생한다. 순수 함수 — DB/React 무관, 단위 테스트 가능.

import {
  TILE_OUTPOST_AT,
  tileKey,
  tileSettlementName,
} from "@/adventure/data/v2/tileConfig";
import { OUTPOST_BY_ID } from "@/adventure/data/v2/outposts";

export type LocationLabelArgs = {
  // 서 있는 타일(보드 밖이면 null).
  tilePos: { col: number; row: number } | null;
  // 내가/남이 개척한 정착지 목록(name = 창립자가 지은 이름).
  tileSettlements: ReadonlyArray<{ col: number; row: number; name: string | null }>;
  // 보드 밖(tilePos 없음) 폴백용 — 레거시 currentOutpost 이름.
  currentOutpostName: string | null;
};

// 우선순위: 거점 칸(리베라) → 그 칸의 정착지(마을명) → 빈 땅(좌표) → 보드 밖 폴백(currentOutpost).
export function currentLocationLabel({
  tilePos,
  tileSettlements,
  currentOutpostName,
}: LocationLabelArgs): string | null {
  if (!tilePos) return currentOutpostName;
  const { col, row } = tilePos;
  // 보드 고정 거점 칸(현재 리베라 하나) — 거점명.
  const oid = TILE_OUTPOST_AT.get(tileKey(col, row));
  if (oid) return OUTPOST_BY_ID.get(oid)?.name ?? currentOutpostName;
  // 내가 선 칸에 개척 정착지가 있으면 그 마을 이름(빈 이름이면 좌표 결정 이름으로 폴백).
  const s = tileSettlements.find((t) => t.col === col && t.row === row);
  if (s) return s.name?.trim() || tileSettlementName(col, row);
  // 빈 땅 — 좌표로 "어디에 서 있는지" 명시.
  return `빈 땅 (${col}, ${row})`;
}
