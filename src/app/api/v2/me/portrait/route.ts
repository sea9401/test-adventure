import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { PROFILE_STORAGE_KEY } from "@/lib/storage-keys";
import { isValidAvatarId } from "@/adventure/profile/avatars";
import { parseRareMaps } from "@/adventure/data/v2/rareMaps";

// POST /api/v2/me/portrait — 프로필 초상화(외형) 변경. 「화공 공방 입장권」 1장 소모.
//   body: { map: <iid>, avatar: Avatar }
// 게임 내 유일한 초상화 변경 수단 — 옛 무게이트 /api/profile/avatar 는 410 폐기.

type CharSave = { rareMaps?: unknown; [k: string]: unknown };

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { map?: unknown; avatar?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const iid = typeof body.map === "string" ? body.map : "";
  const avatar = typeof body.avatar === "string" ? body.avatar : "";
  if (!iid || !isValidAvatarId(avatar)) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const now = Date.now();
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const maps = parseRareMaps(charSave.rareMaps, now);
    const map = maps.find((m) => m.iid === iid && m.kind === "portrait_map");
    if (!map) {
      return { status: 403, body: { ok: false as const, error: "no_map" } };
    }

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
      return { status: 400, body: { ok: false as const, error: "no_profile" } };
    }
    if (profile.gender === avatar) {
      return {
        status: 400,
        body: { ok: false as const, error: "same_avatar" },
      };
    }

    await upsertSave(tx, userId, PROFILE_STORAGE_KEY, {
      ...profile,
      gender: avatar,
    });
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      rareMaps: maps.filter((m) => m.iid !== iid),
    });
    return { status: 200, body: { ok: true as const, avatar } };
  });
  return Response.json(result.body, { status: result.status });
}
