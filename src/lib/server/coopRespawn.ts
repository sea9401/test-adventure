import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { coopBossSessions, messages, users } from "@/db/schema";
import { COOP_BOSSES } from "@/adventure/coop/data";
import type { RegionId } from "@/adventure/data/world";

// 시스템 broadcast 용 가짜 유저 — messages.userId 가 NOT NULL + users.id FK 라
// 시스템 글도 어떤 user row 를 참조해야 함. id="system" 으로 한 번만 INSERT 해
// 두고 spawn 알림에 재사용.
const SYSTEM_USER_ID = "system";
async function ensureSystemUser(): Promise<void> {
  await db
    .insert(users)
    .values({ id: SYSTEM_USER_ID, email: "system@internal" })
    .onConflictDoNothing({ target: users.id });
}

export type CoopRespawnResult = {
  expiredId: string | null;
  spawnedId: string | null;
};

/**
 * 단일 region 의 협동 보스 세션 정리 + 신규 spawn.
 *  1) 만료된 미처치 세션이 있으면 defeatedAt/nextSpawnAt 박아 정리.
 *  2) 활성 세션 없고 마지막 세션의 nextSpawnAt 도달했으면 새 세션 생성 + 시스템 채팅 broadcast.
 *
 * 멱등 — 동시 호출은 partial uniqueIndex(coop_boss_active_region_idx) 가 막음.
 *
 * cron 과 GET 양쪽에서 호출. cron 단독 의존 시 dev 환경(cron 미동작) /
 * Vercel Hobby(cron 1일 1회 강등) 에서 카운트다운이 0 이어도 spawn 이 안 되는
 * 버그가 발생 — GET 에서 한 번 더 실행해 self-healing.
 */
export async function respawnCoopRegion(
  regionId: string,
): Promise<CoopRespawnResult> {
  const def = COOP_BOSSES[regionId as RegionId];
  if (!def) return { expiredId: null, spawnedId: null };

  const now = new Date();
  let expiredId: string | null = null;
  let spawnedId: string | null = null;

  // 1) 만료 처리 — defeatedAt IS NULL && expiresAt < now.
  const expiredRows = await db
    .update(coopBossSessions)
    .set({
      defeatedAt: now,
      nextSpawnAt: new Date(now.getTime() + def.respawnMs),
    })
    .where(
      and(
        isNull(coopBossSessions.defeatedAt),
        lt(coopBossSessions.expiresAt, now),
        eq(coopBossSessions.regionId, regionId),
      ),
    )
    .returning({ id: coopBossSessions.id });
  if (expiredRows[0]) expiredId = expiredRows[0].id;

  // 2) 활성 세션 있으면 spawn 불가.
  const active = await db
    .select({ id: coopBossSessions.id })
    .from(coopBossSessions)
    .where(
      and(
        eq(coopBossSessions.regionId, regionId),
        isNull(coopBossSessions.defeatedAt),
      ),
    )
    .limit(1);
  if (active.length > 0) return { expiredId, spawnedId };

  // 가장 최근 처치/만료 세션의 nextSpawnAt 가 도달했는지.
  const lastDefeated = await db
    .select({ nextSpawnAt: coopBossSessions.nextSpawnAt })
    .from(coopBossSessions)
    .where(eq(coopBossSessions.regionId, regionId))
    .orderBy(sql`${coopBossSessions.spawnedAt} DESC`)
    .limit(1);
  if (lastDefeated.length > 0) {
    const next = lastDefeated[0].nextSpawnAt;
    if (next && next > now) return { expiredId, spawnedId };
  }

  // 새 세션. regenPerMin 이 설정된 월드 보스는 last_regen_at 도 now 로 박아 lazy regen 의 시작점을 잡는다.
  const newId = randomUUID();
  const regenPerMin = def.regenPerMin ?? 0;
  try {
    await db.insert(coopBossSessions).values({
      id: newId,
      regionId,
      bossName: def.monsterName,
      hp: def.maxHp,
      maxHp: def.maxHp,
      spawnedAt: now,
      expiresAt: new Date(now.getTime() + def.expirationMs),
      regenPerMin,
      lastRegenAt: regenPerMin > 0 ? now : null,
    });
    spawnedId = newId;
    // 채팅 broadcast — 부수 효과라 실패해도 spawn 자체는 성공.
    // 월드 보스는 만료 시간 대신 "꾸준히 깎아야 잡힌다" 톤으로 안내.
    const broadcastText = def.isWorldBoss
      ? `${def.monsterName}이(가) 깨어났다. 모든 모험가의 누적 데미지로만 쓰러뜨릴 수 있다.`
      : `${def.monsterName}이(가) 나타났다. 24시간 안에 쓰러뜨려야 한다.`;
    try {
      await ensureSystemUser();
      await db.insert(messages).values({
        userId: SYSTEM_USER_ID,
        name: "시스템",
        className: def.isWorldBoss ? "월드 보스" : "협동 보스",
        title: null,
        content: broadcastText,
      });
    } catch (err) {
      console.warn("[coop] spawn broadcast failed", err);
    }
  } catch {
    // 동시 호출이 이미 spawn 했음 — partial unique 위반. silent skip.
  }

  return { expiredId, spawnedId };
}
