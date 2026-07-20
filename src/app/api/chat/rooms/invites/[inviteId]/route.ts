import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  chatRoomInvites,
  chatRoomMembers,
  chatRooms,
  users,
} from "@/db/schema";
import {
  CHAT_ROOM_JOINED_MAX,
  CHAT_ROOM_MEMBER_MAX,
} from "@/lib/chat-rooms";
import { ensureUser } from "@/lib/server/ensureUser";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ inviteId: string }> },
) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });
  const { inviteId: rawInviteId } = await params;
  const inviteId = Number(rawInviteId);
  if (!Number.isInteger(inviteId) || inviteId <= 0) {
    return new Response("invalid invite id", { status: 400 });
  }
  let body: { action?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  if (body.action !== "accept" && body.action !== "decline") {
    return new Response("invalid action", { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    const [invite] = await tx
      .select()
      .from(chatRoomInvites)
      .where(eq(chatRoomInvites.id, inviteId))
      .for("update");
    if (!invite) return { error: "invite not found", status: 404 as const };
    if (invite.toUserId !== userId) {
      return { error: "not recipient", status: 403 as const };
    }
    if (invite.status !== "pending") {
      return { error: "invite not pending", status: 409 as const };
    }
    if (invite.expiresAt <= new Date()) {
      await tx
        .update(chatRoomInvites)
        .set({ status: "expired" })
        .where(eq(chatRoomInvites.id, inviteId));
      return { error: "invite expired", status: 409 as const };
    }
    if (body.action === "decline") {
      await tx
        .update(chatRoomInvites)
        .set({ status: "declined" })
        .where(eq(chatRoomInvites.id, inviteId));
      return { ok: true as const };
    }

    const [room] = await tx
      .select({ id: chatRooms.id })
      .from(chatRooms)
      .where(eq(chatRooms.id, invite.roomId))
      .for("update");
    if (!room) return { error: "room not found", status: 404 as const };
    const [existing] = await tx
      .select({ roomId: chatRoomMembers.roomId })
      .from(chatRoomMembers)
      .where(
        and(
          eq(chatRoomMembers.roomId, invite.roomId),
          eq(chatRoomMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!existing) {
      const [counts] = await tx
        .select({
          memberCount: sql<number>`count(*) filter (where ${chatRoomMembers.roomId} = ${invite.roomId})::int`,
          joinedCount: sql<number>`count(*) filter (where ${chatRoomMembers.userId} = ${userId})::int`,
        })
        .from(chatRoomMembers)
        .where(
          sql`${chatRoomMembers.roomId} = ${invite.roomId} OR ${chatRoomMembers.userId} = ${userId}`,
        );
      if (Number(counts?.memberCount ?? 0) >= CHAT_ROOM_MEMBER_MAX) {
        return { error: "room full", status: 409 as const };
      }
      if (Number(counts?.joinedCount ?? 0) >= CHAT_ROOM_JOINED_MAX) {
        return { error: "joined room limit", status: 409 as const };
      }
      await tx.insert(chatRoomMembers).values({
        roomId: invite.roomId,
        userId,
      });
    }
    await tx
      .update(chatRoomInvites)
      .set({ status: "accepted" })
      .where(eq(chatRoomInvites.id, inviteId));
    return { ok: true as const, roomId: invite.roomId };
  });
  if ("error" in result) {
    return new Response(result.error, { status: result.status });
  }
  return Response.json(result);
}
