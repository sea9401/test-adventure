import { and, eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import { savesKv } from "@/db/schema";

// savesKv 행을 업서트할 때 version + updatedAt 을 같이 갱신하는 헬퍼.
// 클라이언트 PATCH 가 낙관적 동시성으로 expectedVersion 검사를 하기 때문에
// 서버 사이드 쓰기 (마켓 정산 / 인박스 claim / 어드민 등) 도 모두 version 을 올려줘야
// 클라이언트가 다음 patch 때 stale 충돌을 감지할 수 있다.
//
// `executor` 는 최상위 `db` 또는 `db.transaction` 콜백 인자 (`tx`) 양쪽을 받을 수 있도록
// 타입을 느슨하게 가져감.
export type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// 트랜잭션 안에서 save 키 한 행을 잠그고(FOR UPDATE) 값을 파싱해 돌려준다.
// read-modify-write 의 read 측 표준화 — 행 잠금을 빠뜨려 동시 변경이 서로 덮어쓰는 race
// (같은 캐릭터에 동시 요청 등)를 예방한다. 잠근 뒤 호출부가 값을 검증·변형하고 upsertSave 로 쓴다.
// 행이 없으면(키 미존재 = 신규 유저) fallback 반환. value 는 JSON object 로 저장된다는 전제.
export async function lockSaveForUpdate<T = Record<string, unknown>>(
  tx: DbExecutor,
  userId: string,
  key: string,
  fallback: T,
): Promise<T> {
  const row = (
    await tx
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, key)))
      .for("update")
      .limit(1)
  )[0];
  return (row?.value ?? fallback) as T;
}

export async function upsertSave(
  executor: DbExecutor,
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const now = new Date();
  await executor
    .insert(savesKv)
    .values({ userId, key, value, version: 1, updatedAt: now })
    .onConflictDoUpdate({
      target: [savesKv.userId, savesKv.key],
      set: {
        value,
        version: sql`${savesKv.version} + 1`,
        updatedAt: now,
      },
    });
}
