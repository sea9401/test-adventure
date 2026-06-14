import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  coopBossAttackLog,
  coopBossContributors,
  coopBossSessions,
  guildMembers,
  savesKv,
  users,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  coopTierForRatio,
  parseCoopBossKindId,
  canAccessCoopBoss,
} from "@/adventure/data/v2/coopBosses";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";

// GET /api/v2/coop/[sessionId] — 협동 보스 인스턴스 상세(상세 화면 폴링용).
// 활성/처치/만료 무관 조회 가능 — 끝난 세션도 결과·내 보상 상태를 보여준다.
//
// 응답: { session{ id, kind, hp, maxHp, expiresAt, defeatedAt, expired, summonedByName },
//   my{ damage, attackCount, lastAttackAt, tier, claimed }, participantCount,
//   top(30, isMe), recentAttacks(10) }

type Ctx = { params: Promise<{ sessionId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { sessionId } = await params;

  const [session] = await db
    .select()
    .from(coopBossSessions)
    .where(eq(coopBossSessions.id, sessionId))
    .limit(1);
  const kind = session ? parseCoopBossKindId(session.regionId) : null;
  if (!session || !kind) {
    return Response.json({ ok: false, error: "no_session" }, { status: 404 });
  }
  // 코어루프 — 가시성 권한. 접근 권한 없으면 기여자(과거 참전·보상 확인)만 열람 허용,
  //   그 외엔 존재 노출 안 하려 404. off 면 누구나 열람(현행).
  if (V2_CORE_LOOP_V2) {
    const viewerGuildId =
      (
        await db
          .select({ guildId: guildMembers.guildId })
          .from(guildMembers)
          .where(eq(guildMembers.userId, userId))
          .limit(1)
      )[0]?.guildId ?? null;
    if (!canAccessCoopBoss(session, { userId, guildId: viewerGuildId })) {
      const [contrib] = await db
        .select({ userId: coopBossContributors.userId })
        .from(coopBossContributors)
        .where(
          and(
            eq(coopBossContributors.sessionId, sessionId),
            eq(coopBossContributors.userId, userId),
          ),
        )
        .limit(1);
      if (!contrib) {
        return Response.json(
          { ok: false, error: "no_session" },
          { status: 404 },
        );
      }
    }
  }

  const now = Date.now();
  // 만료 표식 — 목록 GET 의 sweep 이 아직 안 돈 직후라도 표시가 맞도록 계산값 동봉.
  const expired =
    session.expiresAt.getTime() <= now &&
    (session.defeatedAt === null || session.hp > 0);

  // 참전자 전체(데미지 내림차순) — 명단 상위 30 + 전체 수.
  const contribs = await db
    .select({
      userId: coopBossContributors.userId,
      damage: coopBossContributors.damage,
      attackCount: coopBossContributors.attackCount,
      lastAttackAt: coopBossContributors.lastAttackAt,
      claimedAt: coopBossContributors.claimedAt,
      name: users.gameName,
    })
    .from(coopBossContributors)
    .leftJoin(users, eq(users.id, coopBossContributors.userId))
    .where(eq(coopBossContributors.sessionId, sessionId))
    .orderBy(desc(coopBossContributors.damage));

  // users.gameName NULL → character-profile.v2.name fallback(공용 dual-source 패턴).
  const missingNameUserIds = [
    ...new Set(
      contribs
        .slice(0, 30)
        .filter((r) => !r.name)
        .map((r) => r.userId),
    ),
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

  const myRow = contribs.find((r) => r.userId === userId) ?? null;
  const myDamage = myRow?.damage ?? 0;

  const recentAttacks = await db
    .select({
      name: coopBossAttackLog.name,
      damageDealt: coopBossAttackLog.damageDealt,
      diedEarly: coopBossAttackLog.diedEarly,
      createdAt: coopBossAttackLog.createdAt,
    })
    .from(coopBossAttackLog)
    .where(eq(coopBossAttackLog.sessionId, sessionId))
    .orderBy(desc(coopBossAttackLog.createdAt))
    .limit(10);

  return Response.json({
    ok: true,
    session: {
      id: session.id,
      kind,
      hp: session.hp,
      maxHp: session.maxHp,
      expiresAt: session.expiresAt.getTime(),
      defeatedAt: session.defeatedAt?.getTime() ?? null,
      defeated: session.defeatedAt !== null && session.hp <= 0,
      expired,
      summonedByName: session.summonedByName,
    },
    my: {
      damage: myDamage,
      attackCount: myRow?.attackCount ?? 0,
      lastAttackAt: myRow?.lastAttackAt?.getTime() ?? null,
      tier: coopTierForRatio(myDamage / Math.max(1, session.maxHp)),
      claimed: myRow?.claimedAt != null,
    },
    participantCount: contribs.length,
    top: contribs.slice(0, 30).map((r) => ({
      name: r.name?.trim() || profileNameByUser.get(r.userId) || "모험가",
      damage: r.damage,
      attackCount: r.attackCount,
      isMe: r.userId === userId,
    })),
    recentAttacks: recentAttacks.map((a) => ({
      name: a.name,
      damageDealt: a.damageDealt,
      diedEarly: a.diedEarly,
      at: a.createdAt.getTime(),
    })),
  });
}
