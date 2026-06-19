import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  guildInvites,
  guildLeaveCooldown,
  guildMembers,
  guilds,
  marketplaceInbox,
  users,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { isAdminRole } from "@/lib/server/guildAdmin";
import { findUserByName } from "@/lib/server/findUserByName";
import { inboxValues } from "@/lib/server/inboxPayload";
import {
  GUILD_INVITE_EXPIRES_DAYS,
  guildMemberCap,
} from "@/adventure/data/guild";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const { id: idStr } = await params;
  const guildId = Number(idStr);
  if (!Number.isInteger(guildId) || guildId <= 0) {
    return new Response("invalid id", { status: 400 });
  }

  let body: { name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    return new Response("name required", { status: 400 });
  }
  const targetName = body.name.trim();

  const target = await findUserByName(targetName);
  if (!target) {
    return Response.json({ error: "target_not_found" }, { status: 404 });
  }
  if (target.id === userId) {
    return Response.json({ error: "self_invite" }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const guildRows = await tx
        .select()
        .from(guilds)
        .where(eq(guilds.id, guildId))
        .limit(1);
      const guild = guildRows[0];
      if (!guild || guild.disbandedAt !== null) {
        return { error: "guild_not_found", status: 404 as const };
      }
      if (guild.masterId !== userId) {
        // 관리 직책(부마스터/관리자)도 초대 가능 — 길드 관리탭 권한.
        const memRows = await tx
          .select({ role: guildMembers.role })
          .from(guildMembers)
          .where(
            and(
              eq(guildMembers.guildId, guildId),
              eq(guildMembers.userId, userId),
            ),
          )
          .limit(1);
        if (!isAdminRole(memRows[0]?.role)) {
          return { error: "not_master", status: 403 as const };
        }
      }

      const memberCountRows = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(guildMembers)
        .where(eq(guildMembers.guildId, guildId));
      const memberCount = Number(memberCountRows[0]?.count ?? 0);
      if (memberCount >= guildMemberCap(guild.nationName != null)) {
        return { error: "guild_full", status: 409 as const };
      }

      const targetMembership = await tx
        .select({ id: guildMembers.guildId })
        .from(guildMembers)
        .where(eq(guildMembers.userId, target.id))
        .limit(1);
      if (targetMembership.length > 0) {
        return { error: "target_in_guild", status: 409 as const };
      }

      const cooldown = await tx
        .select()
        .from(guildLeaveCooldown)
        .where(eq(guildLeaveCooldown.userId, target.id))
        .limit(1);
      if (cooldown[0] && cooldown[0].cooldownUntil > new Date()) {
        return {
          error: "target_cooldown",
          status: 409 as const,
          until: cooldown[0].cooldownUntil.toISOString(),
        };
      }

      const existingInvite = await tx
        .select({ id: guildInvites.id })
        .from(guildInvites)
        .where(
          and(
            eq(guildInvites.guildId, guildId),
            eq(guildInvites.toUserId, target.id),
            eq(guildInvites.status, "pending"),
          ),
        )
        .limit(1);
      if (existingInvite.length > 0) {
        return { error: "already_invited", status: 409 as const };
      }

      // 초대 보낸 사람 이름 — 마스터/관리자 모두 가능해져 "마스터" 라벨 대신 사용.
      const inviterRows = await tx
        .select({ name: users.gameName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const inviterName = inviterRows[0]?.name ?? null;

      const expiresAt = new Date(
        Date.now() + GUILD_INVITE_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
      );
      const invInsert = await tx
        .insert(guildInvites)
        .values({
          guildId,
          fromUserId: userId,
          toUserId: target.id,
          expiresAt,
        })
        .returning({ id: guildInvites.id });
      const inviteId = invInsert[0].id;

      await tx.insert(marketplaceInbox).values(
        inboxValues({
          userId: target.id,
          payload: {
            kind: "guild_invite",
            invite_id: inviteId,
            guild_id: guildId,
            guild_name: guild.name,
            expires_at: expiresAt.toISOString(),
          },
          message: `${guild.name} 길드 초대 (보낸 사람: ${inviterName ?? "?"})`,
          fromUserId: userId,
          fromName: inviterName,
        }),
      );

      return {
        ok: true as const,
        inviteId,
        targetName: target.name,
      };
    });

    if ("error" in result) {
      return Response.json(result, { status: result.status });
    }
    return Response.json(result);
  } catch (e) {
    console.error("[guilds.invite.POST] ", e);
    return new Response("internal error", { status: 500 });
  }
}
