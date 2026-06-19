import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  guildJoinRequests,
  guildLeaveCooldown,
  guildMembers,
  guilds,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  GUILD_JOIN_REQUEST_EXPIRES_DAYS,
  guildMemberCap,
} from "@/adventure/data/guild";

// POST /api/guilds/[id]/requests — 길드 가입 신청.
// 거부: 다른 길드 소속 / 탈퇴 쿨다운 / 해체된 길드 / 정원 꽉참 / 신청 안 받음 / 이미 신청 중.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const { id: idStr } = await params;
  const guildId = Number(idStr);
  if (!Number.isInteger(guildId) || guildId <= 0) {
    return new Response("invalid id", { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
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

      const guildRows = await tx
        .select()
        .from(guilds)
        .where(and(eq(guilds.id, guildId), isNull(guilds.disbandedAt)))
        .for("update");
      const guild = guildRows[0];
      if (!guild) {
        return { error: "guild_not_found", status: 404 as const };
      }
      if (!guild.acceptingRequests) {
        return { error: "not_accepting", status: 409 as const };
      }

      const memberCountRows = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(guildMembers)
        .where(eq(guildMembers.guildId, guildId));
      if (
        Number(memberCountRows[0]?.count ?? 0) >=
        guildMemberCap(guild.nationName != null)
      ) {
        return { error: "guild_full", status: 409 as const };
      }

      const existing = await tx
        .select({ id: guildJoinRequests.id, guildId: guildJoinRequests.guildId })
        .from(guildJoinRequests)
        .where(
          and(
            eq(guildJoinRequests.userId, userId),
            eq(guildJoinRequests.status, "pending"),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        return {
          error: "already_requested",
          status: 409 as const,
          requestedGuildId: existing[0].guildId,
        };
      }

      const expiresAt = new Date(
        Date.now() + GUILD_JOIN_REQUEST_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
      );
      const inserted = await tx
        .insert(guildJoinRequests)
        .values({ guildId, userId, expiresAt })
        .returning({ id: guildJoinRequests.id });

      return {
        ok: true as const,
        requestId: inserted[0].id,
        guildId,
        guildName: guild.name,
      };
    });

    if ("error" in result) {
      return Response.json(result, { status: result.status });
    }
    return Response.json(result);
  } catch (e) {
    console.error("[guilds.requests.POST] ", e);
    return new Response("internal error", { status: 500 });
  }
}
