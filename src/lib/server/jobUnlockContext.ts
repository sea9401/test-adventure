import {
  CATALOG_USES_FARMING_LEVEL_CONDITION,
  CATALOG_USES_COOKING_LEVEL_CONDITION,
  CATALOG_USES_MINING_LEVEL_CONDITION,
  CATALOG_USES_QUEST_CONDITION,
  CATALOG_USES_WOODCUTTING_LEVEL_CONDITION,
  type JobUnlockContext,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  FARM_SAVE_KEY,
  farmingLevelForState,
  parseFarmState,
} from "@/adventure/v2/farm";
import { woodcuttingProgressionView } from "@/adventure/v2/woodcuttingProgression";
import { miningProgressionView } from "@/adventure/v2/miningProgression";
import {
  MINING_LOG_KEY,
  parseMiningLog,
} from "@/adventure/v2/miningSession";
import {
  WOODCUTTING_LOG_KEY,
  parseWoodcuttingLog,
} from "@/adventure/v2/woodcuttingSession";
import { loadCompletedQuestIds } from "@/lib/server/v2QuestContext";
import { readSave, type DbExecutor } from "@/lib/server/savesKv";
import {
  COOKING_SAVE_KEY,
  cookingLevelForXp,
  parseCookingState,
} from "@/adventure/v2/cooking";

export function jobUnlockContextFromSaves(input: {
  farmRaw?: unknown;
  cookingRaw?: unknown;
  woodcuttingRaw?: unknown;
  miningRaw?: unknown;
  completedQuestIds?: ReadonlySet<string>;
}): JobUnlockContext {
  const woodcuttingLog = CATALOG_USES_WOODCUTTING_LEVEL_CONDITION
    ? parseWoodcuttingLog(input.woodcuttingRaw)
    : null;
  const miningLog = CATALOG_USES_MINING_LEVEL_CONDITION
    ? parseMiningLog(input.miningRaw)
    : null;
  return {
    ...(CATALOG_USES_QUEST_CONDITION && input.completedQuestIds
      ? { completedQuestIds: input.completedQuestIds }
      : {}),
    ...(CATALOG_USES_FARMING_LEVEL_CONDITION
      ? {
          farmingLevel: farmingLevelForState(parseFarmState(input.farmRaw)),
        }
      : {}),
    ...(CATALOG_USES_COOKING_LEVEL_CONDITION
      ? {
          cookingLevel: cookingLevelForXp(
            parseCookingState(input.cookingRaw).xp,
          ),
        }
      : {}),
    ...(woodcuttingLog
      ? {
          woodcuttingLevel: woodcuttingProgressionView(
            woodcuttingLog.cuts,
            woodcuttingLog.xp,
          ).level,
        }
      : {}),
    ...(miningLog
      ? {
          miningLevel: miningProgressionView(
            miningLog.successes,
            miningLog.xp,
          ).level,
        }
      : {}),
  };
}

// SP 예산과 직업 해금 판정은 같은 추가조건 컨텍스트를 사용해야 한다. 화면만 농사·벌목
// 레벨을 반영하고 저장/전투 검증이 생략하면, 표시 SP에는 여유가 있어도 장착이 거절된다.
export async function readJobUnlockContext(
  executor: DbExecutor,
  userId: string,
): Promise<JobUnlockContext> {
  const [completedQuestIds, farmRaw, cookingRaw, woodcuttingRaw, miningRaw] = await Promise.all([
    CATALOG_USES_QUEST_CONDITION
      ? loadCompletedQuestIds(executor, userId)
      : Promise.resolve(undefined),
    CATALOG_USES_FARMING_LEVEL_CONDITION
      ? readSave(executor, userId, FARM_SAVE_KEY, {})
      : Promise.resolve(undefined),
    CATALOG_USES_COOKING_LEVEL_CONDITION
      ? readSave(executor, userId, COOKING_SAVE_KEY, {})
      : Promise.resolve(undefined),
    CATALOG_USES_WOODCUTTING_LEVEL_CONDITION
      ? readSave(executor, userId, WOODCUTTING_LOG_KEY, {})
      : Promise.resolve(undefined),
    CATALOG_USES_MINING_LEVEL_CONDITION
      ? readSave(executor, userId, MINING_LOG_KEY, {})
      : Promise.resolve(undefined),
  ]);
  return jobUnlockContextFromSaves({
    farmRaw,
    cookingRaw,
    woodcuttingRaw,
    miningRaw,
    completedQuestIds,
  });
}
