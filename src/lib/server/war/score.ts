// v2 전쟁 시즌 점수 원장 입출력. 적재는 claim/eject 라우트가 tx 안에서, 집계(랭킹) 읽기는
// war/overview 가 무잠금으로. 원장은 append-only — 집계 테이블 없이 read-time SUM.
//
// 락 안전성: war_score_events 는 이 테이블만 건드리는 독립 테이블이라 occupation/character/
// guild_resources 락 순서와 사이클을 만들지 않는다. 같은 거점 함락은 claim 의 occupation
// FOR UPDATE 로 직렬화되므로 capture 카운트(감쇠 계산)도 tx 안에서 일관적이다.

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { warScoreEvents } from "@/db/schema";
import type { WarScoreEventType } from "@/adventure/data/v2/warScore";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 이번 시즌 이 길드가 이 거점을 이미 함락한 횟수 — capture 감쇠 계산용.
export async function countGuildCapturesThisSeason(
  tx: Tx,
  seasonId: string,
  outpostId: string,
  guildId: number,
): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(warScoreEvents)
    .where(
      and(
        eq(warScoreEvents.seasonId, seasonId),
        eq(warScoreEvents.outpostId, outpostId),
        eq(warScoreEvents.guildId, guildId),
        eq(warScoreEvents.eventType, "capture"),
      ),
    );
  return row?.n ?? 0;
}

// 점수 이벤트 1건 적재(tx 안). 0점 이하(감쇠 소진 등)는 원장 노이즈라 적재하지 않는다.
export async function insertWarScoreEvent(
  tx: Tx,
  e: {
    seasonId: string;
    outpostId: string;
    guildId: number | null;
    userId: string | null;
    eventType: WarScoreEventType;
    points: number;
  },
): Promise<void> {
  if (e.points <= 0) return;
  await tx.insert(warScoreEvents).values({
    seasonId: e.seasonId,
    outpostId: e.outpostId,
    guildId: e.guildId,
    userId: e.userId,
    eventType: e.eventType,
    points: e.points,
  });
}

// 시즌 길드 랭킹 — 무잠금 read-time SUM. 솔로(길드 null) 점수는 집계에서 제외.
export async function warSeasonGuildLeaderboard(
  seasonId: string,
  limit = 10,
): Promise<Array<{ guildId: number; points: number }>> {
  const rows = await db
    .select({
      guildId: warScoreEvents.guildId,
      points: sql<number>`sum(${warScoreEvents.points})::bigint`,
    })
    .from(warScoreEvents)
    .where(
      and(
        eq(warScoreEvents.seasonId, seasonId),
        isNotNull(warScoreEvents.guildId),
      ),
    )
    .groupBy(warScoreEvents.guildId)
    .orderBy(desc(sql`sum(${warScoreEvents.points})`))
    .limit(limit);
  return rows
    .filter((r): r is { guildId: number; points: number } => r.guildId != null)
    .map((r) => ({ guildId: r.guildId, points: Number(r.points) || 0 }));
}
