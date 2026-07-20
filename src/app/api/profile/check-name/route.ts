import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users, savesKv } from "@/db/schema";
import { ensureOriginalUser } from "@/lib/server/ensureUser";
import { PROFILE_STORAGE_KEY } from "@/lib/storage-keys";
import { validateCharacterName } from "@/adventure/profile/characterNamePolicy";

// GET /api/profile/check-name?name=Hero
// 닉네임이 다른 유저에 의해 이미 등록되어 있는지 검사 (case-insensitive).
// users.gameName + savesKv 의 character-profile.v2 양쪽 모두 검사.
// 본인 소유 닉네임은 available=true 로 반환.
export async function GET(req: Request) {
  const userId = await ensureOriginalUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const nameCheck = validateCharacterName(url.searchParams.get("name"));
  if (!nameCheck.ok) {
    return Response.json({ available: false, reason: nameCheck.reason });
  }
  const name = nameCheck.name;

  // 1) users.gameName (authoritative) 에서 본인 제외 case-insensitive 검색
  const usersHit = await db
    .select({ id: users.id })
    .from(users)
    .where(
      sql`lower(${users.gameName}) = lower(${name}) and ${users.id} <> ${userId}`,
    )
    .limit(1);
  if (usersHit.length > 0) {
    return Response.json({ available: false, reason: "taken" });
  }

  // 2) 기존 savesKv 프로필 (legacy) — 본인 제외
  const legacyHit = await db
    .select({ userId: savesKv.userId })
    .from(savesKv)
    .where(
      sql`${savesKv.key} = ${PROFILE_STORAGE_KEY} and ${savesKv.userId} <> ${userId} and lower(${savesKv.value}->>'name') = lower(${name})`,
    )
    .limit(1);
  if (legacyHit.length > 0) {
    return Response.json({ available: false, reason: "taken" });
  }

  return Response.json({ available: true });
}
