import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { guildLeaveCooldown, guildMembers, guilds } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { clearAffiliationInTx } from "@/lib/server/guildAffiliation";
import { releaseMemberFromGuildTiles } from "@/lib/server/tileOccupation";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { GUILD_LEAVE_COOLDOWN_DAYS } from "@/adventure/data/guild";

// POST /api/v2/guild/leave — 길드 탈퇴(본인).
//
// 마스터는 바로 못 나간다(혼자 남은 길드원·금고·거점이 주인을 잃지 않도록):
//   · 다른 멤버가 있으면 409 transfer_required (먼저 양도) — /api/v2/guild/transfer
//   · 혼자면         409 disband_required   (해산해야 함) — /api/v2/guild/disband
// 일반 멤버: guildMembers row 삭제 + affiliation "무소속" + 재가입 쿨다운(1일) + 활동 로그.
// 금고/거점은 일반 탈퇴엔 무관(마스터 해산 때만 정산). 락: 본인 멤버십 row FOR UPDATE.

export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await db.transaction(async (tx) => {
    const [mem] = await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .for("update")
      .limit(1);
    if (!mem) {
      return { status: 403, body: { ok: false as const, error: "no_guild" } };
    }

    const [guild] = await tx
      .select({ masterId: guilds.masterId })
      .from(guilds)
      .where(eq(guilds.id, mem.guildId))
      .limit(1);
    if (guild?.masterId === userId) {
      const [row] = await tx
        .select({ cnt: sql<number>`count(*)::int` })
        .from(guildMembers)
        .where(eq(guildMembers.guildId, mem.guildId));
      const total = row?.cnt ?? 1;
      return {
        status: 409,
        body: {
          ok: false as const,
          error:
            total > 1
              ? ("transfer_required" as const)
              : ("disband_required" as const),
        },
      };
    }

    await tx
      .delete(guildMembers)
      .where(
        and(
          eq(guildMembers.guildId, mem.guildId),
          eq(guildMembers.userId, userId),
        ),
      );
    await clearAffiliationInTx(tx, userId);
    // 탈퇴 — 떠난 멤버를 길드 타일에서 분리(영토=길드 소유라 정착지·거점 금고는 길드 잔류).
    await releaseMemberFromGuildTiles(tx, mem.guildId, userId);
    const until = new Date(Date.now() + GUILD_LEAVE_COOLDOWN_DAYS * 86_400_000);
    await tx
      .insert(guildLeaveCooldown)
      .values({ userId, cooldownUntil: until })
      .onConflictDoUpdate({
        target: guildLeaveCooldown.userId,
        set: { cooldownUntil: until },
      });
    await logGuildActivity(tx, {
      guildId: mem.guildId,
      type: "member_leave",
      actorUserId: userId,
    });
    return { status: 200, body: { ok: true as const, guildId: mem.guildId } };
  });

  return Response.json(result.body, { status: result.status });
}
