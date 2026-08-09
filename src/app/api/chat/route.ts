import { and, asc, desc, eq, gt, isNull, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { chatRoomMembers, chatRooms, messages, savesKv } from "@/db/schema";
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
import {
  CHAT_INAPPROPRIATE_CONTENT_ERROR,
  moderateChatContent,
} from "@/lib/chat-moderation";
import {
  clientIpFromRequest,
  recordAbuseEventSoon,
} from "@/lib/server/abuseLog";
import {
  chatEquipmentLinkForOwnedIid,
  parseChatEquipmentLink,
} from "@/lib/chat-item-link";
import {
  readBlockedUserIds,
  requireCurrentUgcConsent,
} from "@/lib/server/ugcSafety";

type ChatChannel = "global" | "trade" | "guild" | "room";

type ChatRow = {
  id: number;
  channel: string;
  roomId: number | null;
  name: string;
  className: string;
  title: string | null;
  content: string;
  itemLink: unknown;
  createdAt: Date;
  mine: string;
};

function parseChannel(value: string | null): ChatChannel {
  if (value === "trade" || value === "guild" || value === "room") return value;
  return "global";
}

function parseAfterId(searchParams: URLSearchParams, key: string): number | null | undefined {
  const raw = searchParams.get(key);
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

function channelWhere(
  channel: Exclude<ChatChannel, "room">,
  guildId: number | null,
  blockedUserIds: string[],
) {
  const baseWhere =
    channel === "guild"
      ? and(eq(messages.channel, "guild"), eq(messages.guildId, guildId ?? -1))
      : channel === "trade"
        ? and(
            eq(messages.channel, "trade"),
            isNull(messages.guildId),
            isNull(messages.roomId),
          )
        : and(
            eq(messages.channel, "global"),
            isNull(messages.guildId),
            isNull(messages.roomId),
          );
  return blockedUserIds.length > 0
    ? and(baseWhere, notInArray(messages.userId, blockedUserIds))
    : baseWhere;
}

async function readChannelRows(input: {
  channel: Exclude<ChatChannel, "room">;
  afterId: number | null;
  guildId: number | null;
  blockedUserIds: string[];
}): Promise<ChatRow[]> {
  const visibleWhere = channelWhere(
    input.channel,
    input.guildId,
    input.blockedUserIds,
  );
  return db
    .select({
      id: messages.id,
      channel: messages.channel,
      roomId: messages.roomId,
      name: messages.name,
      className: messages.className,
      title: messages.title,
      content: messages.content,
      itemLink: messages.itemLink,
      createdAt: messages.createdAt,
      mine: messages.userId,
    })
    .from(messages)
    .where(
      input.afterId == null
        ? visibleWhere
        : and(visibleWhere, gt(messages.id, input.afterId)),
    )
    .orderBy(
      ...(input.afterId == null
        ? [desc(messages.createdAt), desc(messages.id)]
        : [asc(messages.createdAt), asc(messages.id)]),
    )
    .limit(CHAT_FETCH_LIMIT);
}

function serializeRows(
  rows: ChatRow[],
  userId: string,
  cosmeticByUser: Awaited<ReturnType<typeof readMuseunCosmeticAppearanceMap>>,
) {
  const result = rows.map((row) => ({
    id: row.id,
    channel:
      row.channel === "trade"
        ? "trade"
        : row.channel === "guild"
          ? "guild"
          : row.channel === "room"
            ? "room"
            : "global",
    roomId: row.roomId,
    name: row.name,
    className: row.className,
    title: row.title,
    content: row.content,
    itemLink: parseChatEquipmentLink(row.itemLink),
    createdAt: row.createdAt.getTime(),
    mine: row.mine === userId,
    cosmetics: cosmeticByUser.get(row.mine) ?? null,
  }));
  return result;
}

async function readMainChannels(searchParams: URLSearchParams, userId: string) {
  const globalAfterId = parseAfterId(searchParams, "globalAfterId");
  const tradeAfterId = parseAfterId(searchParams, "tradeAfterId");
  const guildAfterId = parseAfterId(searchParams, "guildAfterId");
  if (
    globalAfterId === undefined ||
    tradeAfterId === undefined ||
    guildAfterId === undefined
  ) {
    return new Response("invalid after id", { status: 400 });
  }

  const includeGuild = searchParams.get("includeGuild") === "1";
  const viewerGuild = includeGuild ? await getViewerGuild(db, userId) : null;
  const blockedUserIds = await readBlockedUserIds(userId);
  const [globalRows, tradeRows, guildRows] = await Promise.all([
    readChannelRows({
      channel: "global",
      afterId: globalAfterId,
      guildId: null,
      blockedUserIds,
    }),
    readChannelRows({
      channel: "trade",
      afterId: tradeAfterId,
      guildId: null,
      blockedUserIds,
    }),
    includeGuild && viewerGuild
      ? readChannelRows({
          channel: "guild",
          afterId: guildAfterId,
          guildId: viewerGuild.guildId,
          blockedUserIds,
        })
      : [],
  ]);
  if (globalAfterId == null) globalRows.reverse();
  if (tradeAfterId == null) tradeRows.reverse();
  if (guildAfterId == null) guildRows.reverse();

  const allRows = [...globalRows, ...tradeRows, ...guildRows];
  const cosmeticByUser = await readMuseunCosmeticAppearanceMap(
    allRows.map((message) => message.mine),
  );
  return Response.json({
    global: serializeRows(globalRows, userId, cosmeticByUser),
    trade: serializeRows(tradeRows, userId, cosmeticByUser),
    guild: serializeRows(guildRows, userId, cosmeticByUser),
  });
}

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });
  const searchParams = new URL(req.url).searchParams;
  if (searchParams.get("channels") === "main") {
    return readMainChannels(searchParams, userId);
  }
  const channel = parseChannel(searchParams.get("channel"));
  const afterIdRaw = searchParams.get("afterId");
  const afterId = afterIdRaw == null ? null : Number(afterIdRaw);
  if (
    afterIdRaw != null &&
    (!Number.isInteger(afterId) || Number(afterId) < 0)
  ) {
    return new Response("invalid after id", { status: 400 });
  }
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

  const channelWhere =
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
        : channel === "trade"
          ? and(
              eq(messages.channel, "trade"),
              isNull(messages.guildId),
              isNull(messages.roomId),
            )
        : and(
            eq(messages.channel, "global"),
            isNull(messages.guildId),
            isNull(messages.roomId),
          );
  const blockedUserIds = await readBlockedUserIds(userId);
  const visibleChannelWhere =
    blockedUserIds.length > 0
      ? and(channelWhere, notInArray(messages.userId, blockedUserIds))
      : channelWhere;
  const rows = await db
    .select({
      id: messages.id,
      channel: messages.channel,
      roomId: messages.roomId,
      name: messages.name,
      className: messages.className,
      title: messages.title,
      content: messages.content,
      itemLink: messages.itemLink,
      createdAt: messages.createdAt,
      mine: messages.userId,
    })
    .from(messages)
    .where(
      afterId == null
        ? visibleChannelWhere
        : and(visibleChannelWhere, gt(messages.id, afterId)),
    )
    // 최초 조회는 최신 50개를 가져온 뒤 시간순으로 뒤집는다. 증분 조회는
    // afterId 이후를 오래된 순서로 보내 누락 없이 기존 목록 뒤에 합칠 수 있게 한다.
    .orderBy(
      ...(afterId == null
        ? [desc(messages.createdAt), desc(messages.id)]
        : [asc(messages.createdAt), asc(messages.id)]),
    )
    .limit(CHAT_FETCH_LIMIT);

  const result = rows
    .map((r) => ({
      id: r.id,
      channel:
        r.channel === "trade"
          ? "trade"
          : r.channel === "guild"
            ? "guild"
            : r.channel === "room"
              ? "room"
              : "global",
      roomId: r.roomId,
      name: r.name,
      className: r.className,
      title: r.title,
      content: r.content,
      itemLink: parseChatEquipmentLink(r.itemLink),
      createdAt: r.createdAt.getTime(),
      mine: r.mine === userId,
      authorUserId: r.mine,
    }));
  if (afterId == null) result.reverse();

  const cosmeticByUser = await readMuseunCosmeticAppearanceMap(
    result.map((message) => message.authorUserId),
  );

  return Response.json(
    result.map((message) => ({
      ...message,
      cosmetics: cosmeticByUser.get(message.authorUserId) ?? null,
    })),
  );
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  // identity(name/className/title)는 클라 body 무시 — 서버에서 권위로 해석.
  // (이전엔 body 그대로 저장돼 누구나 "관리자" 등으로 사칭 가능했다.)
  let body: {
    content?: unknown;
    channel?: unknown;
    roomId?: unknown;
    itemIid?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const channel: ChatChannel =
    body.channel === "trade"
      ? "trade"
      : body.channel === "guild"
        ? "guild"
        : body.channel === "room"
          ? "room"
          : "global";
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
  const itemIid =
    typeof body.itemIid === "string" &&
    body.itemIid.length > 0 &&
    body.itemIid.length <= 200
      ? body.itemIid
      : null;
  if (body.itemIid != null && itemIid == null) {
    return new Response("invalid item link", { status: 400 });
  }
  if (!content && !itemIid) {
    return new Response("empty content", { status: 400 });
  }
  if (content.length > CHAT_MAX_LENGTH) {
    return new Response(`too long (max ${CHAT_MAX_LENGTH})`, { status: 400 });
  }
  const moderation = moderateChatContent(content);
  if (!moderation.allowed) {
    recordAbuseEventSoon({
      userId,
      ip: clientIpFromRequest(req),
      action: "chat.message",
      reason: "inappropriate_content",
      // 원문은 운영 로그에 남기지 않는다.
      detail: { channel, rule: moderation.rule },
    });
    return new Response(CHAT_INAPPROPRIATE_CONTENT_ERROR, { status: 400 });
  }

  const consentFailure = await requireCurrentUgcConsent(userId);
  if (consentFailure) return consentFailure;

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
    let itemLink = null;
    if (itemIid) {
      const [equipmentRow] = await tx
        .select({ value: savesKv.value })
        .from(savesKv)
        .where(
          and(
            eq(savesKv.userId, userId),
            eq(savesKv.key, "equipment.v2"),
          ),
        )
        .for("update");
      itemLink = chatEquipmentLinkForOwnedIid(equipmentRow?.value, itemIid);
      if (!itemLink) return { error: "item not owned" as const };
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
        itemLink,
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
    return { row, itemLink };
  });
  if ("error" in result) {
    return new Response(result.error, { status: 403 });
  }
  const inserted = result.row;

  return Response.json({
    id: inserted.id,
    authorUserId: userId,
    channel,
    roomId,
    name,
    className,
    title,
    cosmetics,
    content,
    itemLink: result.itemLink,
    createdAt: inserted.createdAt.getTime(),
    mine: true,
  });
}
