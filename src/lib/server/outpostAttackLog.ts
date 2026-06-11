// 거점 공격 기록 리플레이 보존 정책 — outpost_claim_attempts.replay 는 거점당
// 최신 N 건만 유지하고, 그보다 오래된 행은 replay 만 null 로 비운다 (행 자체는
// 전황/통계용으로 보존). serverFeed trim 관례처럼 insert 후 부수효과로 호출 —
// 실패해도 본 작업은 성공해야 하므로 내부에서 삼킨다.

import { and, desc, eq, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { outpostClaimAttempts } from "@/db/schema";

// 거점당 리플레이 보존 건수 — attacks GET 노출(20)보다 약간 여유.
export const REPLAY_KEEP_PER_OUTPOST = 30;

export async function trimAttackReplays(outpostId: string): Promise<void> {
  try {
    const [cut] = await db
      .select({ id: outpostClaimAttempts.id })
      .from(outpostClaimAttempts)
      .where(eq(outpostClaimAttempts.outpostId, outpostId))
      .orderBy(desc(outpostClaimAttempts.id))
      .offset(REPLAY_KEEP_PER_OUTPOST - 1)
      .limit(1);
    if (!cut) return;
    await db
      .update(outpostClaimAttempts)
      .set({ replay: null })
      .where(
        and(
          eq(outpostClaimAttempts.outpostId, outpostId),
          lt(outpostClaimAttempts.id, cut.id),
          isNotNull(outpostClaimAttempts.replay),
        ),
      );
  } catch (err) {
    console.warn("[outpostAttackLog] replay trim failed", err);
  }
}
