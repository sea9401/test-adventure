import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bulletinComments,
  bulletinPosts,
  chatRoomMembers,
  chatRooms,
  guilds,
  marketplaceInbox,
  messages,
  savesKv,
  ugcPolicyConsents,
  userBlocks,
} from "@/db/schema";
import { canAccessBulletinPost, getViewerGuild } from "./bulletinAccess";
import type { UgcSourceType } from "@/lib/ugc-safety";
import { UGC_POLICY_VERSION } from "@/lib/ugc-safety";
import { PROFILE_STORAGE_KEY } from "@/lib/storage-keys";
import { readProfileValue } from "@/adventure/profile/profileValue";
import { resolveActor } from "./resolveActor";
import { resolveMarketplaceTradeReportSource } from "./marketplaceTradeReport";

export type ResolvedUgcSource = {
  sourceType: UgcSourceType;
  sourceId: string;
  targetUserId: string;
  targetName: string;
  contentSnapshot: string;
  contextSnapshot: Record<string, unknown>;
  relatedAccounts?: Array<{ userId: string; name: string }>;
};

export async function hasCurrentUgcConsent(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: ugcPolicyConsents.userId })
    .from(ugcPolicyConsents)
    .where(
      and(
        eq(ugcPolicyConsents.userId, userId),
        eq(ugcPolicyConsents.version, UGC_POLICY_VERSION),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function requireCurrentUgcConsent(
  userId: string,
): Promise<Response | null> {
  if (await hasCurrentUgcConsent(userId)) return null;
  return new Response("ugc consent required", { status: 403 });
}

export async function readBlockedUserIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: userBlocks.blockedUserId })
    .from(userBlocks)
    .where(eq(userBlocks.blockerUserId, userId));
  return rows.map((row) => row.userId);
}

