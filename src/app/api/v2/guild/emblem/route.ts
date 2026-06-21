import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { isValidGuildEmblem } from "@/adventure/data/guild-emblems";

// POST /api/v2/guild/emblem — 길드 엠블럼 설정 (마스터 전용).
//
// body: { emblem: string }  — guild-emblems 카탈로그 키.
// 게이트: 길드 마스터일 것. 효과: guilds.emblem 설정 → 지도 마커가 그 길드 거점에 엠블럼 표시.
// 응답: { ok: true, emblem } | { ok: false, error }

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { emblem?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!isValidGuildEmblem(body.emblem)) {
    return Response.json({ ok: false, error: "bad_emblem" }, { status: 400 });
  }
  const emblem = body.emblem;

  const result = await db.transaction(async (tx) => {
    // 내 길드.
    const [mem] = await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1);
    if (!mem) {
      return { status: 403, body: { ok: false as const, error: "no_guild" } };
    }

    // 길드 row 락 — 마스터 확인.
    const [guild] = await tx
      .select({ masterId: guilds.masterId })
      .from(guilds)
      .where(and(eq(guilds.id, mem.guildId), isNull(guilds.disbandedAt)))
      .for("update")
      .limit(1);
    if (!guild) {
      return {
        status: 404,
        body: { ok: false as const, error: "guild_not_found" },
      };
    }
    if (guild.masterId !== userId) {
      return { status: 403, body: { ok: false as const, error: "not_master" } };
    }

    await tx.update(guilds).set({ emblem }).where(eq(guilds.id, mem.guildId));
    return { status: 200, body: { ok: true as const, emblem } };
  });

  return Response.json(result.body, { status: result.status });
}
