import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { pvpRatings, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { CHARACTER_STATE_KEY } from "@/lib/storage-keys";
import { ARENA_INITIAL_RATING } from "@/lib/server/arena";
import { getOrCreateCurrentSeason } from "@/lib/server/pvp/season";

// GET /api/v2/arena/ranking — 현재 주간 Elo 순위표.
//   실유저 랭크전으로 적립된 pvp_ratings 만 정렬해 상위 N + 본인 순위를 돌려준다.
//   봇 연습전은 비랭크라 이 목록에 들어오지 않는다.
const PROFILE_KEY = "character-profile.v2";
const TOP_N = 20;

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const season = await getOrCreateCurrentSeason(new Date());
  const rows = await db
    .select({
      userId: pvpRatings.userId,
      score: pvpRatings.rating,
      wins: pvpRatings.wins,
      updatedAt: pvpRatings.updatedAt,
    })
    .from(pvpRatings)
    .where(eq(pvpRatings.seasonId, season.id))
    .orderBy(desc(pvpRatings.rating), desc(pvpRatings.wins), pvpRatings.updatedAt);

  const scored = rows
    .map((r) => ({
      userId: r.userId,
      score: r.score,
      wins: r.wins,
      updatedAtMs: new Date(r.updatedAt).getTime(),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.wins - a.wins ||
        a.updatedAtMs - b.updatedAtMs ||
        (a.userId < b.userId ? -1 : 1),
    );

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
    // userId — 플레이어 정보 페이지(/character/[id]) 링크용.
    userId: t.userId,
    name: nameByUser.get(t.userId) ?? "모험가",
    level: levelByUser.get(t.userId) ?? 1,
    score: t.score,
    isMe: t.userId === userId,
  }));

  return Response.json({
    ok: true,
    top: entries,
    myRank: myIndex >= 0 ? myIndex + 1 : null,
    myScore: myIndex >= 0 ? scored[myIndex]!.score : ARENA_INITIAL_RATING,
    totalRanked: scored.length,
  });
}
