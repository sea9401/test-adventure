import "server-only";

import { eq, inArray } from "drizzle-orm";
import webPush from "web-push";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { feedbackReplyHref } from "@/lib/feedbackNavigation";
import type { GamePushMessage } from "@/lib/push-notifications";
import type {
  V2NotificationPayload,
  V2NotificationType,
} from "@/lib/v2-notification-config";

type PushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

function pushConfig(): PushConfig | null {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject =
    process.env.WEB_PUSH_SUBJECT?.trim() || "mailto:support@msmsge.com";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export function webPushPublicKey(): string | null {
  return pushConfig()?.publicKey ?? null;
}

function isExpiredSubscriptionError(error: unknown): boolean {
  const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
  return statusCode === 404 || statusCode === 410;
}

async function sendToRows(
  rows: Array<{
    id: number;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>,
  message: GamePushMessage,
): Promise<{ delivered: number; removed: number; failed: number }> {
  const config = pushConfig();
  if (!config || rows.length === 0) {
    return { delivered: 0, removed: 0, failed: 0 };
  }
  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  let delivered = 0;
  let failed = 0;
  const expiredIds: number[] = [];
  const payload = JSON.stringify(message);
  await Promise.all(
    rows.map(async (row) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          payload,
          { TTL: 60 * 60 * 24 },
        );
        delivered += 1;
      } catch (error) {
        if (isExpiredSubscriptionError(error)) {
          expiredIds.push(row.id);
          return;
        }
        failed += 1;
        console.warn("[webPush] delivery failed", {
          subscriptionId: row.id,
          statusCode: (error as { statusCode?: unknown } | null)?.statusCode,
        });
      }
    }),
  );

  if (expiredIds.length > 0) {
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.id, expiredIds));
  }
  return { delivered, removed: expiredIds.length, failed };
}

export async function sendWebPushToUser(
  userId: string,
  message: GamePushMessage,
) {
  const rows = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  return sendToRows(rows, message);
}

export async function sendWebPushToAll(message: GamePushMessage) {
  const rows = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions);
  return sendToRows(rows, message);
}

// 폐기된 거점 전쟁 알림은 의도적으로 매핑하지 않는다. 인게임 DB 알림 호환은 유지하되
// 시스템 푸시는 현재 운영 중인 콘텐츠만 보낸다.
export function pushMessageForNotification(
  type: V2NotificationType,
  payload: V2NotificationPayload,
): GamePushMessage | null {
  switch (type) {
    case "guild_join_requested": {
      const value = payload as { applicantName: string };
      return {
        title: "길드 가입 신청",
        body: `${value.applicantName} 님이 길드 가입을 신청했습니다.`,
        url: "/guild",
        tag: "guild-join-requested",
      };
    }
    case "guild_join_accepted": {
      const value = payload as { guildName: string };
      return {
        title: "길드 가입 승인",
        body: `${value.guildName} 길드 가입이 승인되었습니다.`,
        url: "/guild",
        tag: "guild-join-accepted",
      };
    }
    case "guild_join_declined": {
      const value = payload as { guildName: string };
      return {
        title: "길드 가입 결과",
        body: `${value.guildName} 길드 가입 신청이 거절되었습니다.`,
        url: "/guild",
        tag: "guild-join-declined",
      };
    }
    case "coop_defeated": {
      const value = payload as { bossName: string };
      return {
        title: "협동 보스 처치",
        body: `${value.bossName} 토벌이 완료되었습니다. 보상을 확인하세요.`,
        url: "/battle/coop",
        tag: "coop-defeated",
      };
    }
    case "feedback_replied": {
      const value = payload as { feedbackId: number };
      return {
        title: "문의 답변 도착",
        body: "등록한 문의에 운영자 답변이 도착했습니다.",
        url: feedbackReplyHref(value.feedbackId),
        tag: "feedback-replied",
      };
    }
    default:
      return null;
  }
}
