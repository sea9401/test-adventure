import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  coopBossAttackLog,
  coopBossContributors,
  coopBossSessions,
  guildMembers,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  canAccessCoopBoss,
  parseCoopBossKindId,
} from "@/adventure/data/v2/coopBosses";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import {
  readMuseunCosmeticAppearanceMap,
  readProfileAvatarMap,
} from "@/lib/server/museunCosmetics";

type Ctx = {
  params: Promise<{ sessionId: string; attackId: string }>;
};

function parseReplayPayload(raw: unknown): ReplayPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const replay = raw as Partial<ReplayPayload>;
  if (!replay.enemy || typeof replay.enemy !== "object") return null;
  if (typeof replay.playerMaxHp !== "number") return null;
  if (typeof replay.playerMaxMp !== "number") return null;
  if (!Array.isArray(replay.log) || replay.log.length === 0) return null;
  return replay as ReplayPayload;
}

// GET /api/v2/coop/[sessionId]/attacks/[attackId] — 전용 전투 로그 페이지용.
// 공개 범위 밖이어도 해당 토벌에 참여했던 사용자는 자신의 과거 기록을 계속 확인할 수 있다.
export async function GET(_req: Request, { params }: Ctx) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { sessionId, attackId: rawAttackId } = await params;
  if (!/^\d+$/.test(rawAttackId)) {
    return Response.json({ ok: false, error: "no_attack" }, { status: 404 });
  }
  const attackId = Number(rawAttackId);
  if (!Number.isSafeInteger(attackId) || attackId <= 0) {
    return Response.json({ ok: false, error: "no_attack" }, { status: 404 });
  }

  const [session] = await db
    .select()
    .from(coopBossSessions)
    .where(eq(coopBossSessions.id, sessionId))
    .limit(1);
  const kind = session ? parseCoopBossKindId(session.regionId) : null;
  if (!session || !kind) {
    return Response.json({ ok: false, error: "no_attack" }, { status: 404 });
  }

  const viewerGuildId =
    (
      await db
        .select({ guildId: guildMembers.guildId })
        .from(guildMembers)
        .where(eq(guildMembers.userId, userId))
        .limit(1)
    )[0]?.guildId ?? null;
  if (!canAccessCoopBoss(session, { userId, guildId: viewerGuildId })) {
    const [contributor] = await db
      .select({ userId: coopBossContributors.userId })
      .from(coopBossContributors)
      .where(
        and(
          eq(coopBossContributors.sessionId, sessionId),
          eq(coopBossContributors.userId, userId),
        ),
      )
      .limit(1);
    if (!contributor) {
      return Response.json(
        { ok: false, error: "no_attack" },
        { status: 404 },
      );
    }
  }

  const [attack] = await db
    .select({
      id: coopBossAttackLog.id,
      userId: coopBossAttackLog.userId,
      name: coopBossAttackLog.name,
      damageDealt: coopBossAttackLog.damageDealt,
      damageTaken: coopBossAttackLog.damageTaken,
      diedEarly: coopBossAttackLog.diedEarly,
      isSupport: coopBossAttackLog.isSupport,
      log: coopBossAttackLog.log,
      createdAt: coopBossAttackLog.createdAt,
    })
    .from(coopBossAttackLog)
    .where(
      and(
        eq(coopBossAttackLog.id, attackId),
        eq(coopBossAttackLog.sessionId, sessionId),
      ),
    )
    .limit(1);
  const replay = attack ? parseReplayPayload(attack.log) : null;
  if (!attack || !replay) {
    return Response.json({ ok: false, error: "no_attack" }, { status: 404 });
  }
  const [avatarByUser, cosmeticByUser] = await Promise.all([
    readProfileAvatarMap([attack.userId]),
    readMuseunCosmeticAppearanceMap([attack.userId]),
  ]);

  return Response.json({
    ok: true,
    kind,
    attack: {
      id: attack.id,
      name: attack.name,
      damageDealt: attack.damageDealt,
      damageTaken: attack.damageTaken,
      diedEarly: attack.diedEarly,
      isSupport: attack.isSupport === true,
      isMe: attack.userId === userId,
      avatar: avatarByUser.get(attack.userId) ?? "male1",
      profileBorder:
        cosmeticByUser.get(attack.userId)?.profileBorder ?? null,
      replay,
      at: attack.createdAt.getTime(),
    },
  });
}
