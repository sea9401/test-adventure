import { db } from "@/db";
import { adminAuditLog } from "@/db/schema";

// 관리자 감사 로그 기록 — admin API 의 변경 행동을 append-only 로 남긴다.
// 절대 실패가 본 작업을 막지 않도록(로그가 변경을 롤백시키면 안 됨) try/catch 로 격리:
// 기록 실패는 콘솔 경고만 하고 삼킨다.
export async function logAdminAction(entry: {
  adminEmail: string;
  action: string;
  targetUserId?: string | null;
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.insert(adminAuditLog).values({
      adminEmail: entry.adminEmail,
      action: entry.action,
      targetUserId: entry.targetUserId ?? null,
      detail: entry.detail ?? null,
    });
  } catch (e) {
    console.error("[adminAudit] 기록 실패", entry.action, e);
  }
}
