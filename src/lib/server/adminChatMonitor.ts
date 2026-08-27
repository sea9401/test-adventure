import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import {
  chatRoomMembers,
  chatRooms,
  guilds,
  messages,
  users,
} from "@/db/schema";
import type {
  AdminChatMessage,
  AdminChatMessagesQuery,
  AdminChatMessagesResponse,
  AdminChatParticipant,
  AdminChatRoomsQuery,
  AdminChatRoomsResponse,
  AdminChatTarget,
  GuildAdminChatTarget,
  RoomAdminChatTarget,
} from "@/lib/admin-chat-monitor";
import { parseChatEquipmentLink } from "@/lib/chat-item-link";

const toIso = (value: Date | null | undefined) =>
  value ? value.toISOString() : null;

function targetSearchText(target: AdminChatTarget): string {
  const id = "scopeId" in target ? String(target.scopeId) : "";
  return `${target.label} ${id}`.toLocaleLowerCase("ko-KR");
}

export function paginateAdminChatTargets(
  targets: readonly AdminChatTarget[],
  query: AdminChatRoomsQuery,
): AdminChatRoomsResponse {
  const normalizedQuery = query.q.toLocaleLowerCase("ko-KR");
  const fixedOrder = { global: 0, trade: 1 } as const;
  const filtered = targets
    .filter((target) => query.kind === "all" || target.kind === query.kind)
    .filter(
      (target) =>
        query.visibility === "all" ||
        target.kind !== "room" ||
        target.visibility === query.visibility,
    )
    .filter(
      (target) =>
        !normalizedQuery || targetSearchText(target).includes(normalizedQuery),
    )
    .sort((a, b) => {
      const aFixed = a.kind === "global" || a.kind === "trade";
      const bFixed = b.kind === "global" || b.kind === "trade";
      if (aFixed && bFixed) return fixedOrder[a.kind] - fixedOrder[b.kind];
      if (aFixed) return -1;
      if (bFixed) return 1;
      const byActivity =
        (b.latestMessageAt ? Date.parse(b.latestMessageAt) : 0) -
        (a.latestMessageAt ? Date.parse(a.latestMessageAt) : 0);
      return byActivity || a.targetKey.localeCompare(b.targetKey);
    });
  return {
    targets: filtered.slice(query.offset, query.offset + query.limit),
    total: filtered.length,
    hasMore: query.offset + query.limit < filtered.length,
  };
}

