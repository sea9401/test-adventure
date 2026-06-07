import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { ARENA_HISTORY_KEY } from "@/lib/storage-keys";
import { parseArenaHistory } from "@/lib/server/arena";

// GET /api/v2/arena/history — 최근 전투 기록(리플레이 포함, 다시보기용).
//   리플레이 로그가 무거워 mount fetch(state)와 분리 — 아레나 진입 시 state 와 병렬로 받는다.
//   read-only(락 불필요). 매치 POST 응답의 historyEntry 로 클라가 낙관적 prepend 도 한다.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const row = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, ARENA_HISTORY_KEY)))
    .limit(1)
    .then((rows) => rows[0]);
  return Response.json({
    ok: true,
    history: parseArenaHistory(row?.value ?? null),
  });
}
