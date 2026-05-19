import "server-only";

// 활성 kill / kill_within_hp / no_potion_boss 의뢰 진행을 +1 하는 순수 헬퍼.
// 클라 `useQuests.recordKill` 의 룰을 그대로 미러 — 서버 권위 경로(battleClaim,
// autoHunt) 가 같은 동작을 보장해 클라가 중복 누적할 필요 없게 한다.
//
// ctx 없는 호출(자동 사냥 등)은 조건부 kind 가 진행 안 됨 (의도) — 클라 hook 과 동일.

import {
  QUESTS,
  questTargetTotal,
} from "@/adventure/data/quests";
import {
  defaultQuestEntry,
  type QuestProgressEntry,
  type QuestProgressMap,
} from "@/adventure/quests/storage";

export type KillProgressCtx = {
  hpFraction?: number;
  potionsUsed?: number;
};

export function recordKillIntoProgress(
  progress: QuestProgressMap,
  monsterName: string,
  ctx?: KillProgressCtx,
): { next: QuestProgressMap; readyIds: string[]; changed: boolean } {
  const next: QuestProgressMap = { ...progress };
  const readyIds: string[] = [];
  let changed = false;
  for (const quest of QUESTS) {
    const t = quest.target;
    if (
      t.kind !== "kill" &&
      t.kind !== "kill_within_hp" &&
      t.kind !== "no_potion_boss"
    )
      continue;
    if (t.monsterName !== monsterName) continue;
    if (t.kind === "kill_within_hp" && (ctx?.hpFraction ?? 0) < t.minHpFraction)
      continue;
    if (t.kind === "no_potion_boss" && (ctx?.potionsUsed ?? 0) > 0) continue;
    const entry = next[quest.id] ?? defaultQuestEntry();
    if (entry.state !== "active") continue;
    const total = questTargetTotal(t);
    if (entry.progress >= total) continue;
    const newProgress = entry.progress + 1;
    const newState: QuestProgressEntry["state"] =
      newProgress >= total ? "ready" : "active";
    next[quest.id] = { ...entry, progress: newProgress, state: newState };
    if (newState === "ready") readyIds.push(quest.id);
    changed = true;
  }
  return { next, readyIds, changed };
}
