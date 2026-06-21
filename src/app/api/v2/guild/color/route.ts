import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { isValidGuildColor } from "@/adventure/data/guild-colors";

// POST /api/v2/guild/color — 길드 고유색 설정 (마스터 전용, 선착순 유니크).
//
// body: { color: string }  — guild-colors 팔레트 키.
// 게이트: 길드 마스터일 것. 활성 길드끼리 색 중복 금지(이미 쓰이면 color_taken 409).
//   동시 선택 레이스는 guilds_color_active_idx 부분 유니크 인덱스가 백스톱(23505 → color_taken).
// 응답: { ok: true, color } | { ok: false, error }

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { color?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!isValidGuildColor(body.color)) {
    return Response.json({ ok: false, error: "bad_color" }, { status: 400 });
  }
  const color = body.color;

  let result: { status: number; body: Record<string, unknown> };
  try {
    result = await db.transaction(async (tx) => {
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

      // 색 중복 — 다른 활성 길드가 이미 쓰면 거부(친절 에러). 레이스는 인덱스가 막는다.
      const [taken] = await tx
        .select({ id: guilds.id })
        .from(guilds)
        .where(
          and(
            eq(guilds.color, color),
            isNull(guilds.disbandedAt),
            ne(guilds.id, mem.guildId),
          ),
        )
        .limit(1);
      if (taken) {
        return { status: 409, body: { ok: false as const, error: "color_taken" } };
      }

      await tx.update(guilds).set({ color }).where(eq(guilds.id, mem.guildId));
      return { status: 200, body: { ok: true as const, color } };
    });
  } catch (e) {
    // 부분 유니크 인덱스 위반(동시 선택 레이스) → color_taken.
    if ((e as { code?: string })?.code === "23505") {
      return Response.json(
        { ok: false, error: "color_taken" },
        { status: 409 },
      );
    }
    throw e;
  }

  return Response.json(result.body, { status: result.status });
}
