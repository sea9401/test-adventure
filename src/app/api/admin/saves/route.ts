import { eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv, users } from "@/db/schema";
import { logAdminAction } from "@/lib/server/adminAudit";
import { currentAdminEmail, requireAdmin } from "@/lib/server/isAdmin";
import { upsertSave } from "@/lib/server/savesKv";
import { isSyncedKey, type SyncedKey } from "@/lib/storage/synced-keys";
import { PROFILE_STORAGE_KEY } from "@/lib/storage-keys";

// 닉네임 길이 — profile/setup 과 동일.
const NAME_MIN = 1;
const NAME_MAX = 16;

// "이름 중복" 신호 — 트랜잭션 안에서 throw 해서 깔끔하게 롤백.
class TakenError extends Error {
  constructor() {
    super("taken");
  }
}

async function userExists(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows.length > 0;
}

// GET /api/admin/saves?userId=<id>
// 대상 유저의 모든 동기화 키-값을 한 번에 반환. userId 없으면 400.
export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return new Response("missing userId", { status: 400 });
  if (!(await userExists(userId))) {
    return new Response("user not found", { status: 404 });
  }

  const rows = await db
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(eq(savesKv.userId, userId));

  const out: Partial<Record<SyncedKey, unknown>> = {};
  for (const row of rows) {
    if (isSyncedKey(row.key)) out[row.key] = row.value;
  }
  return Response.json(out);
}

// PATCH /api/admin/saves?userId=<id>&key=<synced-key>
// 본문: { value: <jsonb> } — 단일 키 upsert.
//
// 특수 케이스 — key === character-profile.v2 일 때는 users.gameName (권위 컬럼) 도
// 같은 트랜잭션에서 동기화한다. 안 그러면 admin 이 이름을 바꿔도 랭킹/채팅/프로필 조회
// 등 users.gameName 을 읽는 경로는 옛 이름을 그대로 표시한다 (profile/setup 과 동일 정책).
//
// 주의: 대상 유저의 게임 라우트는 새로고침해야 반영된다.
export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const key = url.searchParams.get("key");
  if (!userId) return new Response("missing userId", { status: 400 });
  if (!key || !isSyncedKey(key)) {
    return new Response(`unknown key: ${key}`, { status: 400 });
  }
  if (!(await userExists(userId))) {
    return new Response("user not found", { status: 404 });
  }

  let body: { value: unknown };
  try {
    body = (await req.json()) as { value: unknown };
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  if (body.value === undefined) {
    return new Response("missing value", { status: 400 });
  }

  let profileNameSynced: string | null = null;
  try {
    await db.transaction(async (tx) => {
      await upsertSave(tx, userId, key, body.value);

      if (key === PROFILE_STORAGE_KEY) {
        // character-profile.v2 의 name 을 users.gameName 으로 미러. 잘못된 값 (비문자열·
        // 길이 위반) 은 gameName 업데이트를 생략 — savesKv 자체는 admin 신뢰로 통과시킨다.
        const value =
          body.value && typeof body.value === "object"
            ? (body.value as { name?: unknown })
            : null;
        const rawName = value && typeof value.name === "string" ? value.name.trim() : null;
        if (rawName && rawName.length >= NAME_MIN && rawName.length <= NAME_MAX) {
          // 다른 유저와 충돌(23505) 이면 TakenError 로 변환 → 트랜잭션 롤백 + 409.
          try {
            await tx
              .update(users)
              .set({ gameName: rawName, updatedAt: new Date() })
              .where(eq(users.id, userId));
            profileNameSynced = rawName;
          } catch (e) {
            const code = (e as { code?: string }).code;
            if (code === "23505") throw new TakenError();
            throw e;
          }
        }
      }
    });
  } catch (e) {
    if (e instanceof TakenError) {
      return Response.json({ error: "taken" }, { status: 409 });
    }
    throw e;
  }

  await logAdminAction({
    adminEmail: await currentAdminEmail(),
    action: "saves.patch",
    targetUserId: userId,
    detail: {
      key,
      profileNameSynced,
    },
  });

  return Response.json({ ok: true, updatedAt: Date.now() });
}
