import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { savesKv, users } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { PROFILE_STORAGE_KEY } from "@/lib/storage-keys";
import { parseRareMaps } from "@/adventure/data/v2/rareMaps";
import {
  isMuseunCashItemId,
  removeMuseunCashItem,
} from "@/adventure/data/v2/museunCashItems";
import { validateCharacterName } from "@/adventure/profile/characterNamePolicy";
import { requireCurrentUgcConsent } from "@/lib/server/ugcSafety";

// POST /api/v2/me/rename — 닉네임 변경. 열린 「개명 신전 지도」를 완료하거나
// 캐시 「개명 허가증」 1장을 소모한다.
//   body: { map: <iid>, name: string } | { cashItemId: "rename_permit", name: string }
// 게임 내 유일한 개명 수단(생성 후 이름은 고정). 검증/쓰기는 /api/profile/setup 의
// 신규 경로와 동일 규약: legacy savesKv 이름 + users.gameName UNIQUE(23505) 이중 검사,
// users.gameName(권위) + character-profile.v2 를 한 트랜잭션에 함께 쓴다.
// 옛 피드/우편의 이름은 시점 스냅샷이라 그대로 둔다(의도).

class TakenError extends Error {
  constructor() {
    super("taken");
  }
}

type CharSave = {
  rareMaps?: unknown;
  cashItems?: unknown;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const consentFailure = await requireCurrentUgcConsent(userId);
  if (consentFailure) return consentFailure;

  let body: { map?: unknown; cashItemId?: unknown; name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const iid = typeof body.map === "string" ? body.map : "";
  const usesCashPermit =
    isMuseunCashItemId(body.cashItemId) &&
    body.cashItemId === "rename_permit";
  const nameCheck = validateCharacterName(body.name);
  if (!iid && !usesCashPermit) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  if (!nameCheck.ok) {
    return Response.json(
      { ok: false, error: "invalid", reason: nameCheck.reason },
      { status: 400 },
    );
  }
  const name = nameCheck.name;

  try {
    const result = await db.transaction(async (tx) => {
      const now = Date.now();
      // 희귀 장소/허가증 게이트 — character.v2 lock(완료 쓰기까지 동일 락).
      const charSave = await lockSaveForUpdate<CharSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const maps = parseRareMaps(charSave.rareMaps, now);
      const map = usesCashPermit
        ? undefined
        : maps.find((m) => m.iid === iid && m.kind === "rename_map");
      const nextCashItems = usesCashPermit
        ? removeMuseunCashItem(charSave.cashItems, "rename_permit", 1)
        : null;
      if (!map && !nextCashItems) {
        return {
          status: 403,
          body: { ok: false as const, error: "no_ticket" },
        };
      }

      // 현재 프로필 — 같은 이름으로의 "변경"은 지도/허가증 낭비라 거부.
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

      // 프로필 + 희귀 장소 완료(지도 제거) 또는 캐시 허가증 소모.
      await upsertSave(tx, userId, PROFILE_STORAGE_KEY, {
        ...profile,
        name,
      });
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        ...(map ? { rareMaps: maps.filter((m) => m.iid !== iid) } : {}),
        ...(nextCashItems ? { cashItems: nextCashItems } : {}),
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
