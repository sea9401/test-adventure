import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { coopBossContributors, coopBossSessions } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave } from "@/lib/server/savesKv";
import { expireStaleCoopSessions } from "@/lib/server/v2Coop";
import {
  COOP_BOSS_KIND_IDS,
  SUMMON_SCROLL_MATERIAL_ID,
  coopTierForRatio,
  parseCoopBossKindId,
} from "@/adventure/data/v2/coopBosses";

// GET /api/v2/coop — 협동 보스 목록 현황(목록 화면 폴링용 — 슬림).
// 같은 종류 동시 다수 소환(#714): 활성 세션이 인스턴스 단위로 N개 — 참전자 명단/최근
// 공격은 상세(GET /api/v2/coop/[sessionId])로 분리, 여기는 집계만.
//
// 응답: {
//   scrolls,                       — 내 소환서 보유 장수
//   sessions: [{ id, kind, hp, maxHp, expiresAt, summonedByName,
//                participantCount, myDamage, myTier }],
//   claimables: [{ sessionId, kind, myDamage, tier, defeatedAt }],
// }
// 만료 정리는 lazy — 진입 시 sweep(cron 불요·멱등).

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  await expireStaleCoopSessions(db, now);

  // 내 소환서 보유량 — character.v2.materials (비잠금 read).
  const charSave = await readSave<{ materials?: unknown } | null>(
    db,
    userId,
    "character.v2",
    null,
  );
  const mats =
    typeof charSave?.materials === "object" && charSave.materials !== null
      ? (charSave.materials as Record<string, unknown>)
      : {};
  const scrolls = Math.max(
    0,
    Math.floor(Number(mats[SUMMON_SCROLL_MATERIAL_ID]) || 0),
  );

  // 활성 세션(인스턴스 단위, 종류별 최대 MAX_ACTIVE_PER_KIND) — 오래된 소환부터.
  const activeSessions = await db
    .select()
    .from(coopBossSessions)
    .where(
      and(
        inArray(coopBossSessions.regionId, [...COOP_BOSS_KIND_IDS]),
        isNull(coopBossSessions.defeatedAt),
      ),
    )
    .orderBy(coopBossSessions.spawnedAt);
  const activeIds = activeSessions.map((s) => s.id);

  // 세션별 참전자 수(집계) + 내 기여 — 활성 세션이 있을 때만.
  const countRows = activeIds.length
    ? await db
        .select({
          sessionId: coopBossContributors.sessionId,
          n: count(),
        })
        .from(coopBossContributors)
        .where(inArray(coopBossContributors.sessionId, activeIds))
        .groupBy(coopBossContributors.sessionId)
    : [];
  const countBySession = new Map(countRows.map((r) => [r.sessionId, r.n]));
  const myRows = activeIds.length
    ? await db
        .select({
          sessionId: coopBossContributors.sessionId,
          damage: coopBossContributors.damage,
        })
        .from(coopBossContributors)
        .where(
          and(
            inArray(coopBossContributors.sessionId, activeIds),
            eq(coopBossContributors.userId, userId),
          ),
        )
    : [];
  const myBySession = new Map(myRows.map((r) => [r.sessionId, r.damage]));

  const sessions = activeSessions
    .map((s) => {
      const kind = parseCoopBossKindId(s.regionId);
      if (!kind) return null;
      const myDamage = myBySession.get(s.id) ?? 0;
      return {
        id: s.id,
        kind,
        hp: s.hp,
        maxHp: s.maxHp,
        expiresAt: s.expiresAt.getTime(),
        summonedByName: s.summonedByName,
        participantCount: countBySession.get(s.id) ?? 0,
        myDamage,
        myTier: coopTierForRatio(myDamage / Math.max(1, s.maxHp)),
      };
    })
    .filter(Boolean);

  // 미수령 보상 — 처치된(hp<=0) 세션의 내 기여 중 unclaimed.
  const claimRows = await db
    .select({
      sessionId: coopBossContributors.sessionId,
      damage: coopBossContributors.damage,
      regionId: coopBossSessions.regionId,
      maxHp: coopBossSessions.maxHp,
      defeatedAt: coopBossSessions.defeatedAt,
    })
    .from(coopBossContributors)
    .innerJoin(
      coopBossSessions,
      eq(coopBossSessions.id, coopBossContributors.sessionId),
    )
    .where(
      and(
        eq(coopBossContributors.userId, userId),
        isNull(coopBossContributors.claimedAt),
        sql`${coopBossSessions.defeatedAt} IS NOT NULL`,
        sql`${coopBossSessions.hp} <= 0`,
        inArray(coopBossSessions.regionId, [...COOP_BOSS_KIND_IDS]),
      ),
    )
    .orderBy(desc(coopBossSessions.defeatedAt))
    .limit(10);
  const claimables = claimRows
    .map((r) => {
      const kind = parseCoopBossKindId(r.regionId);
      const tier = coopTierForRatio(r.damage / Math.max(1, r.maxHp));
      return kind
        ? {
            sessionId: r.sessionId,
            kind,
            myDamage: r.damage,
            tier,
            defeatedAt: r.defeatedAt?.getTime() ?? 0,
          }
        : null;
    })
    .filter(Boolean);

  return Response.json({ ok: true, scrolls, sessions, claimables });
}
