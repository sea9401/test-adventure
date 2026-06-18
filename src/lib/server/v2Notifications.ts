// v2 전용 알림 쓰기 — v2_notifications 테이블에 개인 타겟 사건 한 줄 append.
//
// serverFeed 관례 미러:
//   - 부수 효과 취급 — 실패해도 본 작업은 성공해야 하므로 try/catch + console.warn 삼킴.
//   - trim — insert 후 유저당 NOTIF_MAX_PER_USER 초과분(가장 오래된 것부터) 삭제.
//   - 디바운스 — opts.debounceMs 가 있으면 같은 유저+type+거점(payload.outpostId)의
//     항목이 그 시간 안에 있으면 건너뜀 (피격 알림 도배 방지).
//
// 호출은 항상 tx 커밋 후 — 알림은 표시 전용이라 본 트랜잭션과 원자성 불요.

import { and, desc, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { v2Notifications } from "@/db/schema";
import {
  NOTIF_MAX_PER_USER,
  type V2NotificationPayload,
  type V2NotificationType,
} from "@/lib/v2-notification-config";

export async function insertNotification(
  userId: string,
  type: V2NotificationType,
  payload: V2NotificationPayload,
  opts?: { debounceMs?: number },
): Promise<void> {
  try {
    if (opts?.debounceMs) {
      const since = new Date(Date.now() - opts.debounceMs);
      const recent = await db
        .select({ payload: v2Notifications.payload })
        .from(v2Notifications)
        .where(
          and(
            eq(v2Notifications.userId, userId),
            eq(v2Notifications.type, type),
            gt(v2Notifications.createdAt, since),
          ),
        )
        .orderBy(desc(v2Notifications.id))
        .limit(10);
      const outpostId = (payload as { outpostId?: string }).outpostId;
      const dup = recent.some(
        (r) =>
          (r.payload as { outpostId?: string } | null)?.outpostId === outpostId,
      );
      if (dup) return;
    }

    await db.insert(v2Notifications).values({ userId, type, payload });

    // trim — 그 유저의 최신 NOTIF_MAX_PER_USER 개만 남기고 이전 행 삭제.
    const [cut] = await db
      .select({ id: v2Notifications.id })
      .from(v2Notifications)
      .where(eq(v2Notifications.userId, userId))
      .orderBy(desc(v2Notifications.id))
      .offset(NOTIF_MAX_PER_USER - 1)
      .limit(1);
    if (cut) {
      await db
        .delete(v2Notifications)
        .where(
          and(
            eq(v2Notifications.userId, userId),
            lt(v2Notifications.id, cut.id),
          ),
        );
    }
  } catch (err) {
    console.warn("[v2Notifications] insert failed", err);
  }
}

// 여러 수신자(길드 전원 등)에게 같은 알림 — 정원 3이라 순차 insert 로 충분.
export async function insertNotificationMany(
  userIds: readonly string[],
  type: V2NotificationType,
  payload: V2NotificationPayload,
  opts?: { debounceMs?: number },
): Promise<void> {
  for (const id of userIds) {
    await insertNotification(id, type, payload, opts);
  }
}
