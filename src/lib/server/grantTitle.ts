// adventure-log.v2 의 titles 맵에 한 항목 추가. 이미 있으면 no-op (idempotent).
//
// 두 호출 형태 제공:
//   - grantTitleIfMissing(userId, titleId, obtainedAt) — 자체 트랜잭션으로 처리 (cron 등).
//   - grantTitleIfMissingInTx(tx, userId, titleId, obtainedAt) — 호출자가 잡은 트랜잭션 안에서.
//     도전 모드/일반 탑 apply.ts 처럼 이미 tx 안에 있는 곳에서 사용.

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { upsertSave, type DbExecutor } from "@/lib/server/savesKv";

type AdventureLogShape = {
  titles?: Record<string, { obtainedAt: number }>;
  [k: string]: unknown;
};

/** adventure-log.v2 raw 값 → 보유 칭호 id 목록(읽기 전용·무락). 없으면 빈 배열. */
export function ownedTitleIdsOf(raw: unknown): string[] {
  const titles = (raw as AdventureLogShape | undefined)?.titles;
  return titles && typeof titles === "object" ? Object.keys(titles) : [];
}

export async function grantTitleIfMissingInTx(
  tx: DbExecutor,
  userId: string,
  titleId: string,
  obtainedAt: number,
): Promise<boolean> {
  // 행이 없으면 아래 FOR UPDATE 가 잠글 대상이 없어, 동시 칭호 부여(예: 두 코인 상점)가
  // 서로의 titles 맵을 덮어써 "차감했는데 칭호 유실" 이 날 수 있다(특히 사냥 기록이 없어
  // adventure-log.v2 row 가 아직 없는 순수-아레나 유저). 빈 row 를 멱등 선삽입해 다음
  // FOR UPDATE 가 반드시 한 row 를 잠그도록 → 동시 부여 직렬화.
  await tx
    .insert(savesKv)
    .values({ userId, key: "adventure-log.v2", value: {} })
    .onConflictDoNothing();
  const result = await tx.execute(sql`
    SELECT value FROM saves_kv
    WHERE user_id = ${userId} AND key = 'adventure-log.v2'
    FOR UPDATE
  `);
  const row = result.rows[0] as { value: AdventureLogShape } | undefined;
  const current: AdventureLogShape = row?.value ?? {};
  const titles = current.titles ?? {};
  if (titles[titleId]) return false;
  const next: AdventureLogShape = {
    ...current,
    titles: { ...titles, [titleId]: { obtainedAt } },
  };
  await upsertSave(tx, userId, "adventure-log.v2", next);
  return true;
}

export async function grantTitleIfMissing(
  userId: string,
  titleId: string,
  obtainedAt: number,
): Promise<boolean> {
  return db.transaction((tx) =>
    grantTitleIfMissingInTx(tx, userId, titleId, obtainedAt),
  );
}
