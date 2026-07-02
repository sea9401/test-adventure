import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  guildInvites,
  guildJoinRequests,
  guildLeaveCooldown,
  guilds,
  marketplaceInbox,
} from "@/db/schema";
import { GUILD_DISBANDED_NAME_HOLD_DAYS } from "@/adventure/data/guild";
import { requireCronAuth } from "@/lib/server/cronAuth";

// Phase 1 cron — 매일 1회.
//   1) 만료된 pending 초대장 → status='expired' (우편함 row 도 같이 claim 처리)
//   1b) 만료된 pending 가입 신청 → status='expired'
//   2) 멤버 0인 활성 길드 → disbandedAt 마킹
//   3) 30일 지난 disbandedAt 길드 → hard delete (이름 재사용 허용)
//   4) 만료된 leave_cooldown row 정리
// 30일 미접속 자동 해체/위임은 Phase 2.
export async function GET(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const now = new Date();

  const expiredInvites = await db
    .update(guildInvites)
    .set({ status: "expired" })
    .where(
      and(eq(guildInvites.status, "pending"), lt(guildInvites.expiresAt, now)),
    )
    .returning({ id: guildInvites.id });

  if (expiredInvites.length > 0) {
    const ids = expiredInvites.map((r) => String(r.id));
    await db
      .update(marketplaceInbox)
      .set({ claimedAt: now })
      .where(
        and(
          eq(marketplaceInbox.kind, "guild_invite"),
          isNull(marketplaceInbox.claimedAt),
          sql`${marketplaceInbox.payload}->>'invite_id' = ANY(${ids})`,
        ),
      );
  }

  const expiredRequests = await db
    .update(guildJoinRequests)
    .set({ status: "expired" })
    .where(
      and(
        eq(guildJoinRequests.status, "pending"),
        lt(guildJoinRequests.expiresAt, now),
      ),
    )
    .returning({ id: guildJoinRequests.id });

  const orphanedDisband = await db.execute(sql`
    UPDATE guilds
    SET disbanded_at = ${now}
    WHERE disbanded_at IS NULL
      AND id NOT IN (SELECT guild_id FROM guild_members)
    RETURNING id
  `);
  const orphanedCount = (orphanedDisband as { rowCount?: number }).rowCount ?? 0;

  const cutoff = new Date(
    now.getTime() - GUILD_DISBANDED_NAME_HOLD_DAYS * 24 * 60 * 60 * 1000,
  );
  const purged = await db
    .delete(guilds)
    .where(
      and(
        sql`${guilds.disbandedAt} IS NOT NULL`,
        lt(guilds.disbandedAt, cutoff),
      ),
    )
    .returning({ id: guilds.id });

  const cooldownPurged = await db
    .delete(guildLeaveCooldown)
    .where(lt(guildLeaveCooldown.cooldownUntil, now))
    .returning({ userId: guildLeaveCooldown.userId });

  return Response.json({
    ok: true,
    invitesExpired: expiredInvites.length,
    joinRequestsExpired: expiredRequests.length,
    guildsDisbanded: orphanedCount,
    guildsPurged: purged.length,
    cooldownsPurged: cooldownPurged.length,
  });
}
