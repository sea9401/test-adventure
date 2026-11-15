import {
  lockSaveForUpdate,
  upsertSave,
  type DbExecutor,
} from "@/lib/server/savesKv";
import {
  applyUniqueEquipmentAcquisitions,
  type UniqueEquipmentAcquisitionEvidence,
} from "@/lib/server/uniqueEquipmentAchievement";

export type AdventureLogSave = {
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
};

export function applyMonsterKill(
  logSave: AdventureLogSave,
  enemyName: string,
  nowMs: number,
): AdventureLogSave {
  const monsters = { ...(logSave.monsters ?? {}) };
  const prevMon = monsters[enemyName];
  monsters[enemyName] = {
    ...prevMon,
    encountered: true,
    kills: (prevMon?.kills ?? 0) + 1,
    firstSeenAt: prevMon?.firstSeenAt ?? nowMs,
    lastKilledAt: nowMs,
  };
  return { ...logSave, monsters };
}

export function applyHuntAdventureProgress(
  logSave: AdventureLogSave,
  enemyName: string,
  nowMs: number,
  uniqueEquipment?: UniqueEquipmentAcquisitionEvidence,
  // 이번 승리로 조건을 채운 칭호(탐사 등급 등). 이미 있는 칭호는 획득 시각을 바꾸지 않는다.
  titleIds: readonly string[] = [],
): AdventureLogSave {
  const killed = withTitles(applyMonsterKill(logSave, enemyName, nowMs), titleIds, nowMs);
  return uniqueEquipment
    ? applyUniqueEquipmentAcquisitions({
        adventureLogRaw: killed,
        ...uniqueEquipment,
      })
    : killed;
}

function withTitles(
  logSave: AdventureLogSave,
  titleIds: readonly string[],
  nowMs: number,
): AdventureLogSave {
  const missing = titleIds.filter((titleId) => !logSave.titles?.[titleId]);
  if (missing.length === 0) return logSave;
  const titles = { ...(logSave.titles ?? {}) };
  for (const titleId of missing) titles[titleId] = { obtainedAt: nowMs };
  return { ...logSave, titles };
}

// 전투수 랭킹용 몬스터 킬 카운터(adventure-log.v2) — 승리 시 서버 권위로 누적.
// /api/rankings 가 monsters[*].kills 를 SUM 해 battleCount 를 낸다. v2 클라는 이 키를
// 안 건드려(hook 없음) 서버 단독 소유 → sync clobber 없음. v1 battleClaim 과 동일 키·키잉.
// ⚠️ lock 순서: character.v2 다음 → proficiency.v2 앞 — 호출 위치가 순서를 지킨다.
export async function recordMonsterKill(
  tx: DbExecutor,
  userId: string,
  enemyName: string,
  nowMs: number,
  uniqueEquipment?: UniqueEquipmentAcquisitionEvidence,
  titleIds: readonly string[] = [],
): Promise<void> {
  const logSave = await lockSaveForUpdate<AdventureLogSave>(
    tx,
    userId,
    "adventure-log.v2",
    {},
  );
  await upsertSave(
    tx,
    userId,
    "adventure-log.v2",
    applyHuntAdventureProgress(logSave, enemyName, nowMs, uniqueEquipment, titleIds),
  );
}
