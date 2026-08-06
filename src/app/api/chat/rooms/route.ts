import {
  and,
  desc,
  eq,
  gt,
  inArray,
  notExists,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  chatRoomInvites,
  chatRoomMembers,
  chatRooms,
  messages,
  users,
} from "@/db/schema";
import {
  CHAT_ROOM_JOINED_MAX,
  CHAT_ROOM_OWNED_MAX,
  isChatRoomVisibility,
  normalizeChatRoomName,
} from "@/lib/chat-rooms";
import { ensureUser } from "@/lib/server/ensureUser";
import { readMuseunCosmeticAppearanceMap } from "@/lib/server/museunCosmetics";
import { parseChatEquipmentLink } from "@/lib/chat-item-link";
import { resolveActor } from "@/lib/server/resolveActor";

async function memberCountMap(roomIds: number[]) {
  const result = new Map<number, number>();
  if (roomIds.length === 0) return result;
  const rows = await db
    .select({
      roomId: chatRoomMembers.roomId,
      count: sql<number>`count(*)::int`,
    })
    .from(chatRoomMembers)
    .where(inArray(chatRoomMembers.roomId, roomIds))
    .groupBy(chatRoomMembers.roomId);
  for (const row of rows) result.set(row.roomId, Number(row.count));
  return result;
}

