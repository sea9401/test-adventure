// GET /api/pvp/status — 아레나 탭이 한 번 호출해 모든 화면 데이터를 채운다.
//
//   { season, me, top, recent }
//
//   - season: 현재 시즌 (없으면 자동 생성)
//   - me:     본인 시즌 레이팅 / 승무패 (참여 전이면 ELO_INITIAL/0)
//   - top:    시즌 순위표 상위 50명 (닉네임 포함)
//   - recent: 본인 최근 매치 20건 (상대 닉네임 + outcome + rating delta)
//
// 1) season 1 query, 2) my rating 1 query, 3) top SQL 1 query (PvP 레이팅 × 닉네임),
// 4) my matches 1 query + 닉네임 batch 1 query. 총 5 query.

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { pvpMatches, savesKv, users } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { getOrCreateCurrentSeason } from "@/lib/server/pvp/season";
import { getOrCreateRating } from "@/lib/server/pvp/ratings";
import { getNextChallengeAt } from "@/lib/server/pvp/cooldown";
import { isBotId } from "@/lib/server/pvp/bots";
import { PVP_WALLET_KEY, type PvpWallet } from "@/lib/server/pvp/coins";
import { PVP_SHOP_TITLES } from "@/adventure/pvp/shop";

const TOP_LIMIT = 50;
const RECENT_LIMIT = 20;

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const season = await getOrCreateCurrentSeason();

  const [meRating, nextChallengeAt, walletRows, logRows] = await Promise.all([
    getOrCreateRating(userId, season.id),
    getNextChallengeAt(userId),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, PVP_WALLET_KEY)))
      .limit(1),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "adventure-log.v2")))
      .limit(1),
  ]);
  const wallet = walletRows[0]?.value as PvpWallet | undefined;
  const coins = typeof wallet?.coins === "number" ? wallet.coins : 0;
  // 보유한 상점 칭호 — 상점 UI 가 "보유" 표시/구매 비활성에 사용.
  const ownedTitles =
    (logRows[0]?.value as { titles?: Record<string, unknown> } | undefined)
      ?.titles ?? {};
  const ownedShopTitleIds = PVP_SHOP_TITLES.map((t) => t.titleId).filter(
    (id) => id in ownedTitles,
  );

  // 순위표 — 레이팅 인덱스(seasonId, rating DESC) 가 정렬을 cover.
  const topResult = await db.execute(sql`
    SELECT
      r.user_id AS user_id,
      COALESCE(u.game_name, p.value->>'name', '이름 없는 모험가') AS name,
      r.rating AS rating,
      r.wins AS wins,
      r.losses AS losses,
      r.draws AS draws
    FROM pvp_ratings r
    INNER JOIN users u ON u.id = r.user_id
    LEFT JOIN saves_kv p
      ON p.user_id = r.user_id AND p.key = 'character-profile.v2'
    WHERE r.season_id = ${season.id}
    ORDER BY r.rating DESC, r.wins DESC
    LIMIT ${TOP_LIMIT}
  `);
  type TopRow = {
    user_id: string;
    name: string;
    rating: number;
    wins: number;
    losses: number;
    draws: number;
  };
  const top = (topResult.rows as unknown as TopRow[]).map((r, i) => ({
    rank: i + 1,
    userId: String(r.user_id),
    name: String(r.name),
    rating: Number(r.rating),
    wins: Number(r.wins),
    losses: Number(r.losses),
    draws: Number(r.draws),
    mine: String(r.user_id) === userId,
  }));

  // 최근 매치 — attacker / defender 양쪽 인덱스 OR.
  const matches = await db
    .select()
    .from(pvpMatches)
    .where(
      sql`${pvpMatches.attackerId} = ${userId} OR ${pvpMatches.defenderId} = ${userId}`,
    )
    .orderBy(desc(pvpMatches.createdAt))
    .limit(RECENT_LIMIT);

  // 상대 userId 모아 닉네임 batch 조회.
  const oppIds = Array.from(
    new Set(
      matches.map((m) =>
        m.attackerId === userId ? m.defenderId : m.attackerId,
      ),
    ),
  );
  const nameMap = new Map<string, string>();
  if (oppIds.length > 0) {
    const [uRows, pRows] = await Promise.all([
      db
        .select({ id: users.id, gameName: users.gameName })
        .from(users)
        .where(inArray(users.id, oppIds)),
      db
        .select({ userId: savesKv.userId, value: savesKv.value })
        .from(savesKv)
        .where(
          sql`${savesKv.userId} IN (${sql.join(
            oppIds.map((id) => sql`${id}`),
            sql`, `,
          )}) AND ${savesKv.key} = 'character-profile.v2'`,
        ),
    ]);
    const profileName = new Map<string, string>();
    for (const r of pRows) {
      const v = r.value as { name?: unknown } | null | undefined;
      if (v && typeof v.name === "string") profileName.set(r.userId, v.name);
    }
    for (const u of uRows) {
      const gn = u.gameName?.trim();
      if (gn) nameMap.set(u.id, gn);
      else if (profileName.has(u.id))
        nameMap.set(u.id, profileName.get(u.id) ?? "");
    }
  }

  const recent = matches.map((m) => {
    const iAmAttacker = m.attackerId === userId;
    const opponentId = iAmAttacker ? m.defenderId : m.attackerId;
    const myBefore = iAmAttacker
      ? m.attackerRatingBefore
      : m.defenderRatingBefore;
    const myAfter = iAmAttacker
      ? m.attackerRatingAfter
      : m.defenderRatingAfter;
    // outcome 을 본인 시점으로 win/loss/draw 로 정규화.
    let myOutcome: "win" | "loss" | "draw";
    if (m.outcome === "draw") myOutcome = "draw";
    else if (m.outcome === "a_win") myOutcome = iAmAttacker ? "win" : "loss";
    else myOutcome = iAmAttacker ? "loss" : "win";
    return {
      id: m.id,
      createdAt: m.createdAt,
      iAmAttacker,
      opponent: {
        userId: opponentId,
        name: nameMap.get(opponentId) ?? "이름 없는 모험가",
        isBot: isBotId(opponentId),
      },
      myOutcome,
      ratingBefore: myBefore,
      ratingAfter: myAfter,
      ratingDelta: myAfter - myBefore,
    };
  });

  return Response.json({
    season: { id: season.id, startAt: season.startAt, endAt: season.endAt },
    me: {
      rating: meRating.rating,
      wins: meRating.wins,
      losses: meRating.losses,
      draws: meRating.draws,
      coins,
      ownedShopTitleIds,
    },
    nextChallengeAt: nextChallengeAt ? nextChallengeAt.toISOString() : null,
    top,
    recent,
  });
}
