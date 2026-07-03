import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { guildJoinRequests, guildMembers, guilds } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { notifyGuildJoinDeclined } from "@/lib/server/guildNotifications";
import { isAdminRole } from "@/lib/server/guildAdmin";

// POST /api/guilds/requests/[requestId]/decline — 마스터/관리자가 가입 신청 거절.
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
      const rows = await tx
        .select()
        .from(guildJoinRequests)
        .where(eq(guildJoinRequests.id, requestId))
        .for("update");
      const reqRow = rows[0];
      if (!reqRow) return { error: "request_not_found", status: 404 as const };
      if (reqRow.status !== "pending") {
        return { error: "request_not_pending", status: 409 as const };
      }

      const guildRows = await tx
        .select({ masterId: guilds.masterId, name: guilds.name })
        .from(guilds)
        .where(and(eq(guilds.id, reqRow.guildId), isNull(guilds.disbandedAt)))
        .limit(1);
      const guild = guildRows[0];
      if (!guild) return { error: "guild_not_found", status: 404 as const };
      if (guild.masterId !== userId) {
        // 관리 직책(부마스터/관리자)도 처리 가능 — 길드 관리탭 권한.
        const memRows = await tx
          .select({ role: guildMembers.role })
          .from(guildMembers)
          .where(
            and(
              eq(guildMembers.guildId, reqRow.guildId),
              eq(guildMembers.userId, userId),
            ),
          )
          .limit(1);
        if (!isAdminRole(memRows[0]?.role)) {
          return { error: "not_master", status: 403 as const };
        }
      }

      await tx
        .update(guildJoinRequests)
        .set({ status: "declined" })
        .where(eq(guildJoinRequests.id, requestId));
      return {
        ok: true as const,
        guildId: reqRow.guildId,
        guildName: guild.name,
        userId: reqRow.userId,
      };
    });

    if ("error" in result) {
      return Response.json(result, { status: result.status });
    }
    await notifyGuildJoinDeclined({
      userId: result.userId,
      guildId: result.guildId,
      guildName: result.guildName,
    });
    return Response.json(result);
  } catch (e) {
    console.error("[guilds.requests.decline.POST] ", e);
    return new Response("internal error", { status: 500 });
  }
}
