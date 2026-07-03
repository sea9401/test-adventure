import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { savesKv, users } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { PROFILE_STORAGE_KEY } from "@/lib/storage-keys";
import { parseRareMaps } from "@/adventure/data/v2/rareMaps";

// POST /api/v2/me/rename — 닉네임 변경. 「개명 신전 입장권」(utility) 1장 소모.
//   body: { map: <iid>, name: string }
// 게임 내 유일한 개명 수단(생성 후 이름은 고정). 검증/쓰기는 /api/profile/setup 의
// 신규 경로와 동일 규약: legacy savesKv 이름 + users.gameName UNIQUE(23505) 이중 검사,
// users.gameName(권위) + character-profile.v2 를 한 트랜잭션에 함께 쓴다.
// 옛 피드/우편의 이름은 시점 스냅샷이라 그대로 둔다(의도).

const NAME_MIN = 1;
const NAME_MAX = 16;

class TakenError extends Error {
  constructor() {
    super("taken");
  }
}

type CharSave = { rareMaps?: unknown; [k: string]: unknown };

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { map?: unknown; name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const iid = typeof body.map === "string" ? body.map : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!iid || name.length < NAME_MIN || name.length > NAME_MAX) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const now = Date.now();
      // 입장권 게이트 — character.v2 lock(소모 쓰기까지 동일 락).
      const charSave = await lockSaveForUpdate<CharSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const maps = parseRareMaps(charSave.rareMaps, now);
      const map = maps.find((m) => m.iid === iid && m.kind === "rename_map");
      if (!map) {
        return { status: 403, body: { ok: false as const, error: "no_map" } };
      }

      // 현재 프로필 — 같은 이름으로의 "변경"은 입장권 낭비라 거부.
      const profRows = await tx
        .select({ value: savesKv.value })
        .from(savesKv)
        .where(
          and(eq(savesKv.userId, userId), eq(savesKv.key, PROFILE_STORAGE_KEY)),
        )
        .limit(1);
      const profile = (profRows[0]?.value ?? null) as {
        name?: string;
        gender?: string;
      } | null;
      if (!profile?.name) {
        return {
          status: 400,
          body: { ok: false as const, error: "no_profile" },
        };
      }
      if (profile.name === name) {
        return {
          status: 400,
          body: { ok: false as const, error: "same_name" },
        };
      }

      // 중복 검사 — legacy savesKv 이름(대소문자 무시) + users.gameName UNIQUE.
      const legacyHit = await tx
        .select({ userId: savesKv.userId })
        .from(savesKv)
        .where(
          sql`${savesKv.key} = ${PROFILE_STORAGE_KEY} and ${savesKv.userId} <> ${userId} and lower(${savesKv.value}->>'name') = lower(${name})`,
        )
        .limit(1);
      if (legacyHit.length > 0) throw new TakenError();
      try {
        await tx
          .update(users)
          .set({ gameName: name, updatedAt: new Date() })
          .where(eq(users.id, userId));
      } catch (e) {
        if ((e as { code?: string }).code === "23505") throw new TakenError();
        throw e;
      }

      // 프로필 + 입장권 소모(1회용 — 제거).
      await upsertSave(tx, userId, PROFILE_STORAGE_KEY, {
        ...profile,
        name,
      });
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        rareMaps: maps.filter((m) => m.iid !== iid),
      });

      return { status: 200, body: { ok: true as const, name } };
    });
    return Response.json(result.body, { status: result.status });
  } catch (e) {
    if (e instanceof TakenError) {
      return Response.json({ ok: false, error: "taken" }, { status: 409 });
    }
    throw e;
  }
}
