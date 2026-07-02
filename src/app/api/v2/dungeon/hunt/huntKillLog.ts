import {
  lockSaveForUpdate,
  upsertSave,
  type DbExecutor,
} from "@/lib/server/savesKv";

// 전투수 랭킹용 몬스터 킬 카운터(adventure-log.v2) — 승리 시 서버 권위로 누적.
// /api/rankings 가 monsters[*].kills 를 SUM 해 battleCount 를 낸다. v2 클라는 이 키를
// 안 건드려(hook 없음) 서버 단독 소유 → sync clobber 없음. v1 battleClaim 과 동일 키·키잉.
// ⚠️ lock 순서: character.v2 다음 → proficiency.v2 앞 — 호출 위치가 순서를 지킨다.
export async function recordMonsterKill(
  tx: DbExecutor,
  userId: string,
  enemyName: string,
  nowMs: number,
): Promise<void> {
  const logSave = await lockSaveForUpdate<{
    monsters?: Record<
      string,
      {
        encountered?: boolean;
        kills?: number;
        firstSeenAt?: number;
        lastKilledAt?: number;
      }
    >;
    titles?: Record<string, { obtainedAt: number }>;
    [k: string]: unknown;
  }>(tx, userId, "adventure-log.v2", {});
  const monsters = { ...(logSave.monsters ?? {}) };
  const prevMon = monsters[enemyName];
  monsters[enemyName] = {
    ...prevMon,
    encountered: true,
    kills: (prevMon?.kills ?? 0) + 1,
    firstSeenAt: prevMon?.firstSeenAt ?? nowMs,
    lastKilledAt: nowMs,
  };
  await upsertSave(tx, userId, "adventure-log.v2", {
    ...logSave,
    monsters,
  });
}
