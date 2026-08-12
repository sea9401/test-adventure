import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { guildInvites, marketplaceInbox } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";

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

      await tx
        .update(guildInvites)
        .set({ status: "declined" })
        .where(eq(guildInvites.id, inviteId));

      const completedAt = new Date();
      await tx
        .update(marketplaceInbox)
        .set({ claimedAt: completedAt, readAt: completedAt })
        .where(
          and(
            eq(marketplaceInbox.userId, userId),
            eq(marketplaceInbox.kind, "guild_invite"),
            sql`${marketplaceInbox.payload}->>'invite_id' = ${String(inviteId)}`,
            isNull(marketplaceInbox.claimedAt),
          ),
        );

      return { ok: true as const };
    });

    if ("error" in result) {
      return Response.json(result, { status: result.status });
    }
    return Response.json(result);
  } catch (e) {
    console.error("[guilds.invites.decline.POST] ", e);
    return new Response("internal error", { status: 500 });
  }
}
