// 낚시 주간 기록 — upsert(개인 최대어) + 종별 리더보드 조회.

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { fishingRecords, savesKv } from "@/db/schema";
import type { DbExecutor } from "@/lib/server/savesKv";
import {
  reduceAllTimeBest,
  shapeLeaderboard,
  type LeaderboardRow,
} from "@/adventure/v2/fishingLeaderboard";

// 캐스팅 성공 시 (user, season, fish) 개인 최대어 upsert — 새 사이즈가 더 클 때만 갱신.
// setWhere 로 read 없이 원자적 keep-max. reel 트랜잭션 안에서 호출(별도 tx 열지 않음).
export async function upsertFishingRecord(
  executor: DbExecutor,
  userId: string,
  seasonId: string,
  fishId: string,
  size: number,
  now: Date,
): Promise<void> {
  await executor
    .insert(fishingRecords)
    .values({ userId, seasonId, fishId, bestSize: size, caughtAt: now })
    .onConflictDoUpdate({
      target: [
        fishingRecords.userId,
        fishingRecords.seasonId,
        fishingRecords.fishId,
      ],
      set: { bestSize: size, caughtAt: now },
      setWhere: sql`${fishingRecords.bestSize} < ${size}`,
    });
}

// 시즌 종별 리더보드 — 사이즈 내림차순으로 전부 읽어 캐릭터명을 join 한 뒤 순수 셰이핑.
// 유저 규모가 작아(수십) 시즌 전체 fetch + JS 그룹핑이 충분하고 윈도우 SQL 보다 단순/안전.
export async function getFishingLeaderboard(
  seasonId: string,
  meUserId: string,
  topN: number = 10,
): Promise<Record<string, ReturnType<typeof shapeLeaderboard>[string]>> {
  const rows = await db
    .select({
      fishId: fishingRecords.fishId,
      userId: fishingRecords.userId,
      size: fishingRecords.bestSize,
      name: sql<string | null>`${savesKv.value} ->> 'name'`,
    })
    .from(fishingRecords)
    .leftJoin(
      savesKv,
      and(
        eq(savesKv.userId, fishingRecords.userId),
        eq(savesKv.key, "character-profile.v2"),
      ),
    )
    .where(eq(fishingRecords.seasonId, seasonId))
    .orderBy(fishingRecords.fishId, desc(fishingRecords.bestSize));

  const shaped: LeaderboardRow[] = rows.map((r) => ({
    fishId: r.fishId,
    userId: r.userId,
    name: r.name,
    size: r.size,
  }));
  return shapeLeaderboard(shaped, meUserId, topN);
}

// 역대 최대어 명예의 전당 — 전 시즌 통틀어 (user, fish) 별 최대어를 집계해 종별 순위로.
// 주간 리더보드(시즌 리셋)와 달리 영구 기록. 시즌 필터 없이 전부 읽어 reduceAllTimeBest 로
// (fish, user) 최대만 남긴 뒤 같은 셰이핑. 유저 규모가 작아 전체 fetch + JS 집계가 충분.
export async function getAllTimeFishingRecords(
  meUserId: string,
  topN: number = 10,
): Promise<Record<string, ReturnType<typeof shapeLeaderboard>[string]>> {
  const rows = await db
    .select({
      fishId: fishingRecords.fishId,
      userId: fishingRecords.userId,
      size: fishingRecords.bestSize,
      name: sql<string | null>`${savesKv.value} ->> 'name'`,
    })
    .from(fishingRecords)
    .leftJoin(
      savesKv,
      and(
        eq(savesKv.userId, fishingRecords.userId),
        eq(savesKv.key, "character-profile.v2"),
      ),
    )
    .orderBy(fishingRecords.fishId, desc(fishingRecords.bestSize));

  const shaped: LeaderboardRow[] = rows.map((r) => ({
    fishId: r.fishId,
    userId: r.userId,
    name: r.name,
    size: r.size,
  }));
  return shapeLeaderboard(reduceAllTimeBest(shaped), meUserId, topN);
}
