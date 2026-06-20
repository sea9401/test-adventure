import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { guildLeaveCooldown, guildMembers, guilds } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { clearAffiliationInTx } from "@/lib/server/guildAffiliation";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { GUILD_LEAVE_COOLDOWN_DAYS } from "@/adventure/data/guild";

// POST /api/v2/guild/kick — 길드원 추방 (마스터 전용). body: { targetUserId }
//
// 마스터만 추방 가능(역할 변경 라우트와 동일 권한 모델). 마스터 본인은 추방 불가(해산/양도로).
// 대상의 guildMembers row 삭제 + affiliation "무소속" + 재가입 쿨다운(1일) + 활동 로그.
// 락: 대상 멤버십 row FOR UPDATE.

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
    // 권한 원천(masterId)을 FOR UPDATE 로 잠가 동시 transfer 와의 TOCTOU 방지.
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
        body: { ok: false as const, error: "cannot_kick_self" },
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
      .delete(guildMembers)
      .where(
        and(
          eq(guildMembers.guildId, mem.guildId),
          eq(guildMembers.userId, targetUserId),
        ),
      );
    await clearAffiliationInTx(tx, targetUserId);
    const until = new Date(Date.now() + GUILD_LEAVE_COOLDOWN_DAYS * 86_400_000);
    await tx
      .insert(guildLeaveCooldown)
      .values({ userId: targetUserId, cooldownUntil: until })
      .onConflictDoUpdate({
        target: guildLeaveCooldown.userId,
        set: { cooldownUntil: until },
      });
    await logGuildActivity(tx, {
      guildId: mem.guildId,
      type: "member_kick",
      actorUserId: userId,
      targetUserId,
    });
    return {
      status: 200,
      body: { ok: true as const, removedUserId: targetUserId },
    };
  });

  return Response.json(result.body, { status: result.status });
}
