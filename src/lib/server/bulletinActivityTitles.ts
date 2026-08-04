import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import {
  bulletinActivityTitleIdsForLevel,
  type BulletinActivitySummary,
} from "@/lib/bulletinActivity";
import {
  grantTitleIfMissingInTx,
  ownedTitleIdsOf,
} from "@/lib/server/grantTitle";

/**
 * 현재 게시판 활동 레벨까지의 이정표 칭호를 영구 해금한다.
 * 먼저 보유 목록을 읽어 이미 동기화된 일반 요청은 트랜잭션 없이 빠르게 끝낸다.
 */
export async function syncBulletinActivityTitles(
  userId: string,
  activity: BulletinActivitySummary,
  obtainedAt: number = Date.now(),
): Promise<string[]> {
  const eligible = bulletinActivityTitleIdsForLevel(activity.level);
  if (eligible.length === 0) return [];

  const [logRow] = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "adventure-log.v2")))
    .limit(1);
  const owned = new Set(ownedTitleIdsOf(logRow?.value));
  const missing = eligible.filter((titleId) => !owned.has(titleId));
  if (missing.length === 0) return [];

  return db.transaction(async (tx) => {
    const granted: string[] = [];
    for (const titleId of missing) {
      if (await grantTitleIfMissingInTx(tx, userId, titleId, obtainedAt)) {
        granted.push(titleId);
      }
    }
    return granted;
  });
}

/** 칭호 동기화 실패가 이미 완료된 글·댓글·좋아요 요청을 실패로 바꾸지 않게 한다. */
export async function syncBulletinActivityTitlesBestEffort(
  userId: string,
  activity: BulletinActivitySummary,
  obtainedAt: number = Date.now(),
): Promise<string[]> {
  try {
    return await syncBulletinActivityTitles(userId, activity, obtainedAt);
  } catch (error) {
    console.error("[bulletin] activity title sync failed", error);
    return [];
  }
}