async function latestMessageMap(roomIds: number[], viewerId: string) {
  const result = new Map<number, Record<string, unknown>>();
  if (roomIds.length === 0) return result;

  const latestIds = await db
    .select({
      roomId: messages.roomId,
      id: sql<number>`max(${messages.id})::int`,
    })
    .from(messages)
    .where(
      and(
        eq(messages.channel, "room"),
        inArray(messages.roomId, roomIds),
      ),
    )
    .groupBy(messages.roomId);
  const ids = latestIds.map((row) => Number(row.id));
  if (ids.length === 0) return result;

  const rows = await db
    .select({
      id: messages.id,
      roomId: messages.roomId,
      userId: messages.userId,
      name: messages.name,
      className: messages.className,
      title: messages.title,
      content: messages.content,
      itemLink: messages.itemLink,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(inArray(messages.id, ids));
  const cosmeticByUser = await readMuseunCosmeticAppearanceMap(
    rows.map((row) => row.userId),
  );
  for (const row of rows) {
    if (row.roomId == null) continue;
    result.set(row.roomId, {
      id: row.id,
      channel: "room",
      roomId: row.roomId,
      name: row.name,
      className: row.className,
      title: row.title,
      content: row.content,
      itemLink: parseChatEquipmentLink(row.itemLink),
      createdAt: row.createdAt.getTime(),
      mine: row.userId === viewerId,
      cosmetics: cosmeticByUser.get(row.userId) ?? null,
    });
  }
  return result;
}

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });
  const scope = new URL(req.url).searchParams.get("scope");

  if (scope === "public") {
    const rows = await db
      .select({
        id: chatRooms.id,
        name: chatRooms.name,
        visibility: chatRooms.visibility,
        ownerId: chatRooms.ownerId,
        ownerName: users.gameName,
        createdAt: chatRooms.createdAt,
        updatedAt: chatRooms.updatedAt,
      })
      .from(chatRooms)
      .leftJoin(users, eq(users.id, chatRooms.ownerId))
      .where(
        and(
          eq(chatRooms.visibility, "public"),
          notExists(
            db
              .select({ one: sql`1` })
              .from(chatRoomMembers)
              .where(
                and(
                  eq(chatRoomMembers.roomId, chatRooms.id),
                  eq(chatRoomMembers.userId, userId),
                ),
              ),
          ),
        ),
      )
      .orderBy(desc(chatRooms.updatedAt))
      .limit(50);
    const roomIds = rows.map((row) => row.id);
    const counts = await memberCountMap(roomIds);
    return Response.json({
      rooms: rows.map((row) => ({
        ...row,
        ownerName: row.ownerName ?? "모험가",
        createdAt: row.createdAt.getTime(),
        updatedAt: row.updatedAt.getTime(),
        memberCount: counts.get(row.id) ?? 0,
        // 공개방 둘러보기는 방 정보만 노출하고 대화 내용은 참여 후에만 제공한다.
        latestMessage: null,
      })),
    });
  }

  const [rows, inviteRows] = await Promise.all([
    db
      .select({
        id: chatRooms.id,
        name: chatRooms.name,
        visibility: chatRooms.visibility,
        ownerId: chatRooms.ownerId,
        ownerName: users.gameName,
        role: chatRoomMembers.role,
        createdAt: chatRooms.createdAt,
        updatedAt: chatRooms.updatedAt,
      })
      .from(chatRoomMembers)
      .innerJoin(chatRooms, eq(chatRooms.id, chatRoomMembers.roomId))
      .leftJoin(users, eq(users.id, chatRooms.ownerId))
      .where(eq(chatRoomMembers.userId, userId))
      .orderBy(desc(chatRooms.updatedAt)),
    db
      .select({
        id: chatRoomInvites.id,
        roomId: chatRooms.id,
        roomName: chatRooms.name,
        inviterName: users.gameName,
        expiresAt: chatRoomInvites.expiresAt,
      })
      .from(chatRoomInvites)
      .innerJoin(chatRooms, eq(chatRooms.id, chatRoomInvites.roomId))
      .leftJoin(users, eq(users.id, chatRoomInvites.fromUserId))
      .where(
        and(
          eq(chatRoomInvites.toUserId, userId),
          eq(chatRoomInvites.status, "pending"),
          gt(chatRoomInvites.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(chatRoomInvites.createdAt)),
  ]);
  const roomIds = rows.map((row) => row.id);
  const [counts, latest] = await Promise.all([
    memberCountMap(roomIds),
    latestMessageMap(roomIds, userId),
  ]);

  return Response.json({
    rooms: rows.map((row) => ({
      ...row,
      ownerName: row.ownerName ?? "모험가",
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
      memberCount: counts.get(row.id) ?? 0,
      latestMessage: latest.get(row.id) ?? null,
    })),
    invites: inviteRows.map((row) => ({
      ...row,
      inviterName: row.inviterName ?? "모험가",
      expiresAt: row.expiresAt.getTime(),
    })),
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  let body: { name?: unknown; visibility?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const name = normalizeChatRoomName(body.name);
  if (!name) return new Response("invalid room name", { status: 400 });
  const visibility = body.visibility ?? "private";
  if (!isChatRoomVisibility(visibility)) {
    return new Response("invalid visibility", { status: 400 });
  }

  const actor = await resolveActor(userId);
  const result = await db.transaction(async (tx) => {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    const [counts] = await tx
      .select({
        owned: sql<number>`count(*) filter (where ${chatRooms.ownerId} = ${userId})::int`,
        joined: sql<number>`count(*)::int`,
      })
      .from(chatRoomMembers)
      .innerJoin(chatRooms, eq(chatRooms.id, chatRoomMembers.roomId))
      .where(eq(chatRoomMembers.userId, userId));
    if (Number(counts?.owned ?? 0) >= CHAT_ROOM_OWNED_MAX) {
      return { error: "owned room limit", status: 409 as const };
    }
    if (Number(counts?.joined ?? 0) >= CHAT_ROOM_JOINED_MAX) {
      return { error: "joined room limit", status: 409 as const };
    }

    const [room] = await tx
      .insert(chatRooms)
      .values({ ownerId: userId, name, visibility })
      .returning();
    await tx.insert(chatRoomMembers).values({
      roomId: room.id,
      userId,
      role: "owner",
    });
    return { room };
  });
  if ("error" in result) {
    return new Response(result.error, { status: result.status });
  }
  return Response.json({
    room: {
      ...result.room,
      ownerName: actor.name,
      role: "owner",
      memberCount: 1,
      latestMessage: null,
      createdAt: result.room.createdAt.getTime(),
      updatedAt: result.room.updatedAt.getTime(),
    },
  });
}
