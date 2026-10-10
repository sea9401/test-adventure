// 생활 축제 주간 점수 기록·조회. 순위 규칙은 ranking.ts 의 순수 함수를 정산과 공유한다.

import { and, eq, sql } from "drizzle-orm";
import { lifeFestivalScores, savesKv, users } from "@/db/schema";
import { LIFE_FESTIVAL_RANKING_SIZE } from "@/adventure/data/v2/lifeFestival";
import type { DbExecutor } from "@/lib/server/savesKv";
import { rankLifeFestivalRows } from "./ranking";

export async function addLifeFestivalScore(
  tx: DbExecutor,
  args: { userId: string; weekId: string; score: number; deliveries: number },
): Promise<void> {
  await tx
    .insert(lifeFestivalScores)
    .values({
      userId: args.userId,
      weekId: args.weekId,
      score: args.score,
      deliveries: args.deliveries,
    })
    .onConflictDoUpdate({
      target: [lifeFestivalScores.userId, lifeFestivalScores.weekId],
      set: {
        score: sql`${lifeFestivalScores.score} + ${args.score}`,
        deliveries: sql`${lifeFestivalScores.deliveries} + ${args.deliveries}`,
        updatedAt: sql`now()`,
      },
    });
}

export type LifeFestivalRankingEntry = {
  rank: number;
  userId: string;
  name: string;
  score: number;
};

export type LifeFestivalRanking = {
  top: LifeFestivalRankingEntry[];
  me: { rank: number; score: number } | null;
};

export async function readLifeFestivalRanking(
  executor: DbExecutor,
  weekId: string,
  viewerId: string,
  now: Date,
): Promise<LifeFestivalRanking> {
  const rows = await executor
    .select({
      userId: lifeFestivalScores.userId,
      score: lifeFestivalScores.score,
      updatedAt: lifeFestivalScores.updatedAt,
      bannedUntil: users.bannedUntil,
      name: sql<string | null>`${savesKv.value} ->> 'name'`,
    })
    .from(lifeFestivalScores)
    .innerJoin(users, eq(users.id, lifeFestivalScores.userId))
    .leftJoin(
      savesKv,
      and(
        eq(savesKv.userId, lifeFestivalScores.userId),
        eq(savesKv.key, "character-profile.v2"),
      ),
    )
    .where(eq(lifeFestivalScores.weekId, weekId));
  const ranked = rankLifeFestivalRows(rows, now);
  const mine = ranked.find((row) => row.userId === viewerId);
  return {
    top: ranked.slice(0, LIFE_FESTIVAL_RANKING_SIZE).map((row) => ({
      rank: row.rank,
      userId: row.userId,
      name: row.name ?? "이름 없는 모험가",
      score: row.score,
    })),
    me: mine ? { rank: mine.rank, score: mine.score } : null,
  };
}
