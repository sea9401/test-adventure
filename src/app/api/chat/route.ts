import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { chatRoomMembers, chatRooms, messages } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { recordUserChatMessageInTx } from "@/lib/server/chatProgress";
import { resolveActor } from "@/lib/server/resolveActor";
import { getViewerGuild } from "@/lib/server/bulletinAccess";
import {
  CHAT_FETCH_LIMIT,
  CHAT_MAX_LENGTH,
  CHAT_RATE_LIMIT_MS,
} from "@/lib/chat-config";
import { readMuseunCosmeticAppearanceMap } from "@/lib/server/museunCosmetics";

type ChatChannel = "global" | "guild" | "room";

function parseChannel(value: string | null): ChatChannel {
  if (value === "guild" || value === "room") return value;
  return "global";
}

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });
  const searchParams = new URL(req.url).searchParams;
  const channel = parseChannel(searchParams.get("channel"));
  const roomId = channel === "room" ? Number(searchParams.get("roomId")) : null;
  if (channel === "room" && (!Number.isInteger(roomId) || Number(roomId) <= 0)) {
    return new Response("invalid room id", { status: 400 });
  }
  const viewerGuild =
    channel === "guild" ? await getViewerGuild(db, userId) : null;
  if (channel === "guild" && viewerGuild == null) {
    return new Response("not in guild", { status: 403 });
  }
  if (channel === "room") {
    const [membership] = await db
      .select({ roomId: chatRoomMembers.roomId })
      .from(chatRoomMembers)
      .where(
        and(
          eq(chatRoomMembers.roomId, Number(roomId)),
          eq(chatRoomMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!membership) return new Response("not in room", { status: 403 });
  }

  const rows = await db
    .select({
      id: messages.id,
      channel: messages.channel,
      roomId: messages.roomId,
      name: messages.name,
      className: messages.className,
      title: messages.title,
      content: messages.content,
      createdAt: messages.createdAt,
      mine: messages.userId,
    })
    .from(messages)
    .where(
      channel === "room"
        ? and(
            eq(messages.channel, "room"),
            eq(messages.roomId, Number(roomId)),
          )
        : channel === "guild"
        ? and(
            eq(messages.channel, "guild"),
            eq(messages.guildId, viewerGuild?.guildId ?? -1),
          )
        : and(
            eq(messages.channel, "global"),
            isNull(messages.guildId),
            isNull(messages.roomId),
          ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(CHAT_FETCH_LIMIT);

  const result = rows
    .map((r) => ({
      id: r.id,
      channel:
        r.channel === "guild" ? "guild" : r.channel === "room" ? "room" : "global",
      roomId: r.roomId,
      name: r.name,
      className: r.className,
      title: r.title,
      content: r.content,
      createdAt: r.createdAt.getTime(),
      mine: r.mine === userId,
      userId: r.mine,
    }))
    .reverse();

  const cosmeticByUser = await readMuseunCosmeticAppearanceMap(
    result.map((message) => message.userId),
  );

  return Response.json(
    result.map(({ userId: messageUserId, ...message }) => ({
      ...message,
      cosmetics: cosmeticByUser.get(messageUserId) ?? null,
    })),
  );
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  // identity(name/className/title)는 클라 body 무시 — 서버에서 권위로 해석.
  // (이전엔 body 그대로 저장돼 누구나 "관리자" 등으로 사칭 가능했다.)
  let body: { content?: unknown; channel?: unknown; roomId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const channel: ChatChannel =
    body.channel === "guild" ? "guild" : body.channel === "room" ? "room" : "global";
  const roomId = channel === "room" ? Number(body.roomId) : null;
  if (channel === "room" && (!Number.isInteger(roomId) || Number(roomId) <= 0)) {
    return new Response("invalid room id", { status: 400 });
  }
  const viewerGuild =
    channel === "guild" ? await getViewerGuild(db, userId) : null;
  if (channel === "guild" && viewerGuild == null) {
    return new Response("not in guild", { status: 403 });
  }

  const content =
    typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return new Response("empty content", { status: 400 });
  if (content.length > CHAT_MAX_LENGTH) {
    return new Response(`too long (max ${CHAT_MAX_LENGTH})`, { status: 400 });
  }

  const { name, className, title, cosmetics } = await resolveActor(userId);

  const since = new Date(Date.now() - CHAT_RATE_LIMIT_MS);
  const [lastRow] = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(eq(messages.userId, userId))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  if (lastRow && lastRow.createdAt > since) {
    return new Response("rate limited", { status: 429 });
  }

  const result = await db.transaction(async (tx) => {
    if (channel === "room") {
      const [membership] = await tx
        .select({ roomId: chatRoomMembers.roomId })
        .from(chatRoomMembers)
        .where(
          and(
            eq(chatRoomMembers.roomId, Number(roomId)),
            eq(chatRoomMembers.userId, userId),
          ),
        )
        .limit(1);
      if (!membership) return { error: "not in room" as const };
    }
    const [row] = await tx
      .insert(messages)
      .values({
        userId,
        channel,
        guildId: channel === "guild" ? (viewerGuild?.guildId ?? null) : null,
        roomId: channel === "room" ? Number(roomId) : null,
        name,
        className,
        title,
        content,
      })
      .returning({
        id: messages.id,
        createdAt: messages.createdAt,
      });
    if (channel === "global") {
      await recordUserChatMessageInTx(tx, userId, row.createdAt.getTime());
    }
    if (channel === "room") {
      await tx
        .update(chatRooms)
        .set({ updatedAt: row.createdAt })
        .where(eq(chatRooms.id, Number(roomId)));
    }
    return { row };
  });
  if ("error" in result) {
    return new Response(result.error, { status: 403 });
  }
  const inserted = result.row;

  return Response.json({
    id: inserted.id,
    channel,
    roomId,
    name,
    className,
    title,
    cosmetics,
    content,
    createdAt: inserted.createdAt.getTime(),
    mine: true,
  });
}
