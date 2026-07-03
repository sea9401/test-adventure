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

const CACHE_TTL_MS = 30_000;

type RowsCache = {
  rows: LeaderboardRow[];
  computedAt: number;
  inFlight?: Promise<LeaderboardRow[]>;
};

const seasonRowsCache = new Map<string, RowsCache>();
let allTimeRowsCache: RowsCache | null = null;

async function getCachedRows(
  cache: Map<string, RowsCache>,
  key: string,
  fetcher: () => Promise<LeaderboardRow[]>,
): Promise<LeaderboardRow[]> {
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && now - entry.computedAt < CACHE_TTL_MS) return entry.rows;
  if (entry?.inFlight) return entry.inFlight;

  const promise = fetcher().then(
    (rows) => {
      cache.set(key, { rows, computedAt: Date.now() });
      return rows;
    },
    (err: unknown) => {
      const e = cache.get(key);
      if (e && e.inFlight === promise) {
        cache.set(key, { rows: e.rows, computedAt: e.computedAt });
      }
      throw err;
    },
  );
  cache.set(key, {
    rows: entry?.rows ?? [],
    computedAt: entry?.computedAt ?? 0,
    inFlight: promise,
  });
  return promise;
}

async function getCachedAllTimeRows(
  fetcher: () => Promise<LeaderboardRow[]>,
): Promise<LeaderboardRow[]> {
  const now = Date.now();
  if (allTimeRowsCache && now - allTimeRowsCache.computedAt < CACHE_TTL_MS) {
    return allTimeRowsCache.rows;
  }
  if (allTimeRowsCache?.inFlight) return allTimeRowsCache.inFlight;

  const promise = fetcher().then(
    (rows) => {
      allTimeRowsCache = { rows, computedAt: Date.now() };
      return rows;
    },
    (err: unknown) => {
      if (allTimeRowsCache?.inFlight === promise) {
        allTimeRowsCache = {
          rows: allTimeRowsCache.rows,
          computedAt: allTimeRowsCache.computedAt,
        };
      }
      throw err;
    },
  );
  allTimeRowsCache = {
    rows: allTimeRowsCache?.rows ?? [],
    computedAt: allTimeRowsCache?.computedAt ?? 0,
    inFlight: promise,
  };
  return promise;
}

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
  const rows = await getCachedRows(seasonRowsCache, seasonId, async () => {
    const freshRows = await db
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

    return freshRows.map((r) => ({
      fishId: r.fishId,
      userId: r.userId,
      name: r.name,
      size: r.size,
    }));
  });
  return shapeLeaderboard(rows, meUserId, topN);
}

// 역대 최대어 명예의 전당 — 전 시즌 통틀어 (user, fish) 별 최대어를 집계해 종별 순위로.
// 주간 리더보드(시즌 리셋)와 달리 영구 기록. 시즌 필터 없이 전부 읽어 reduceAllTimeBest 로
// (fish, user) 최대만 남긴 뒤 같은 셰이핑. 유저 규모가 작아 전체 fetch + JS 집계가 충분.
export async function getAllTimeFishingRecords(
  meUserId: string,
  topN: number = 10,
): Promise<Record<string, ReturnType<typeof shapeLeaderboard>[string]>> {
  const rows = await getCachedAllTimeRows(async () => {
    const freshRows = await db
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

    return reduceAllTimeBest(
      freshRows.map((r) => ({
        fishId: r.fishId,
        userId: r.userId,
        name: r.name,
        size: r.size,
      })),
    );
  });
  return shapeLeaderboard(rows, meUserId, topN);
}
