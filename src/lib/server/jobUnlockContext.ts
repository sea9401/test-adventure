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
import {
  GUIDE_QUESTS_KEY,
  parseClaimed,
} from "@/lib/server/v2QuestContext";
import { readSaves, type DbExecutor } from "@/lib/server/savesKv";
import {
  COOKING_SAVE_KEY,
  cookingLevelForXp,
  parseCookingState,
} from "@/adventure/v2/cooking/state";
import { readJobSpRebalanceState } from "./jobSpRollout";

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
  now = Date.now(),
): Promise<JobUnlockContext> {
  const fallbacks: Record<string, unknown> = {};
  if (CATALOG_USES_QUEST_CONDITION) fallbacks[GUIDE_QUESTS_KEY] = {};
  if (CATALOG_USES_FARMING_LEVEL_CONDITION) fallbacks[FARM_SAVE_KEY] = {};
  if (CATALOG_USES_COOKING_LEVEL_CONDITION) fallbacks[COOKING_SAVE_KEY] = {};
  if (CATALOG_USES_WOODCUTTING_LEVEL_CONDITION) {
    fallbacks[WOODCUTTING_LOG_KEY] = {};
  }
  if (CATALOG_USES_MINING_LEVEL_CONDITION) fallbacks[MINING_LOG_KEY] = {};
  const saves = await readSaves(executor, userId, fallbacks);
  const completedQuestIds = CATALOG_USES_QUEST_CONDITION
    ? parseClaimed(saves[GUIDE_QUESTS_KEY])
    : undefined;
  const farmRaw = CATALOG_USES_FARMING_LEVEL_CONDITION
    ? saves[FARM_SAVE_KEY]
    : undefined;
  const cookingRaw = CATALOG_USES_COOKING_LEVEL_CONDITION
    ? saves[COOKING_SAVE_KEY]
    : undefined;
  const woodcuttingRaw = CATALOG_USES_WOODCUTTING_LEVEL_CONDITION
    ? saves[WOODCUTTING_LOG_KEY]
    : undefined;
  const miningRaw = CATALOG_USES_MINING_LEVEL_CONDITION
    ? saves[MINING_LOG_KEY]
    : undefined;
  const jobSpRebalance = await readJobSpRebalanceState(executor, now);
  return {
    ...jobUnlockContextFromSaves({
      farmRaw,
      cookingRaw,
      woodcuttingRaw,
      miningRaw,
      completedQuestIds,
    }),
    jobSpRebalance,
  };
}
