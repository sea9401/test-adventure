// 보물 주간 발굴가치 — 점수 누적 upsert + 주간 리더보드 조회.

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { treasureScores, savesKv } from "@/db/schema";
import type { DbExecutor } from "@/lib/server/savesKv";
import {
  shapeTreasureLeaderboard,
  type TreasureLeaderboardRow,
} from "@/adventure/v2/treasureLeaderboard";

const CACHE_TTL_MS = 30_000;

type RowsCache = {
  rows: TreasureLeaderboardRow[];
  computedAt: number;
  inFlight?: Promise<TreasureLeaderboardRow[]>;
};

const rowsCache = new Map<string, RowsCache>();

async function getCachedRows(
  seasonId: string,
  fetcher: () => Promise<TreasureLeaderboardRow[]>,
): Promise<TreasureLeaderboardRow[]> {
  const now = Date.now();
  const entry = rowsCache.get(seasonId);
  if (entry && now - entry.computedAt < CACHE_TTL_MS) return entry.rows;
  if (entry?.inFlight) return entry.inFlight;

  const promise = fetcher().then(
    (rows) => {
      rowsCache.set(seasonId, { rows, computedAt: Date.now() });
      return rows;
    },
    (err: unknown) => {
      const e = rowsCache.get(seasonId);
      if (e && e.inFlight === promise) {
        rowsCache.set(seasonId, { rows: e.rows, computedAt: e.computedAt });
      }
      throw err;
    },
  );
  rowsCache.set(seasonId, {
    rows: entry?.rows ?? [],
    computedAt: entry?.computedAt ?? 0,
    inFlight: promise,
  });
  return promise;
}

// 발굴 적중 시 (user, season) 발굴가치 += value — 원자적 증가(read 없이). dig 트랜잭션 안에서
// 호출(별도 tx 열지 않음). value 는 결정적 감정가(appraiseValue).
export async function addTreasureScore(
  executor: DbExecutor,
  userId: string,
  seasonId: string,
  value: number,
  now: Date,
): Promise<void> {
  if (!Number.isFinite(value) || value <= 0) return;
  const v = Math.floor(value);
  await executor
    .insert(treasureScores)
    .values({ userId, seasonId, totalValue: v, updatedAt: now })
    .onConflictDoUpdate({
      target: [treasureScores.userId, treasureScores.seasonId],
      set: {
        totalValue: sql`${treasureScores.totalValue} + ${v}`,
        updatedAt: now,
      },
    });
}

// 시즌 발굴가치 리더보드 — 내림차순으로 전부 읽어 캐릭터명 join 후 순수 셰이핑.
// 유저 규모가 작아(수십) 시즌 전체 fetch + JS 셰이핑이 충분.
export async function getTreasureLeaderboard(
  seasonId: string,
  meUserId: string,
  topN: number = 10,
): Promise<ReturnType<typeof shapeTreasureLeaderboard>> {
  const rows = await getCachedRows(seasonId, async () => {
    const freshRows = await db
      .select({
        userId: treasureScores.userId,
        value: treasureScores.totalValue,
        name: sql<string | null>`${savesKv.value} ->> 'name'`,
      })
      .from(treasureScores)
      .leftJoin(
        savesKv,
        and(
          eq(savesKv.userId, treasureScores.userId),
          eq(savesKv.key, "character-profile.v2"),
        ),
      )
      .where(eq(treasureScores.seasonId, seasonId))
      .orderBy(desc(treasureScores.totalValue));

    return freshRows.map((r) => ({
      userId: r.userId,
      name: r.name,
      value: r.value,
    }));
  });
  return shapeTreasureLeaderboard(rows, meUserId, topN);
}
