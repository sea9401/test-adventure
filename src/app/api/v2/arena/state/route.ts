import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { ARENA_STATE_KEY } from "@/lib/storage-keys";
import {
  MAX_DAILY_MATCHES,
  applyDailyReset,
  parseArenaState,
} from "@/lib/server/arena";

// GET /api/v2/arena/state — 아레나 mount fetch.
//
// 본인 점수·일일 잔여·마일스톤 진행도(빈 배열) + 다음 KST 리셋 시각.
// 일일 리셋 시각이 지나 있으면 자동 리셋 (read-only 라도 dailyUsed/dailyResetAt 갱신은
// 다음 match POST 가 처리 — GET 은 클라 표시 정합성만 맞춰 응답).

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const row = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, ARENA_STATE_KEY)))
    .limit(1)
    .then((rows) => rows[0]);

  const raw = parseArenaState(row?.value ?? null, now);
  const { state } = applyDailyReset(raw, now);

  return Response.json({
    ok: true,
    state: {
      score: state.score,
      dailyUsed: state.dailyUsed,
      dailyRemaining: Math.max(0, MAX_DAILY_MATCHES - state.dailyUsed),
      dailyResetAt: state.dailyResetAt,
      recentOpponents: state.recentOpponents,
      milestonesReached: state.milestonesReached,
    },
    maxDaily: MAX_DAILY_MATCHES,
  });
}
