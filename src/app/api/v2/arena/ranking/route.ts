import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { ARENA_STATE_KEY, CHARACTER_STATE_KEY } from "@/lib/storage-keys";
import { parseArenaState } from "@/lib/server/arena";

// GET /api/v2/arena/ranking — 점수 순위표. arena-state.v2(매치를 한 번이라도 한 유저) 전체를
//   점수 내림차순 정렬해 상위 N + 본인 순위를 돌려준다. read-only. 동점은 userId 안정 정렬.
const PROFILE_KEY = "character-profile.v2";
const TOP_N = 20;

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const rows = await db
    .select({ userId: savesKv.userId, value: savesKv.value })
    .from(savesKv)
    .where(eq(savesKv.key, ARENA_STATE_KEY));

  const scored = rows
    .map((r) => ({ userId: r.userId, score: parseArenaState(r.value).score }))
    .sort((a, b) => b.score - a.score || (a.userId < b.userId ? -1 : 1));

  const myIndex = scored.findIndex((s) => s.userId === userId);
  const top = scored.slice(0, TOP_N);
  const topIds = top.map((t) => t.userId);

  const nameByUser = new Map<string, string>();
  const levelByUser = new Map<string, number>();
  if (topIds.length > 0) {
    const meta = await db
      .select({
        userId: savesKv.userId,
        key: savesKv.key,
        value: savesKv.value,
      })
      .from(savesKv)
      .where(
        and(
          inArray(savesKv.userId, topIds),
          inArray(savesKv.key, [PROFILE_KEY, CHARACTER_STATE_KEY]),
        ),
      );
    for (const m of meta) {
      if (m.key === PROFILE_KEY) {
        const n = (m.value as { name?: unknown } | null)?.name;
        if (typeof n === "string" && n.trim().length > 0) {
          nameByUser.set(m.userId, n.trim());
        }
      } else if (m.key === CHARACTER_STATE_KEY) {
        const lv = (m.value as { level?: unknown } | null)?.level;
        if (typeof lv === "number" && Number.isFinite(lv)) {
          levelByUser.set(m.userId, Math.max(1, Math.floor(lv)));
        }
      }
    }
  }

  const entries = top.map((t, i) => ({
    rank: i + 1,
    name: nameByUser.get(t.userId) ?? "모험가",
    level: levelByUser.get(t.userId) ?? 1,
    score: t.score,
    isMe: t.userId === userId,
  }));

  return Response.json({
    ok: true,
    top: entries,
    myRank: myIndex >= 0 ? myIndex + 1 : null,
    myScore: myIndex >= 0 ? scored[myIndex]!.score : 0,
    totalRanked: scored.length,
  });
}
