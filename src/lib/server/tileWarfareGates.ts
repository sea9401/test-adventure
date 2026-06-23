// v2 영토 PvP 위치/인접 게이트 (서버 전용).
//
// 정복(conquest)은 "내 길드 영지에 인접한 칸"만 칠 수 있다(연속 확장). 땅이 없는 길드는
//   중립 거점 인접 칸에서 첫 발판을 얻는다(부트스트랩 — isTileAdjacentToNeutralOutpost).
//   여기선 길드 보유 타일을 읽어 인접 여부만 판정한다(읽기 게이트·락 없음).

import { and, eq, like } from "drizzle-orm";
import { outpostOccupations } from "@/db/schema";
import { db } from "@/db";
import {
  parseTileOutpostId,
  TILE_OUTPOST_PREFIX,
} from "@/adventure/data/v2/tileWarfare";
import { areTilesAdjacent4 } from "@/adventure/data/v2/tileConfig";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 길드가 (col,row) 대상에 대해 가진 "발판" 상태.
//   ownsAny      — 길드가 타일 영지를 하나라도 보유하는가(0=땅 없는 길드).
//   adjacentOwned — 그 타일들 중 대상과 4방향 인접한 것이 있는가(정복 자격).
export async function guildTileFoothold(
  tx: Tx,
  guildId: number,
  col: number,
  row: number,
): Promise<{ ownsAny: boolean; adjacentOwned: boolean }> {
  const rows = await tx
    .select({ outpostId: outpostOccupations.outpostId })
    .from(outpostOccupations)
    .where(
      and(
        eq(outpostOccupations.occupiedByGuildId, guildId),
        like(outpostOccupations.outpostId, `${TILE_OUTPOST_PREFIX}%`),
      ),
    );
  let adjacentOwned = false;
  for (const r of rows) {
    const pos = parseTileOutpostId(r.outpostId);
    if (pos && areTilesAdjacent4(pos.col, pos.row, col, row)) {
      adjacentOwned = true;
      break;
    }
  }
  return { ownsAny: rows.length > 0, adjacentOwned };
}
