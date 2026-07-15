import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { requireActiveDeviceSession } from "@/lib/server/checkSession";
import { sanitizeSavePayload } from "@/lib/server/saveSanitize";
import { isSyncedKey } from "@/lib/storage/synced-keys";

// GET /api/save — 로그인한 사용자의 모든 동기화 키-값을 한 번에 반환.
// 클라이언트는 마운트 시 1회 호출해 Context 에 hydrate.
// 응답: { <key>: <value>, ..., "_version": { <key>: <number> } }
//        _version 은 동기화 키가 아니므로 클라이언트의 isSyncedKey 필터에서 자연스럽게 제외됨.
export async function GET(req: Request) {
  const userId = await ensureUser({ skipDeviceCheck: true });
  if (!userId) return new Response("unauthorized", { status: 401 });
  const sessionFail = await requireActiveDeviceSession(userId, req);
  if (sessionFail) return sessionFail;

  const rows = await db
    .select({
      key: savesKv.key,
      value: savesKv.value,
      version: savesKv.version,
    })
    .from(savesKv)
    .where(eq(savesKv.userId, userId));

  const out: Record<string, unknown> = {};
  const versions: Record<string, number> = {};
  for (const row of rows) {
    if (isSyncedKey(row.key)) {
      out[row.key] = row.value;
      versions[row.key] = row.version;
    }
  }
  out["_version"] = versions;
  return Response.json(out);
}

// PATCH /api/save?key=character.v2 — 단일 키 upsert + 낙관적 동시성 제어.
// 본문: { value: <jsonb>, expectedVersion?: number | null }
//   - expectedVersion === null: row 가 없을 거라 기대 (INSERT). 이미 있으면 409.
//   - expectedVersion === <number>: 현재 version 과 일치할 때만 UPDATE. 불일치 → 409.
//   - expectedVersion === undefined: 기존 호환 — 무조건 덮어쓰기 (blind upsert).
// 성공 응답: { ok: true, version: <new number> }
// 충돌 응답 (409): { error: "stale", currentVersion: <number | null> }
export async function PATCH(req: Request) {
  const userId = await ensureUser({ skipDeviceCheck: true });
  if (!userId) return new Response("unauthorized", { status: 401 });
  const sessionFail = await requireActiveDeviceSession(userId, req);
  if (sessionFail) return sessionFail;

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key || !isSyncedKey(key)) {
    return new Response(`unknown key: ${key}`, { status: 400 });
  }

  let body: { value: unknown; expectedVersion?: number | null };
  try {
    body = (await req.json()) as {
      value: unknown;
      expectedVersion?: number | null;
    };
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  if (body.value === undefined) {
    return new Response("missing value", { status: 400 });
  }

  // 위생 검사 — NaN/Infinity 차단 + character.v2 절대값 가드.
  // 삭제 의도(value=null)는 검사 안 함 — sanitize 통과시켜 아래 null 분기로.
  if (body.value !== null) {
    const sanitized = sanitizeSavePayload(key, body.value);
    if (!sanitized.ok) {
      return Response.json(
        { error: "invalid_payload", reason: sanitized.reason },
        { status: 422 },
      );
    }
  }

  const now = new Date();
  const expectedVersion = body.expectedVersion;

  // value === null → row 삭제. savesKv.value 가 NOT NULL jsonb 라 null upsert 시
  // DB constraint 위반으로 500 이 나던 버그 (예: 시련 완료 후 setTrial(null) PATCH).
  // 의미상 null = "이 키는 비어있다" 라 row 자체를 지우는 게 자연스러움.
  // expectedVersion 은 일치 검사 후 삭제 — 다른 디바이스가 갱신했으면 stale 응답.
  if (body.value === null) {
    if (expectedVersion === undefined || expectedVersion === null) {
      // blind 삭제 — row 가 없으면 no-op.
      await db
        .delete(savesKv)
        .where(and(eq(savesKv.userId, userId), eq(savesKv.key, key)));
      return Response.json({ ok: true, version: 0 });
    }
    if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion)) {
      return new Response("invalid expectedVersion", { status: 400 });
    }
    const deleted = await db
      .delete(savesKv)
      .where(
        and(
          eq(savesKv.userId, userId),
          eq(savesKv.key, key),
          eq(savesKv.version, expectedVersion),
        ),
      )
      .returning({ version: savesKv.version });
    if (deleted.length === 0) {
      const current = await db
        .select({ version: savesKv.version })
        .from(savesKv)
        .where(and(eq(savesKv.userId, userId), eq(savesKv.key, key)))
        .limit(1);
      return new Response(
        JSON.stringify({
          error: "stale",
          currentVersion: current[0]?.version ?? null,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }
    return Response.json({ ok: true, version: 0 });
  }

  // expectedVersion 미지정 — 기존 동작 (blind upsert).
  if (expectedVersion === undefined) {
    const result = await db
      .insert(savesKv)
      .values({ userId, key, value: body.value, version: 1, updatedAt: now })
      .onConflictDoUpdate({
        target: [savesKv.userId, savesKv.key],
        set: {
          value: body.value,
          version: sql`${savesKv.version} + 1`,
          updatedAt: now,
        },
      })
      .returning({ version: savesKv.version });
    return Response.json({ ok: true, version: result[0].version });
  }

  // expectedVersion === null — row 가 없을 거라 기대.
  if (expectedVersion === null) {
    const result = await db
      .insert(savesKv)
      .values({ userId, key, value: body.value, version: 1, updatedAt: now })
      .onConflictDoNothing()
      .returning({ version: savesKv.version });
    if (result.length === 0) {
      const current = await db
        .select({ version: savesKv.version })
        .from(savesKv)
        .where(and(eq(savesKv.userId, userId), eq(savesKv.key, key)))
        .limit(1);
      return new Response(
        JSON.stringify({
          error: "stale",
          currentVersion: current[0]?.version ?? null,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }
    return Response.json({ ok: true, version: result[0].version });
  }

  // expectedVersion === <number> — 그 version 과 일치할 때만 UPDATE.
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion)) {
    return new Response("invalid expectedVersion", { status: 400 });
  }
  const result = await db
    .update(savesKv)
    .set({
      value: body.value,
      version: sql`${savesKv.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(savesKv.userId, userId),
        eq(savesKv.key, key),
        eq(savesKv.version, expectedVersion),
      ),
    )
    .returning({ version: savesKv.version });
  if (result.length === 0) {
    const current = await db
      .select({ version: savesKv.version })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, key)))
      .limit(1);
    return new Response(
      JSON.stringify({
        error: "stale",
        currentVersion: current[0]?.version ?? null,
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }
  return Response.json({ ok: true, version: result[0].version });
}

// DELETE /api/save — 사용자의 모든 동기화 데이터 제거 (관리자 페이지에서 사용).
// DELETE /api/save?key=character.v1 — 단일 키만 제거.
export async function DELETE(req: Request) {
  const userId = await ensureUser({ skipDeviceCheck: true });
  if (!userId) return new Response("unauthorized", { status: 401 });
  const sessionFail = await requireActiveDeviceSession(userId, req);
  if (sessionFail) return sessionFail;

  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (key) {
    if (!isSyncedKey(key)) {
      return new Response(`unknown key: ${key}`, { status: 400 });
    }
    await db
      .delete(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, key)));
  } else {
    await db.delete(savesKv).where(eq(savesKv.userId, userId));
  }

  return Response.json({ ok: true });
}