export async function readAdminChatTargets(
  query: AdminChatRoomsQuery,
): Promise<AdminChatRoomsResponse> {
  const [fixedRows, guildRows, roomRows, countRows, roomLatestRows] =
    await Promise.all([
      db
        .select({
          channel: messages.channel,
          latestMessageAt: sql<Date | null>`max(${messages.createdAt})`,
        })
        .from(messages)
        .where(
          and(
            inArray(messages.channel, ["global", "trade"]),
            isNull(messages.guildId),
            isNull(messages.roomId),
          ),
        )
        .groupBy(messages.channel),
      db
        .select({
          id: guilds.id,
          name: guilds.name,
          createdAt: guilds.createdAt,
          latestMessageAt: sql<Date | null>`max(${messages.createdAt})`,
        })
        .from(guilds)
        .leftJoin(
          messages,
          and(
            eq(messages.channel, "guild"),
            eq(messages.guildId, guilds.id),
            isNull(messages.roomId),
          ),
        )
        .where(isNull(guilds.disbandedAt))
        .groupBy(guilds.id),
      db
        .select({
          id: chatRooms.id,
          name: chatRooms.name,
          visibility: chatRooms.visibility,
          ownerId: chatRooms.ownerId,
          ownerName: users.gameName,
          createdAt: chatRooms.createdAt,
        })
        .from(chatRooms)
        .leftJoin(users, eq(users.id, chatRooms.ownerId)),
      db
        .select({
          roomId: chatRoomMembers.roomId,
          count: sql<number>`count(*)::int`,
        })
        .from(chatRoomMembers)
        .groupBy(chatRoomMembers.roomId),
      db
        .select({
          roomId: messages.roomId,
          latestMessageAt: sql<Date | null>`max(${messages.createdAt})`,
        })
        .from(messages)
        .where(and(eq(messages.channel, "room"), gt(messages.roomId, 0)))
        .groupBy(messages.roomId),
    ]);

  const fixedLatest = new Map(
    fixedRows.map((row) => [row.channel, row.latestMessageAt]),
  );
  const counts = new Map(
    countRows.map((row) => [row.roomId, Number(row.count)]),
  );
  const roomLatest = new Map(
    roomLatestRows
      .filter((row) => row.roomId != null)
      .map((row) => [Number(row.roomId), row.latestMessageAt]),
  );
  const targets: AdminChatTarget[] = [
    {
      targetKey: "global",
      kind: "global",
      label: "전체 채팅",
      latestMessageAt: toIso(fixedLatest.get("global")),
    },
    {
      targetKey: "trade",
      kind: "trade",
      label: "거래 채팅",
      latestMessageAt: toIso(fixedLatest.get("trade")),
    },
    ...guildRows.map(
      (row): GuildAdminChatTarget => ({
        targetKey: `guild:${row.id}`,
        kind: "guild",
        scopeId: row.id,
        label: row.name,
        latestMessageAt: toIso(row.latestMessageAt ?? row.createdAt),
      }),
    ),
    ...roomRows.map(
      (row): RoomAdminChatTarget => ({
        targetKey: `room:${row.id}`,
        kind: "room",
        scopeId: row.id,
        label: row.name,
        visibility: row.visibility === "public" ? "public" : "private",
        ownerId: row.ownerId,
        ownerName: row.ownerName ?? "모험가",
        memberCount: counts.get(row.id) ?? 0,
        latestMessageAt: toIso(roomLatest.get(row.id) ?? row.createdAt),
      }),
    ),
  ];
  return paginateAdminChatTargets(targets, query);
}

export function adminChatMessageWhere(
  query: AdminChatMessagesQuery,
): SQL<unknown> {
  const scopeWhere =
    query.kind === "global"
      ? and(
          eq(messages.channel, "global"),
          isNull(messages.guildId),
          isNull(messages.roomId),
        )
      : query.kind === "trade"
        ? and(
            eq(messages.channel, "trade"),
            isNull(messages.guildId),
            isNull(messages.roomId),
          )
        : query.kind === "guild"
          ? and(
              eq(messages.channel, "guild"),
              eq(messages.guildId, query.scopeId as number),
              isNull(messages.roomId),
            )
          : and(
              eq(messages.channel, "room"),
              eq(messages.roomId, query.scopeId as number),
              isNull(messages.guildId),
            );
  return (
    query.beforeId == null
      ? scopeWhere
      : and(scopeWhere, lt(messages.id, query.beforeId))
  ) as SQL<unknown>;
}

export type AdminChatMessageSourceRow = {
  id: number;
  authorUserId: string;
  name: string;
  className: string;
  title: string | null;
  content: string;
  itemLink: unknown;
  createdAt: Date;
};

export function buildAdminChatMessagePage(
  rows: readonly AdminChatMessageSourceRow[],
  limit: number,
): {
  messages: AdminChatMessage[];
  hasMore: boolean;
  nextBeforeId: number | null;
  latestMessageAt: Date | null;
} {
  const visibleRows = rows.slice(0, limit);
  const serialized = visibleRows.map((row) => ({
    id: row.id,
    authorUserId: row.authorUserId,
    name: row.name,
    className: row.className,
    title: row.title,
    content: row.content,
    itemLink: parseChatEquipmentLink(row.itemLink),
    createdAt: row.createdAt.toISOString(),
  }));
  const hasMore = rows.length > limit;
  return {
    messages: serialized,
    hasMore,
    nextBeforeId:
      hasMore && serialized.length > 0
        ? serialized[serialized.length - 1].id
        : null,
    latestMessageAt: rows[0]?.createdAt ?? null,
  };
}

