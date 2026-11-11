// 겨울 이벤트 주사위 적립용 — 오늘 완료한 일일 퀘스트 수(진행도 ≥ 목표).
//
// 일일 퀘스트에는 개별 수령이 없어서, 퀘스트 화면과 같은 방식으로 완료 수를 다시 계산한다.
// 주기 롤오버를 먼저 확정해야 자정 뒤 첫 조회가 어제 기준선으로 계산되지 않는다.

import { db } from "@/db";
import {
  deriveRepeatBundle,
  parseRepeatSave,
} from "@/adventure/data/v2/v2RepeatQuests";
import { FARM_SAVE_KEY } from "@/adventure/v2/farm";
import { MINING_LOG_KEY } from "@/adventure/v2/miningSession";
import { WOODCUTTING_LOG_KEY } from "@/adventure/v2/woodcuttingSession";
import { readSave } from "@/lib/server/savesKv";
import {
  assembleQuestExtras,
  buildRepeatSignals,
  REPEAT_QUESTS_KEY,
  rolloverRepeatQuestsBeforeProgress,
} from "@/lib/server/v2QuestContext";

export async function countCompletedDailyQuests(
  userId: string,
  now: Date,
): Promise<number> {
  return db.transaction(async (tx) => {
    await rolloverRepeatQuestsBeforeProgress(tx, userId, now);
    const repeatRaw = await readSave<unknown>(tx, userId, REPEAT_QUESTS_KEY, {});
    const advLogRaw = await readSave(tx, userId, "adventure-log.v2", {});
    const farmRaw = await readSave(tx, userId, FARM_SAVE_KEY, {});
    const woodcuttingRaw = await readSave(tx, userId, WOODCUTTING_LOG_KEY, {});
    const miningRaw = await readSave(tx, userId, MINING_LOG_KEY, {});
    const craftingRaw = await readSave(tx, userId, "crafting.v2", {});
    const extras = await assembleQuestExtras(tx, userId);
    const signals = buildRepeatSignals(advLogRaw, extras, {
      farmRaw,
      woodcuttingRaw,
      miningRaw,
      craftingRaw,
    });
    return deriveRepeatBundle(parseRepeatSave(repeatRaw), signals, "daily")
      .completed;
  });
}
