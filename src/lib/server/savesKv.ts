import { and, eq, inArray, sql } from "drizzle-orm";
import type { db } from "@/db";
import { savesKv } from "@/db/schema";

// savesKv 행을 업서트할 때 version + updatedAt 을 같이 갱신하는 헬퍼.
// 클라이언트 PATCH 가 낙관적 동시성으로 expectedVersion 검사를 하기 때문에
// 서버 사이드 쓰기 (마켓 정산 / 인박스 claim / 어드민 등) 도 모두 version 을 올려줘야
// 클라이언트가 다음 patch 때 stale 충돌을 감지할 수 있다.
//
// `executor` 는 최상위 `db` 또는 `db.transaction` 콜백 인자 (`tx`) 양쪽을 받을 수 있도록
// 타입을 느슨하게 가져감.
export type DbTransactionExecutor = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
export type DbExecutor = typeof db | DbTransactionExecutor;

type SaveFallbacks = Record<string, unknown>;

function sortedSaveKeys(values: SaveFallbacks): string[] {
  return Object.keys(values).sort((a, b) => a.localeCompare(b));
}

function savesWithFallbacks<T extends SaveFallbacks>(
  fallbacks: T,
  rows: Array<{ key: string; value: unknown }>,
): T {
  const result = { ...fallbacks };
  for (const row of rows) {
    if (Object.hasOwn(fallbacks, row.key)) {
      result[row.key as keyof T] = row.value as T[keyof T];
    }
  }
  return result;
}

// 같은 사용자의 여러 save 키를 한 SELECT 로 읽는다. 반환값은 요청한 모든 키를 포함하며,
// DB 행이 없는 키는 호출부 fallback 을 그대로 사용한다.
export async function readSaves<T extends SaveFallbacks>(
  executor: DbExecutor,
  userId: string,
  fallbacks: T,
): Promise<T> {
  const keys = sortedSaveKeys(fallbacks);
  if (keys.length === 0) return { ...fallbacks };
  const rows = await executor
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), inArray(savesKv.key, keys)));
  return savesWithFallbacks(fallbacks, rows);
}

// character.v2 같은 선행 잠금을 호출부가 먼저 잡은 뒤, 나머지 save 키를 정렬된 순서로
// 한 번에 잠글 때 사용한다. 정렬은 서로 다른 라우트의 동일 사용자 동시 요청에서도 잠금
// 획득 순서를 안정적으로 유지한다.
export async function lockSavesForUpdate<T extends SaveFallbacks>(
  executor: DbExecutor,
  userId: string,
  fallbacks: T,
): Promise<T> {
  const keys = sortedSaveKeys(fallbacks);
  if (keys.length === 0) return { ...fallbacks };
  const rows = await executor
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), inArray(savesKv.key, keys)))
    .orderBy(savesKv.key)
    .for("update");
  return savesWithFallbacks(fallbacks, rows);
}

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

// 잠그지 않고 save 키 한 행을 읽어 값(또는 fallback)을 돌려준다. lockSaveForUpdate 와 달리
// FOR UPDATE 가 없어 행 락/락 순서에 끼지 않는다 — 권위적 read-modify-write 가 아닌 곳
// (이름 표시·신참 전적 스냅샷 등 읽기 전용 게이트)에서 사용. 행이 없으면 fallback.
export async function readSave<T = Record<string, unknown>>(
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

// 한 요청에서 최종 상태가 확정된 여러 save 키를 한 INSERT ... ON CONFLICT 문으로 쓴다.
// 각 행의 version 은 기존 단건 upsert 와 동일하게 한 번 증가한다.
export async function upsertSaves(
  executor: DbExecutor,
  userId: string,
  entries: Record<string, unknown>,
): Promise<void> {
  const orderedEntries = Object.entries(entries).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (orderedEntries.length === 0) return;
  const now = new Date();
  await executor
    .insert(savesKv)
    .values(
      orderedEntries.map(([key, value]) => ({
        userId,
        key,
        value,
        version: 1,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [savesKv.userId, savesKv.key],
      set: {
        value: sql`excluded.value`,
        version: sql`${savesKv.version} + 1`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}
