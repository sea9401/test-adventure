import "server-only";
import { randomUUID } from "node:crypto";

// v2 협동 보스 — 세션 공용 헬퍼.
//
// DB 는 v1 협동 인프라(coop_boss_sessions/contributors/attack_log)를 그대로 재사용 —
// regionId 컬럼에 CoopBossKindId("mountain_chief" 등)를 넣는다. v1 COOP_BOSSES(빈 맵)
// 기반 cron(coop-respawn)은 v2 kind id 에 def 가 없어 항상 no-op — 충돌 없음.
//
// 세션 상태 규약(v1 승계):
//   활성   = defeatedAt IS NULL && expiresAt > now
//   처치   = defeatedAt 셋 && hp <= 0   (claim 가능)
//   만료   = defeatedAt 셋 && hp > 0    (소환서 소실 — 보상 없음)
// 만료 처리는 cron 없이 lazy — GET/summon/attack 진입 시 sweep.

import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { coopBossSessions, messages, users } from "@/db/schema";
import type { DbExecutor } from "@/lib/server/savesKv";
import {
  COOP_BOSSES,
  FISHING_COOP_BOSS_KIND_ID,
  MAX_ACTIVE_PER_KIND,
  coopBossDurationMs,
  rollFishingCoopBossSpawn,
} from "@/adventure/data/v2/coopBosses";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";

type TxExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 시스템 broadcast 용 가짜 유저 — messages.userId 가 NOT NULL + users.id FK 라
// 시스템 글도 user row 를 참조해야 함(coopRespawn 과 동일 패턴·같은 id 재사용).
const SYSTEM_USER_ID = "system";
async function ensureSystemUser(): Promise<void> {
  await db
    .insert(users)
    .values({ id: SYSTEM_USER_ID, email: "system@internal" })
    .onConflictDoNothing({ target: users.id });
}

// 협동 보스 채팅 알림 — className "협동 보스" 는 NOTICE_CLASS_NAMES(chat-config)에
// 등재돼 있어 채팅창 알림 탭으로 분리 표시(+새 알림 점). 부수 효과 — 실패해도 본 작업
// (소환 등)은 성공해야 하므로 여기서 삼킨다.
export async function broadcastCoopNotice(content: string): Promise<void> {
  try {
    await ensureSystemUser();
    await db.insert(messages).values({
      userId: SYSTEM_USER_ID,
      name: "시스템",
      className: "협동 보스",
      title: null,
      content,
    });
  } catch (err) {
    console.warn("[coop] notice broadcast failed", err);
  }
}

// 만료된 미처치 세션 정리 — defeatedAt 박아 비활성화(hp > 0 유지 = 만료 표식).
// 멱등·무해(대상 없으면 no-op). 소환 캡(MAX_ACTIVE_PER_KIND) 검사 전에 선행해
// 만료분이 자리를 차지하지 않게 한다.
export async function expireStaleCoopSessions(
  ex: DbExecutor,
  now: Date,
): Promise<void> {
  await ex
    .update(coopBossSessions)
    .set({ defeatedAt: now })
    .where(
      and(
        isNull(coopBossSessions.defeatedAt),
        lt(coopBossSessions.expiresAt, now),
      ),
    );
}

// kind 의 활성 세션 전부 — 같은 종류 동시 다수 소환 허용(#714). 소환 캡 검사·목록용.
export async function findActiveCoopSessions(
  ex: DbExecutor,
  kindId: string,
): Promise<(typeof coopBossSessions.$inferSelect)[]> {
  return ex
    .select()
    .from(coopBossSessions)
    .where(
      and(
        eq(coopBossSessions.regionId, kindId),
        isNull(coopBossSessions.defeatedAt),
      ),
    );
}

export type FishingCoopBossSpawnResult = {
  sessionId: string;
  kind: typeof FISHING_COOP_BOSS_KIND_ID;
  name: string;
  expiresAt: number;
} | null;

export async function trySpawnFishingCoopBoss(
  ex: TxExecutor,
  args: {
    userId: string;
    summonerName: string;
    now: Date;
    rng?: () => number;
  },
): Promise<FishingCoopBossSpawnResult> {
  const rng = args.rng ?? Math.random;
  if (!rollFishingCoopBossSpawn(rng)) return null;

  const kindId = FISHING_COOP_BOSS_KIND_ID;
  const kind = COOP_BOSSES[kindId];
  await expireStaleCoopSessions(ex, args.now);
  const active = await findActiveCoopSessions(ex, kindId);
  if (active.length >= MAX_ACTIVE_PER_KIND) return null;

  const sessionId = randomUUID();
  const expiresAt = new Date(args.now.getTime() + coopBossDurationMs(kind));
  const summonerGuildId = await getGuildId(ex, args.userId);
  await ex.insert(coopBossSessions).values({
    id: sessionId,
    regionId: kindId,
    bossName: kind.name,
    hp: kind.sharedMaxHp,
    maxHp: kind.sharedMaxHp,
    spawnedAt: args.now,
    expiresAt,
    regenPerMin: 0,
    lastRegenAt: null,
    summonedByName: args.summonerName,
    summonerId: args.userId,
    summonerGuildId,
    visibility: "public",
  });
  return {
    sessionId,
    kind: kindId,
    name: kind.name,
    expiresAt: expiresAt.getTime(),
  };
}
