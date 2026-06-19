import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  guildJoinRequests,
  guildLeaveCooldown,
  guildMembers,
  guilds,
  savesKv,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { isAdminRole } from "@/lib/server/guildAdmin";
import { upsertSave } from "@/lib/server/savesKv";
import { SAVES_CHARACTER } from "@/lib/server/guildAffiliation";
import { cancelPendingJoinRequestsInTx } from "@/lib/server/guildJoinRequests";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { guildMemberCap } from "@/adventure/data/guild";

// POST /api/guilds/requests/[requestId]/accept — 마스터가 가입 신청 수락 → 멤버로 추가.
// 거부: 마스터 아님 / 신청 pending 아님 / 길드 해체·정원 꽉참 / 신청자가 이미 다른 길드 소속·쿨다운.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const { requestId: idStr } = await params;
  const requestId = Number(idStr);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return new Response("invalid id", { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const reqRows = await tx
        .select()
        .from(guildJoinRequests)
        .where(eq(guildJoinRequests.id, requestId))
        .for("update");
      const reqRow = reqRows[0];
      if (!reqRow) return { error: "request_not_found", status: 404 as const };
      if (reqRow.status !== "pending") {
        return { error: "request_not_pending", status: 409 as const };
      }
      const applicantId = reqRow.userId;

      const guildRows = await tx
        .select()
        .from(guilds)
        .where(and(eq(guilds.id, reqRow.guildId), isNull(guilds.disbandedAt)))
        .for("update");
      const guild = guildRows[0];
      if (!guild) return { error: "guild_not_found", status: 404 as const };
      if (guild.masterId !== userId) {
        // 관리 직책(부마스터/관리자)도 처리 가능 — 길드 관리탭 권한.
        const memRows = await tx
          .select({ role: guildMembers.role })
          .from(guildMembers)
          .where(
            and(
              eq(guildMembers.guildId, guild.id),
              eq(guildMembers.userId, userId),
            ),
          )
          .limit(1);
        if (!isAdminRole(memRows[0]?.role)) {
          return { error: "not_master", status: 403 as const };
        }
      }

      const applicantMembership = await tx
        .select({ id: guildMembers.guildId })
        .from(guildMembers)
        .where(eq(guildMembers.userId, applicantId))
        .limit(1);
      if (applicantMembership.length > 0) {
        // 신청자가 그새 다른 길드에 들어갔으면 신청을 만료 처리하고 거부.
        await tx
          .update(guildJoinRequests)
          .set({ status: "expired" })
          .where(eq(guildJoinRequests.id, requestId));
        return { error: "applicant_in_guild", status: 409 as const };
      }

      const cooldown = await tx
        .select()
        .from(guildLeaveCooldown)
        .where(eq(guildLeaveCooldown.userId, applicantId))
        .limit(1);
      if (cooldown[0] && cooldown[0].cooldownUntil > new Date()) {
        return { error: "applicant_cooldown", status: 409 as const };
      }

      const memberCountRows = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(guildMembers)
        .where(eq(guildMembers.guildId, guild.id));
      if (
        Number(memberCountRows[0]?.count ?? 0) >=
        guildMemberCap(guild.nationName != null)
      ) {
        return { error: "guild_full", status: 409 as const };
      }

      await tx.insert(guildMembers).values({
        guildId: guild.id,
        userId: applicantId,
        role: "member",
      });
      await tx
        .update(guildJoinRequests)
        .set({ status: "accepted" })
        .where(eq(guildJoinRequests.id, requestId));
      await cancelPendingJoinRequestsInTx(tx, applicantId);
      await logGuildActivity(tx, {
        guildId: guild.id,
        type: "member_join",
        actorUserId: userId,
        targetUserId: applicantId,
      });

      const charRows = await tx
        .select()
        .from(savesKv)
        .where(
          and(eq(savesKv.userId, applicantId), eq(savesKv.key, SAVES_CHARACTER)),
        )
        .for("update");
      if (charRows.length > 0) {
        const character = charRows[0].value as Record<string, unknown>;
        await upsertSave(tx, applicantId, SAVES_CHARACTER, {
          ...character,
          affiliation: guild.name,
        });
      }

      return {
        ok: true as const,
        guildId: guild.id,
        userId: applicantId,
      };
    });

    if ("error" in result) {
      return Response.json(result, { status: result.status });
    }
    return Response.json(result);
  } catch (e) {
    console.error("[guilds.requests.accept.POST] ", e);
    return new Response("internal error", { status: 500 });
  }
}
