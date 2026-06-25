// 온천(hotspring) 지형 — 길드 소유 인접 판정 (서버 전용).
//
// 온천 타일 4-인접 중 정착 가능한 칸(HOTSPRING_BENEFIT_COORDS)에 정착지를 소유한 길드의
//   길드원은 건강도(war vigor) 회복이 가속된다(docs/v2-map-terrain-plan.md §2.3). 귀속 = 서 있는
//   위치가 아니라 **소유**. 수혜 zone 은 소수 고정 좌표라 합성 거점 id IN(...) 단일 인덱스 조회로
//   값싸게 판정한다(heal/recover hot path).

import { and, eq, inArray } from "drizzle-orm";
import { outpostOccupations } from "@/db/schema";
import { db } from "@/db";
import { HOTSPRING_BENEFIT_COORDS } from "@/adventure/data/v2/tileConfig";
import { tileOutpostId } from "@/adventure/data/v2/tileWarfare";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 수혜 zone 좌표 → 합성 거점 id("tile:col,row"). 모듈 로드 시 1회 계산(고정 소수).
const HOTSPRING_BENEFIT_OUTPOST_IDS: string[] = HOTSPRING_BENEFIT_COORDS.map(
  (c) => tileOutpostId(c.col, c.row),
);

// 길드가 온천-인접(수혜 zone) 정착지를 하나라도 소유하는가 → true 면 회복 가속 대상.
//   guildId 없음(무소속) 또는 온천 미배치면 즉시 false(쿼리 스킵).
export async function guildHasHotspringAdjacency(
  tx: Tx,
  guildId: number | null,
): Promise<boolean> {
  if (guildId == null || HOTSPRING_BENEFIT_OUTPOST_IDS.length === 0) {
    return false;
  }
  const rows = await tx
    .select({ outpostId: outpostOccupations.outpostId })
    .from(outpostOccupations)
    .where(
      and(
        eq(outpostOccupations.occupiedByGuildId, guildId),
        inArray(outpostOccupations.outpostId, HOTSPRING_BENEFIT_OUTPOST_IDS),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
