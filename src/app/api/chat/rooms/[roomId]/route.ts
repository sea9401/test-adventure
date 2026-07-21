import { and, asc, eq, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  chatRoomInvites,
  chatRoomMembers,
  chatRooms,
  users,
} from "@/db/schema";
import {
  CHAT_ROOM_INVITE_DAYS,
  CHAT_ROOM_JOINED_MAX,
  CHAT_ROOM_MEMBER_MAX,
} from "@/lib/chat-rooms";
import { ensureUser } from "@/lib/server/ensureUser";

type ActionBody = { action?: unknown; targetName?: unknown };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });
  const { roomId: rawRoomId } = await params;
  const roomId = Number(rawRoomId);
  if (!Number.isInteger(roomId) || roomId <= 0) {
    return new Response("invalid room id", { status: 400 });
  }

  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  if (body.action === "join") {
    const result = await db.transaction(async (tx) => {
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      const [room] = await tx
        .select()
        .from(chatRooms)
        .where(eq(chatRooms.id, roomId))
        .for("update");
      if (!room) return { error: "room not found", status: 404 as const };
      if (room.visibility !== "public") {
        return { error: "invite required", status: 403 as const };
      }
      const [existing] = await tx
        .select({ roomId: chatRoomMembers.roomId })
        .from(chatRoomMembers)
        .where(
          and(
            eq(chatRoomMembers.roomId, roomId),
            eq(chatRoomMembers.userId, userId),
          ),
        )
        .limit(1);
      if (existing) return { ok: true as const };

      const [counts] = await tx
        .select({
          memberCount: sql<number>`count(*) filter (where ${chatRoomMembers.roomId} = ${roomId})::int`,
          joinedCount: sql<number>`count(*) filter (where ${chatRoomMembers.userId} = ${userId})::int`,
        })
        .from(chatRoomMembers)
        .where(
          sql`${chatRoomMembers.roomId} = ${roomId} OR ${chatRoomMembers.userId} = ${userId}`,
        );
      if (Number(counts?.memberCount ?? 0) >= CHAT_ROOM_MEMBER_MAX) {
        return { error: "room full", status: 409 as const };
      }
      if (Number(counts?.joinedCount ?? 0) >= CHAT_ROOM_JOINED_MAX) {
        return { error: "joined room limit", status: 409 as const };
      }
      await tx.insert(chatRoomMembers).values({ roomId, userId });
      return { ok: true as const };
    });
    if ("error" in result) {
      return new Response(result.error, { status: result.status });
    }
    return Response.json(result);
  }

  if (body.action === "leave") {
    const result = await db.transaction(async (tx) => {
      // 방을 먼저 잠가 입장과 방장 나가기가 동시에 처리되지 않게 한다.
      const [room] = await tx
        .select({ ownerId: chatRooms.ownerId })
        .from(chatRooms)
        .where(eq(chatRooms.id, roomId))
        .for("update");
      if (!room) return { ok: true as const };

      const [membership] = await tx
        .select({ userId: chatRoomMembers.userId })
        .from(chatRoomMembers)
        .where(
          and(
            eq(chatRoomMembers.roomId, roomId),
            eq(chatRoomMembers.userId, userId),
          ),
        )
        .for("update");
      if (!membership) return { ok: true as const };

      if (room.ownerId === userId) {
        const [successor] = await tx
          .select({ userId: chatRoomMembers.userId })
          .from(chatRoomMembers)
          .where(
            and(
              eq(chatRoomMembers.roomId, roomId),
              ne(chatRoomMembers.userId, userId),
            ),
          )
          .orderBy(
            asc(chatRoomMembers.joinedAt),
            asc(chatRoomMembers.userId),
          )
          .limit(1)
          .for("update");

        if (!successor) {
          // 마지막 참여자인 방장이 나가면 연관 데이터는 FK cascade 로 정리된다.
          await tx.delete(chatRooms).where(eq(chatRooms.id, roomId));
          return { ok: true as const };
        }

        await tx
          .update(chatRooms)
          .set({ ownerId: successor.userId, updatedAt: new Date() })
          .where(eq(chatRooms.id, roomId));
        await tx
          .update(chatRoomMembers)
          .set({ role: "owner" })
          .where(
            and(
              eq(chatRoomMembers.roomId, roomId),
              eq(chatRoomMembers.userId, successor.userId),
            ),
          );
      }

      await tx
        .delete(chatRoomMembers)
        .where(
          and(
            eq(chatRoomMembers.roomId, roomId),
            eq(chatRoomMembers.userId, userId),
          ),
        );
      return { ok: true as const };
    });
    return Response.json(result);
  }

  if (body.action === "invite") {
    const targetName =
      typeof body.targetName === "string" ? body.targetName.trim() : "";
    if (!targetName || targetName.length > 24) {
      return new Response("invalid target name", { status: 400 });
    }
    const result = await db.transaction(async (tx) => {
      const [room] = await tx
        .select({ ownerId: chatRooms.ownerId })
        .from(chatRooms)
        .where(eq(chatRooms.id, roomId))
        .for("update");
      if (!room) return { error: "room not found", status: 404 as const };
      if (room.ownerId !== userId) {
        return { error: "owner only", status: 403 as const };
      }
      const [target] = await tx
        .select({ id: users.id, name: users.gameName })
        .from(users)
        .where(sql`lower(${users.gameName}) = lower(${targetName})`)
        .limit(1);
      if (!target) return { error: "player not found", status: 404 as const };
      if (target.id === userId) {
        return { error: "cannot invite self", status: 400 as const };
      }
      const [existingMember] = await tx
        .select({ userId: chatRoomMembers.userId })
        .from(chatRoomMembers)
        .where(
          and(
            eq(chatRoomMembers.roomId, roomId),
            eq(chatRoomMembers.userId, target.id),
          ),
        )
        .limit(1);
      if (existingMember) {
        return { error: "already member", status: 409 as const };
      }
      const [memberCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(chatRoomMembers)
        .where(eq(chatRoomMembers.roomId, roomId));
      if (Number(memberCount?.count ?? 0) >= CHAT_ROOM_MEMBER_MAX) {
        return { error: "room full", status: 409 as const };
      }
      await tx
        .update(chatRoomInvites)
        .set({ status: "expired" })
        .where(
          and(
            eq(chatRoomInvites.roomId, roomId),
            eq(chatRoomInvites.toUserId, target.id),
            eq(chatRoomInvites.status, "pending"),
            lte(chatRoomInvites.expiresAt, new Date()),
          ),
        );
      const [existingInvite] = await tx
        .select({ id: chatRoomInvites.id })
        .from(chatRoomInvites)
        .where(
          and(
            eq(chatRoomInvites.roomId, roomId),
            eq(chatRoomInvites.toUserId, target.id),
            eq(chatRoomInvites.status, "pending"),
          ),
        )
        .limit(1);
      if (existingInvite) {
        return { error: "already invited", status: 409 as const };
      }
      const expiresAt = new Date(
        Date.now() + CHAT_ROOM_INVITE_DAYS * 24 * 60 * 60 * 1000,
      );
      const [invite] = await tx
        .insert(chatRoomInvites)
        .values({
          roomId,
          fromUserId: userId,
          toUserId: target.id,
          expiresAt,
        })
        .returning({ id: chatRoomInvites.id });
      return {
        ok: true as const,
        inviteId: invite.id,
        targetName: target.name ?? targetName,
      };
    });
    if ("error" in result) {
      return new Response(result.error, { status: result.status });
    }
    return Response.json(result);
  }

  return new Response("invalid action", { status: 400 });
}
