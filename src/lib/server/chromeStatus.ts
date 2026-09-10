import {
  and,
  desc,
  eq,
  isNull,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  bulletinPosts,
  bulletinViews,
  marketplaceInbox,
  userBlocks,
  v2Notifications,
} from "@/db/schema";
import {
  FARM_READY_NOTIFICATION_SAVE_KEY,
  createFarmReadyNotification,
  emptyFarmReadyNotificationState,
} from "@/adventure/v2/farmReadyNotification";
import { FARM_SAVE_KEY, emptyFarmState } from "@/adventure/v2/farm";
import { readSave } from "@/lib/server/savesKv";

export type ChromeStatus = {
  notificationUnread: number;
  mailUnread: number;
  hasUnreadNotice: boolean;
};

function visibleInboxWhere(userId: string) {
  return or(
    ne(marketplaceInbox.kind, "user_message"),
    isNull(marketplaceInbox.fromUserId),
    notExists(
      db
        .select({ one: sql`1` })
        .from(userBlocks)
        .where(
          and(
            eq(userBlocks.blockerUserId, userId),
            eq(userBlocks.blockedUserId, marketplaceInbox.fromUserId),
          ),
        ),
    ),
  );
}

export async function readChromeStatus(
  userId: string,
  now = Date.now(),
): Promise<ChromeStatus> {
  const [notificationRows, farmRaw, farmNotificationRaw, mailRows, notices] =
    await Promise.all([
      db
        .select({ unreadCount: sql<number>`count(*)::int` })
        .from(v2Notifications)
        .where(
          and(
            eq(v2Notifications.userId, userId),
            isNull(v2Notifications.readAt),
            ne(v2Notifications.type, "lottery_won"),
          ),
        ),
      readSave(db, userId, FARM_SAVE_KEY, emptyFarmState(now)),
      readSave(
        db,
        userId,
        FARM_READY_NOTIFICATION_SAVE_KEY,
        emptyFarmReadyNotificationState(),
      ),
      db
        .select({ unreadCount: sql<number>`count(*)::int` })
        .from(marketplaceInbox)
        .where(
          and(
            eq(marketplaceInbox.userId, userId),
            isNull(marketplaceInbox.readAt),
            isNull(marketplaceInbox.recipientDeletedAt),
            visibleInboxWhere(userId),
          ),
        ),
      db
        .select({ id: bulletinPosts.id })
        .from(bulletinPosts)
        .where(
          and(
            eq(bulletinPosts.category, "notice"),
            isNull(bulletinPosts.guildId),
          ),
        )
        .orderBy(desc(bulletinPosts.createdAt))
        .limit(1),
    ]);

  const farmReadyNotification = createFarmReadyNotification(
    farmRaw,
    farmNotificationRaw,
    now,
  );
  const latestNotice = notices[0];
  let hasUnreadNotice = false;
  if (latestNotice) {
    const viewed = await db
      .select({ postId: bulletinViews.postId })
      .from(bulletinViews)
      .where(
        and(
          eq(bulletinViews.userId, userId),
          eq(bulletinViews.postId, latestNotice.id),
        ),
      );
    hasUnreadNotice = viewed.length === 0;
  }

  return {
    notificationUnread:
      (notificationRows[0]?.unreadCount ?? 0) +
      (farmReadyNotification ? 1 : 0),
    mailUnread: mailRows[0]?.unreadCount ?? 0,
    hasUnreadNotice,
  };
}
