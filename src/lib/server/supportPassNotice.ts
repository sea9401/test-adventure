// 월간 모험 지원권 만료 알림 기록 — 상태를 읽을 때 보낼 알림이 있으면 알림 목록에 한 번 남긴다.
// 푸시는 보내지 않는다(`pushMessageForNotification`에 이 종류를 넣지 않는다).

import { eq } from "drizzle-orm";
import {
  SUPPORT_PASS_NOTICE_SAVE_KEY,
  dueSupportPassNotices,
  markSupportPassNotices,
  parseSupportPassNoticeState,
} from "@/adventure/v2/supportPassNotice";
import { db } from "@/db";
import { users } from "@/db/schema";
import { readSave, upsertSave } from "@/lib/server/savesKv";
import { insertNotificationWith } from "@/lib/server/v2Notifications";

/**
 * 보낼 만료 알림이 있으면 기록하고 보낸 종료 시각을 남긴다. 몇 건을 기록했는지 돌려준다.
 * 같은 계정의 요청이 겹쳐도 한 번만 남도록 사용자 행을 잠그고 다시 확인한다.
 */
export async function recordDueSupportPassNotices(
  userId: string,
  supportRaw: unknown,
  noticeRaw: unknown,
  now: number = Date.now(),
): Promise<number> {
  // 대부분의 요청은 여기서 끝난다. 쓸 일이 있을 때만 트랜잭션을 연다.
  if (dueSupportPassNotices(supportRaw, noticeRaw, now).length === 0) return 0;
  return db.transaction(async (tx) => {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
      .limit(1);
    const current = await readSave(tx, userId, SUPPORT_PASS_NOTICE_SAVE_KEY, {});
    const due = dueSupportPassNotices(supportRaw, current, now);
    for (const notice of due) {
      await insertNotificationWith(tx, userId, notice.type, notice.payload);
    }
    if (due.length > 0) {
      await upsertSave(
        tx,
        userId,
        SUPPORT_PASS_NOTICE_SAVE_KEY,
        markSupportPassNotices(parseSupportPassNoticeState(current), due),
      );
    }
    return due.length;
  });
}

/** 응답을 늦추지 않도록 뒤에서 기록한다. 실패해도 본 요청은 그대로 간다. */
export function recordDueSupportPassNoticesSoon(
  userId: string,
  supportRaw: unknown,
  noticeRaw: unknown,
  now: number = Date.now(),
): void {
  if (dueSupportPassNotices(supportRaw, noticeRaw, now).length === 0) return;
  void recordDueSupportPassNotices(userId, supportRaw, noticeRaw, now).catch((error) => {
    console.warn("[supportPassNotice] record failed", error);
  });
}
