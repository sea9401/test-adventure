import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  guildInvites,
  guildLeaveCooldown,
  guildMembers,
  guilds,
  marketplaceInbox,
  savesKv,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { upsertSave } from "@/lib/server/savesKv";
import { SAVES_CHARACTER } from "@/lib/server/guildAffiliation";
import { cancelPendingJoinRequestsInTx } from "@/lib/server/guildJoinRequests";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { guildMemberCap } from "@/adventure/data/guild";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ inviteId: string }> },
) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const { inviteId: idStr } = await params;
  const inviteId = Number(idStr);
  if (!Number.isInteger(inviteId) || inviteId <= 0) {
    return new Response("invalid id", { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const invRows = await tx
        .select()
        .from(guildInvites)
        .where(eq(guildInvites.id, inviteId))
        .for("update");
      const invite = invRows[0];
      if (!invite) {
        return { error: "invite_not_found", status: 404 as const };
      }
      if (invite.toUserId !== userId) {
        return { error: "not_recipient", status: 403 as const };
      }
      if (invite.status !== "pending") {
        return { error: "invite_not_pending", status: 409 as const };
      }
      if (invite.expiresAt < new Date()) {
        return { error: "invite_expired", status: 409 as const };
      }

      // 길드 row FOR UPDATE — 같은 길드로의 동시 초대 수락이 정원 체크를 직렬화하도록
      //   (각 초대 row 만 잠그면 서로 다른 초대 2건이 같은 멤버수를 읽고 둘 다 통과 → 오버플로우).
      const guildRows = await tx
        .select()
        .from(guilds)
        .where(and(eq(guilds.id, invite.guildId), isNull(guilds.disbandedAt)))
        .for("update")
        .limit(1);
      const guild = guildRows[0];
      if (!guild) {
        return { error: "guild_disbanded", status: 409 as const };
      }

      const myMembership = await tx
        .select({ id: guildMembers.guildId })
        .from(guildMembers)
        .where(eq(guildMembers.userId, userId))
        .limit(1);
      if (myMembership.length > 0) {
        return { error: "already_in_guild", status: 409 as const };
      }

      const cooldown = await tx
        .select()
        .from(guildLeaveCooldown)
        .where(eq(guildLeaveCooldown.userId, userId))
        .limit(1);
      if (cooldown[0] && cooldown[0].cooldownUntil > new Date()) {
        return {
          error: "cooldown",
          status: 409 as const,
          until: cooldown[0].cooldownUntil.toISOString(),
        };
      }

      const memberCountRows = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(guildMembers)
        .where(eq(guildMembers.guildId, invite.guildId));
      const memberCount = Number(memberCountRows[0]?.count ?? 0);
      if (memberCount >= guildMemberCap(guild.nationName != null)) {
        return { error: "guild_full", status: 409 as const };
      }

      await tx.insert(guildMembers).values({
        guildId: invite.guildId,
        userId,
        role: "member",
      });
      await logGuildActivity(tx, {
        guildId: invite.guildId,
        type: "member_join",
        targetUserId: userId,
      });

      await tx
        .update(guildInvites)
        .set({ status: "accepted" })
        .where(eq(guildInvites.id, inviteId));
      // 길드에 들어갔으니 그 유저의 다른 pending 가입 신청은 정리.
      await cancelPendingJoinRequestsInTx(tx, userId);

      const charRows = await tx
        .select()
        .from(savesKv)
        .where(
          and(eq(savesKv.userId, userId), eq(savesKv.key, SAVES_CHARACTER)),
        )
        .for("update");
      if (charRows.length > 0) {
        const character = charRows[0].value as Record<string, unknown>;
        await upsertSave(tx, userId, SAVES_CHARACTER, {
          ...character,
          affiliation: guild.name,
        });
      }

      await tx
        .update(marketplaceInbox)
        .set({ claimedAt: new Date() })
        .where(
          and(
            eq(marketplaceInbox.userId, userId),
            eq(marketplaceInbox.kind, "guild_invite"),
            sql`${marketplaceInbox.payload}->>'invite_id' = ${String(inviteId)}`,
            isNull(marketplaceInbox.claimedAt),
          ),
        );

      return {
        ok: true as const,
        guildId: invite.guildId,
        guildName: guild.name,
      };
    });

    if ("error" in result) {
      return Response.json(result, { status: result.status });
    }
    return Response.json(result);
  } catch (e) {
    console.error("[guilds.invites.accept.POST] ", e);
    return new Response("internal error", { status: 500 });
  }
}
