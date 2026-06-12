import "server-only";

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
import { coopBossSessions } from "@/db/schema";
import type { DbExecutor } from "@/lib/server/savesKv";

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