async function readRoomTarget(
  roomId: number,
  latestMessageAt: Date | null,
): Promise<RoomAdminChatTarget | null> {
  const [row] = await db
    .select({
      id: chatRooms.id,
      name: chatRooms.name,
      visibility: chatRooms.visibility,
      ownerId: chatRooms.ownerId,
      ownerName: users.gameName,
      createdAt: chatRooms.createdAt,
      memberCount: sql<number>`(
        select count(*)::int from ${chatRoomMembers}
        where ${chatRoomMembers.roomId} = ${chatRooms.id}
      )`,
    })
    .from(chatRooms)
    .leftJoin(users, eq(users.id, chatRooms.ownerId))
    .where(eq(chatRooms.id, roomId))
    .limit(1);
  if (!row) return null;
  return {
    targetKey: `room:${row.id}`,
    kind: "room",
    scopeId: row.id,
    label: row.name,
    visibility: row.visibility === "public" ? "public" : "private",
    ownerId: row.ownerId,
    ownerName: row.ownerName ?? "모험가",
    memberCount: Number(row.memberCount),
    latestMessageAt: toIso(latestMessageAt ?? row.createdAt),
  };
}

async function readGuildTarget(
  guildId: number,
  latestMessageAt: Date | null,
): Promise<GuildAdminChatTarget | null> {
  const [row] = await db
    .select({ id: guilds.id, name: guilds.name, createdAt: guilds.createdAt })
    .from(guilds)
    .where(and(eq(guilds.id, guildId), isNull(guilds.disbandedAt)))
    .limit(1);
  if (!row) return null;
  return {
    targetKey: `guild:${row.id}`,
    kind: "guild",
    scopeId: row.id,
    label: row.name,
    latestMessageAt: toIso(latestMessageAt ?? row.createdAt),
  };
}

async function readRoomParticipants(
  roomId: number,
): Promise<AdminChatParticipant[]> {
  const rows = await db
    .select({
      userId: chatRoomMembers.userId,
      name: users.gameName,
      role: chatRoomMembers.role,
      joinedAt: chatRoomMembers.joinedAt,
    })
    .from(chatRoomMembers)
    .innerJoin(users, eq(users.id, chatRoomMembers.userId))
    .where(eq(chatRoomMembers.roomId, roomId))
    .orderBy(
      asc(sql`case when ${chatRoomMembers.role} = 'owner' then 0 else 1 end`),
      asc(chatRoomMembers.joinedAt),
      asc(chatRoomMembers.userId),
    );
  return rows.map((row) => ({
    userId: row.userId,
    name: row.name ?? "모험가",
    role: row.role === "owner" ? "owner" : "member",
    joinedAt: row.joinedAt.toISOString(),
  }));
}

export async function readAdminChatMessages(
  query: AdminChatMessagesQuery,
): Promise<AdminChatMessagesResponse | null> {
  const rows = await db
    .select({
      id: messages.id,
      authorUserId: messages.userId,
      name: messages.name,
      className: messages.className,
      title: messages.title,
      content: messages.content,
      itemLink: messages.itemLink,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(adminChatMessageWhere(query))
    .orderBy(desc(messages.id))
    .limit(query.limit + 1);

  const page = buildAdminChatMessagePage(rows, query.limit);
  let target: AdminChatTarget | null;
  let participants: AdminChatParticipant[] | null = null;
  if (query.kind === "room") {
    [target, participants] = await Promise.all([
      readRoomTarget(query.scopeId as number, page.latestMessageAt),
      query.beforeId == null
        ? readRoomParticipants(query.scopeId as number)
        : Promise.resolve(null),
    ]);
  } else if (query.kind === "guild") {
    target = await readGuildTarget(
      query.scopeId as number,
      page.latestMessageAt,
    );
  } else {
    target = {
      targetKey: query.kind,
      kind: query.kind,
      label: query.kind === "global" ? "전체 채팅" : "거래 채팅",
      latestMessageAt: toIso(page.latestMessageAt),
    };
  }
  if (!target) return null;

  return {
    target,
    participants,
    messages: page.messages,
    hasMore: page.hasMore,
    nextBeforeId: page.nextBeforeId,
  };
}
