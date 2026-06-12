import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  coopBossAttackLog,
  coopBossContributors,
  coopBossSessions,
  savesKv,
  users,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave } from "@/lib/server/savesKv";
import { expireStaleCoopSessions } from "@/lib/server/v2Coop";
import {
  COOP_BOSS_KIND_IDS,
  SUMMON_SCROLL_MATERIAL_ID,
  coopTierForRatio,
  parseCoopBossKindId,
} from "@/adventure/data/v2/coopBosses";

// GET /api/v2/coop — 협동 보스 현황(보스 패널 폴링용).
//
// 응답: {
//   scrolls,                       — 내 소환서 보유 장수
//   bosses: [{ kind, session?, myDamage, myTier, participantCount, top, recentAttacks }],
//   claimables: [{ sessionId, kind, myDamage, tier, defeatedAt }],
// }
// 만료 정리는 lazy — 진입 시 sweep(cron 불요·멱등). 폴링 hot path 지만 대상 없으면
// no-op UPDATE 라 부담 미미(세션 테이블이 작음).

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

  // 활성 세션(kind 당 최대 1).
  const activeSessions = await db
    .select()
    .from(coopBossSessions)
    .where(
      and(
        inArray(coopBossSessions.regionId, [...COOP_BOSS_KIND_IDS]),
        isNull(coopBossSessions.defeatedAt),
      ),
    );
  const activeBySessionId = new Map(activeSessions.map((s) => [s.id, s]));
  const activeIds = [...activeBySessionId.keys()];

  // 내 기여 + top5 + 최근 공격 — 활성 세션이 있을 때만.
  const myRows = activeIds.length
    ? await db
        .select()
        .from(coopBossContributors)
        .where(
          and(
            inArray(coopBossContributors.sessionId, activeIds),
            eq(coopBossContributors.userId, userId),
          ),
        )
    : [];
  const myBySession = new Map(myRows.map((r) => [r.sessionId, r]));

  const topRows = activeIds.length
    ? await db
        .select({
          sessionId: coopBossContributors.sessionId,
          userId: coopBossContributors.userId,
          damage: coopBossContributors.damage,
          attackCount: coopBossContributors.attackCount,
          name: users.gameName,
        })
        .from(coopBossContributors)
        .leftJoin(users, eq(users.id, coopBossContributors.userId))
        .where(inArray(coopBossContributors.sessionId, activeIds))
        .orderBy(desc(coopBossContributors.damage))
    : [];
  // users.gameName 이 NULL 인 유저 — character-profile.v2.name fallback(공용 dual-source 패턴).
  const missingNameUserIds = [
    ...new Set(topRows.filter((r) => !r.name).map((r) => r.userId)),
  ];
  const profileNameByUser = new Map<string, string>();
  if (missingNameUserIds.length > 0) {
    const profRows = await db
      .select({ userId: savesKv.userId, value: savesKv.value })
      .from(savesKv)
      .where(
        and(
          inArray(savesKv.userId, missingNameUserIds),
          eq(savesKv.key, "character-profile.v2"),
        ),
      );
    for (const p of profRows) {
      const n = (p.value as { name?: unknown } | null)?.name;
      if (typeof n === "string" && n.trim()) {
        profileNameByUser.set(p.userId, n.trim());
      }
    }
  }
  const displayName = (r: { userId: string; name: string | null }): string =>
    r.name?.trim() || profileNameByUser.get(r.userId) || "모험가";

  const recentAttacks = activeIds.length
    ? await db
        .select({
          sessionId: coopBossAttackLog.sessionId,
          name: coopBossAttackLog.name,
          damageDealt: coopBossAttackLog.damageDealt,
          diedEarly: coopBossAttackLog.diedEarly,
          createdAt: coopBossAttackLog.createdAt,
        })
        .from(coopBossAttackLog)
        .where(inArray(coopBossAttackLog.sessionId, activeIds))
        .orderBy(desc(coopBossAttackLog.createdAt))
        .limit(15)
    : [];

  // 미수령 보상 — 처치된(hp<=0) 세션의 내 기여 중 unclaimed (bronze 미달 제외는 클라 표기).
  const claimRows = await db
    .select({
      sessionId: coopBossContributors.sessionId,
      damage: coopBossContributors.damage,
      regionId: coopBossSessions.regionId,
      maxHp: coopBossSessions.maxHp,
      hp: coopBossSessions.hp,
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

  const bosses = COOP_BOSS_KIND_IDS.map((kindId) => {
    const session = activeSessions.find((s) => s.regionId === kindId) ?? null;
    const my = session ? (myBySession.get(session.id) ?? null) : null;
    const myDamage = my?.damage ?? 0;
    return {
      kind: kindId,
      session: session
        ? {
            id: session.id,
            hp: session.hp,
            maxHp: session.maxHp,
            expiresAt: session.expiresAt.getTime(),
          }
        : null,
      myDamage,
      myAttackCount: my?.attackCount ?? 0,
      myLastAttackAt: my?.lastAttackAt?.getTime() ?? null,
      myTier: session
        ? coopTierForRatio(myDamage / Math.max(1, session.maxHp))
        : null,
      // 참전자 명단(상세 화면) — 데미지 내림차순 상위 30. 본인 줄 강조는 클라(name 비교 대신
      // isMe 플래그 — 동명 충돌 방지).
      top: session
        ? topRows
            .filter((r) => r.sessionId === session.id)
            .slice(0, 30)
            .map((r) => ({
              name: displayName(r),
              damage: r.damage,
              attackCount: r.attackCount,
              isMe: r.userId === userId,
            }))
        : [],
      participantCount: session
        ? topRows.filter((r) => r.sessionId === session.id).length
        : 0,
      recentAttacks: session
        ? recentAttacks
            .filter((a) => a.sessionId === session.id)
            .slice(0, 8)
            .map((a) => ({
              name: a.name,
              damageDealt: a.damageDealt,
              diedEarly: a.diedEarly,
              at: a.createdAt.getTime(),
            }))
        : [],
    };
  });

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

  return Response.json({ ok: true, scrolls, bosses, claimables });
}
