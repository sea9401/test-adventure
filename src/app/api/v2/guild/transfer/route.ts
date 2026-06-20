import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { logGuildActivity } from "@/lib/server/guildActivityLog";

// POST /api/v2/guild/transfer — 길드 마스터 양도 (마스터 전용). body: { targetUserId }
//
// 리더십 원천 = guilds.masterId. 동시에 guild_members.role 도 'master' 를 들고 있으므로
// (계정삭제 라우트가 role==='master' 로 판정) 둘을 함께 갱신한다:
//   guilds.masterId = 대상 · 대상 role = 'master' · 옛 마스터 role = 'member'.
// 양쪽 다 길드에 그대로 남으므로 affiliation/쿨다운 변화 없음.
// 락: 길드 row + 대상 멤버십 row FOR UPDATE.

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { targetUserId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.targetUserId !== "string" || body.targetUserId.length === 0) {
    return Response.json({ ok: false, error: "bad_target" }, { status: 400 });
  }
  const targetUserId = body.targetUserId;

  const result = await db.transaction(async (tx) => {
    const [mem] = await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1);
    if (!mem) {
      return { status: 403, body: { ok: false as const, error: "no_guild" } };
    }
    const [guild] = await tx
      .select({ masterId: guilds.masterId })
      .from(guilds)
      .where(eq(guilds.id, mem.guildId))
      .for("update")
      .limit(1);
    if (!guild || guild.masterId !== userId) {
      return { status: 403, body: { ok: false as const, error: "not_master" } };
    }
    if (targetUserId === guild.masterId) {
      return {
        status: 400,
        body: { ok: false as const, error: "already_master" },
      };
    }
    const [targetMem] = await tx
      .select({ userId: guildMembers.userId })
      .from(guildMembers)
      .where(
        and(
          eq(guildMembers.guildId, mem.guildId),
          eq(guildMembers.userId, targetUserId),
        ),
      )
      .for("update")
      .limit(1);
    if (!targetMem) {
      return {
        status: 404,
        body: { ok: false as const, error: "target_not_member" },
      };
    }

    await tx
      .update(guilds)
      .set({ masterId: targetUserId })
      .where(eq(guilds.id, mem.guildId));
    await tx
      .update(guildMembers)
      .set({ role: "master" })
      .where(
        and(
          eq(guildMembers.guildId, mem.guildId),
          eq(guildMembers.userId, targetUserId),
        ),
      );
    await tx
      .update(guildMembers)
      .set({ role: "member" })
      .where(
        and(
          eq(guildMembers.guildId, mem.guildId),
          eq(guildMembers.userId, userId),
        ),
      );
    await logGuildActivity(tx, {
      guildId: mem.guildId,
      type: "leadership_transfer",
      actorUserId: userId,
      targetUserId,
    });
    return {
      status: 200,
      body: { ok: true as const, newMasterId: targetUserId },
    };
  });

  return Response.json(result.body, { status: result.status });
}