export async function usersCannotInteract(
  firstUserId: string,
  secondUserId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ blockerUserId: userBlocks.blockerUserId })
    .from(userBlocks)
    .where(
      or(
        and(
          eq(userBlocks.blockerUserId, firstUserId),
          eq(userBlocks.blockedUserId, secondUserId),
        ),
        and(
          eq(userBlocks.blockerUserId, secondUserId),
          eq(userBlocks.blockedUserId, firstUserId),
        ),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function resolveUgcSource(
  viewerUserId: string,
  sourceType: UgcSourceType,
  sourceId: string,
): Promise<ResolvedUgcSource | null> {
  const numericSourceId = Number(sourceId);
  const validNumericSourceId =
    Number.isSafeInteger(numericSourceId) && numericSourceId > 0
      ? numericSourceId
      : null;

  if (sourceType === "marketplace_trade") {
    if (validNumericSourceId == null) return null;
    return resolveMarketplaceTradeReportSource(
      viewerUserId,
      validNumericSourceId,
    );
  }

  if (sourceType === "profile") {
    const resolved = await db.execute(sql`
      SELECT u.id AS user_id
      FROM users u
      LEFT JOIN saves_kv p
        ON p.user_id = u.id AND p.key = ${PROFILE_STORAGE_KEY}
      WHERE lower(COALESCE(NULLIF(btrim(u.game_name), ''), btrim(p.value->>'name')))
          = lower(${sourceId})
      LIMIT 1
    `);
    const targetUserId = (resolved.rows[0] as { user_id?: string } | undefined)
      ?.user_id;
    if (!targetUserId) return null;
    const [profileRow, actor] = await Promise.all([
      db
        .select({ value: savesKv.value })
        .from(savesKv)
        .where(
          and(
            eq(savesKv.userId, targetUserId),
            eq(savesKv.key, PROFILE_STORAGE_KEY),
          ),
        )
        .limit(1),
      resolveActor(targetUserId),
    ]);
    const avatar = readProfileValue(profileRow[0]?.value)?.gender ?? "male1";
    return {
      sourceType,
      sourceId: targetUserId,
      targetUserId,
      targetName: actor.name,
      contentSnapshot: `모험가 이름: ${actor.name}\n프로필 이미지: ${avatar}`,
      contextSnapshot: { avatar },
    };
  }

  if (sourceType === "guild_profile") {
    if (validNumericSourceId == null) return null;
    const [guild] = await db
      .select({
        id: guilds.id,
        name: guilds.name,
        masterId: guilds.masterId,
        description: guilds.description,
        emblem: guilds.emblem,
        nationName: guilds.nationName,
        lodgeSlogan: guilds.lodgeSlogan,
      })
      .from(guilds)
      .where(
        and(eq(guilds.id, validNumericSourceId), isNull(guilds.disbandedAt)),
      )
      .limit(1);
    if (!guild) return null;
    const master = await resolveActor(guild.masterId);
    return {
      sourceType,
      sourceId: String(guild.id),
      targetUserId: guild.masterId,
      targetName: master.name,
      contentSnapshot: [
        `길드명: ${guild.name}`,
        guild.nationName ? `국가명: ${guild.nationName}` : null,
        guild.description ? `소개: ${guild.description}` : null,
        guild.lodgeSlogan ? `회관 문구: ${guild.lodgeSlogan}` : null,
        guild.emblem ? `엠블럼: ${guild.emblem}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      contextSnapshot: { guildId: guild.id, emblem: guild.emblem },
    };
  }

  if (sourceType === "chat_room") {
    if (validNumericSourceId == null) return null;
    const [room] = await db
      .select({
        id: chatRooms.id,
        name: chatRooms.name,
        ownerId: chatRooms.ownerId,
        visibility: chatRooms.visibility,
      })
      .from(chatRooms)
      .where(eq(chatRooms.id, validNumericSourceId))
      .limit(1);
    if (!room) return null;
    if (room.visibility !== "public") {
      const [membership] = await db
        .select({ roomId: chatRoomMembers.roomId })
        .from(chatRoomMembers)
        .where(
          and(
            eq(chatRoomMembers.roomId, room.id),
            eq(chatRoomMembers.userId, viewerUserId),
          ),
        )
        .limit(1);
      if (!membership) return null;
    }
    const owner = await resolveActor(room.ownerId);
    return {
      sourceType,
      sourceId: String(room.id),
      targetUserId: room.ownerId,
      targetName: owner.name,
      contentSnapshot: `채팅방 이름: ${room.name}`,
      contextSnapshot: { visibility: room.visibility },
    };
  }

  if (sourceType === "bulletin_post") {
    if (validNumericSourceId == null) return null;
    if (!(await canAccessBulletinPost(db, validNumericSourceId, viewerUserId))) return null;
    const [row] = await db
      .select({
        userId: bulletinPosts.userId,
        name: bulletinPosts.name,
        category: bulletinPosts.category,
        title: bulletinPosts.title,
        content: bulletinPosts.content,
        guildId: bulletinPosts.guildId,
      })
      .from(bulletinPosts)
      .where(eq(bulletinPosts.id, validNumericSourceId))
      .limit(1);
    if (!row) return null;
    return {
      sourceType,
      sourceId: String(validNumericSourceId),
      targetUserId: row.userId,
      targetName: row.name,
      contentSnapshot: [row.title, row.content].filter(Boolean).join("\n\n"),
      contextSnapshot: {
        category: row.category,
        guildId: row.guildId,
      },
    };
  }

  if (sourceType === "bulletin_comment") {
    if (validNumericSourceId == null) return null;
    const [row] = await db
      .select({
        userId: bulletinComments.userId,
        name: bulletinComments.name,
        content: bulletinComments.content,
        postId: bulletinComments.postId,
        parentId: bulletinComments.parentId,
      })
      .from(bulletinComments)
      .where(eq(bulletinComments.id, validNumericSourceId))
      .limit(1);
    if (!row) return null;
    if (!(await canAccessBulletinPost(db, row.postId, viewerUserId))) return null;
    return {
      sourceType,
      sourceId: String(validNumericSourceId),
      targetUserId: row.userId,
      targetName: row.name,
      contentSnapshot: row.content,
      contextSnapshot: { postId: row.postId, parentId: row.parentId },
    };
  }

  if (sourceType === "inbox_message") {
    if (validNumericSourceId == null) return null;
    const [row] = await db
      .select({
        recipientUserId: marketplaceInbox.userId,
        senderUserId: marketplaceInbox.fromUserId,
        senderName: marketplaceInbox.fromName,
        kind: marketplaceInbox.kind,
        message: marketplaceInbox.message,
        createdAt: marketplaceInbox.createdAt,
      })
      .from(marketplaceInbox)
      .where(eq(marketplaceInbox.id, validNumericSourceId))
      .limit(1);
    if (
      !row ||
      row.kind !== "user_message" ||
      row.recipientUserId !== viewerUserId ||
      !row.senderUserId ||
      !row.senderName
    ) {
      return null;
    }
    return {
      sourceType,
      sourceId: String(validNumericSourceId),
      targetUserId: row.senderUserId,
      targetName: row.senderName,
      contentSnapshot: row.message ?? "",
      contextSnapshot: { createdAt: row.createdAt.toISOString() },
    };
  }

  if (validNumericSourceId == null) return null;
  const [row] = await db
    .select({
      userId: messages.userId,
      name: messages.name,
      content: messages.content,
      channel: messages.channel,
      guildId: messages.guildId,
      roomId: messages.roomId,
    })
    .from(messages)
    .where(eq(messages.id, validNumericSourceId))
    .limit(1);
  if (!row) return null;

  if (row.channel === "guild") {
    const guild = await getViewerGuild(db, viewerUserId);
    if (guild?.guildId !== row.guildId) return null;
  } else if (row.channel === "room") {
    if (row.roomId == null) return null;
    const [membership] = await db
      .select({ roomId: chatRoomMembers.roomId })
      .from(chatRoomMembers)
      .where(
        and(
          eq(chatRoomMembers.roomId, row.roomId),
          eq(chatRoomMembers.userId, viewerUserId),
        ),
      )
      .limit(1);
    if (!membership) return null;
  } else if (row.channel !== "global" && row.channel !== "trade") {
    return null;
  }

  return {
    sourceType,
    sourceId: String(validNumericSourceId),
    targetUserId: row.userId,
    targetName: row.name,
    contentSnapshot: row.content,
    contextSnapshot: {
      channel: row.channel,
      guildId: row.guildId,
      roomId: row.roomId,
    },
  };
}
