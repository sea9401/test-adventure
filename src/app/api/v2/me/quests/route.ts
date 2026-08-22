import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave, upsertSave } from "@/lib/server/savesKv";
import {
  buildQuestCtx,
  buildRepeatSignals,
  assembleQuestExtras,
  parseClaimed,
  parseTrackedQuestId,
  GUIDE_QUESTS_KEY,
  REPEAT_QUESTS_KEY,
} from "@/lib/server/v2QuestContext";
import {
  deriveQuestViews,
  currentGuideQuest,
  questLinesFor,
  achievementSummary,
  claimedUniqueEquipmentAcquisitionFloor,
} from "@/adventure/data/v2/v2Quests";
import {
  addTitlesToAdventureLog,
  backfillClaimedQuestTitleRewards,
} from "@/lib/server/questTitleBackfill";
import {
  deriveRepeatBundle,
  deriveRepeatViews,
  nextDailyResetAt,
  nextWeeklyResetAt,
  parseRepeatSave,
  rolloverRepeatSave,
} from "@/adventure/data/v2/v2RepeatQuests";
import {
  FARM_DAILY_QUEST_SEED_POUCH_NAME,
  FARM_DAILY_QUEST_SEED_REWARD,
  FARM_SAVE_KEY,
} from "@/adventure/v2/farm";
import { WOODCUTTING_LOG_KEY } from "@/adventure/v2/woodcuttingSession";
import { MINING_LOG_KEY } from "@/adventure/v2/miningSession";
import { FISHING_PROGRESS_KEY } from "@/adventure/v2/fishingProgression";
import { EQUIPMENT_CODEX_KEY } from "@/adventure/data/v2/equipmentCodex";
import { MASTERY_TOWER_SAVE_KEY } from "@/adventure/data/v2/masteryTower";
import { COOKING_SAVE_KEY } from "@/adventure/v2/cooking/state";
import { LIFE_WORKSHOP_SAVE_KEY } from "@/adventure/v2/lifeWorkshop";
import { LIFE_REQUESTS_SAVE_KEY } from "@/adventure/v2/lifeRequests";
import { LIFE_FIELD_RECORDS_KEY } from "@/adventure/v2/lifeFieldRecords";
import { readLifeFieldFeatureSettings } from "@/lib/server/opsSettings";
import { deriveMonsterHuntCodex } from "@/adventure/data/v2/monsterHuntCodex";
import {
  ensureUniqueEquipmentAcquisitionBaseline,
  persistedUniqueEquipmentAcquired,
  uniqueEquipmentAcquisitionProgress,
} from "@/lib/server/uniqueEquipmentAchievement";

// GET /api/v2/me/quests — 가이드 퀘스트 현황. 완료 판정은 세이브/DB 파생.
//   현 직군에게 보이는 라인 + 각 퀘스트 status(claimed/claimable/active/locked) 반환.
//   레거시 이관·반복 퀘스트 롤오버처럼 멱등인 lazy 보정만 필요할 때 저장한다.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [
    charRaw,
    proficiencyRaw,
    advLogRaw,
    equipmentRaw,
    skillsRaw,
    craftingRaw,
    guideRaw,
    repeatRaw,
    farmRaw,
    woodcuttingRaw,
    miningRaw,
    fishingProgressRaw,
    equipmentCodexRaw,
    masteryTowerRaw,
    cookingRaw,
    lifeWorkshopRaw,
    lifeRequestsRaw,
    lifeFieldRecordsRaw,
    lifeFieldFeatures,
    extras,
  ] = await Promise.all([
    readSave(db, userId, "character.v2", {}),
    readSave(db, userId, "proficiency.v2", {}),
    readSave(db, userId, "adventure-log.v2", {}),
    readSave(db, userId, "equipment.v2", {}),
    readSave(db, userId, "skills.v2", {}),
    readSave(db, userId, "crafting.v2", {}),
    readSave(db, userId, GUIDE_QUESTS_KEY, {}),
    readSave(db, userId, REPEAT_QUESTS_KEY, {}),
    readSave(db, userId, FARM_SAVE_KEY, {}),
    readSave(db, userId, WOODCUTTING_LOG_KEY, {}),
    readSave(db, userId, MINING_LOG_KEY, {}),
    readSave(db, userId, FISHING_PROGRESS_KEY, {}),
    readSave(db, userId, EQUIPMENT_CODEX_KEY, {}),
    readSave(db, userId, MASTERY_TOWER_SAVE_KEY, {}),
    readSave(db, userId, COOKING_SAVE_KEY, {}),
    readSave(db, userId, LIFE_WORKSHOP_SAVE_KEY, {}),
    readSave(db, userId, LIFE_REQUESTS_SAVE_KEY, {}),
    readSave(db, userId, LIFE_FIELD_RECORDS_KEY, {}),
    readLifeFieldFeatureSettings(),
    assembleQuestExtras(db, userId),
  ]);

  const claimed = parseClaimed(guideRaw);
  const uniqueAcquiredFloor = claimedUniqueEquipmentAcquisitionFloor(claimed);
  const savedTrackedQuestId = parseTrackedQuestId(guideRaw);
  const retroactiveObtainedAt = Date.now();
  const retroactiveTitleIds = await backfillClaimedQuestTitleRewards(
    userId,
    claimed,
    advLogRaw,
    retroactiveObtainedAt,
  );
  let effectiveAdvLogRaw =
    retroactiveTitleIds.length > 0
      ? addTitlesToAdventureLog(
          advLogRaw,
          retroactiveTitleIds,
          retroactiveObtainedAt,
        )
      : advLogRaw;

  // 보유량 기반이던 레거시 진행도를 누적 획득 시작값으로 한 번만 이관한다. 현재 인벤토리,
  // 유니크 도감, 이미 수령한 단계 중 가장 높은 증거를 사용해 판매·분해 후에도 내려가지 않는다.
  const uniqueBaseline = uniqueEquipmentAcquisitionProgress({
    adventureLogRaw: effectiveAdvLogRaw,
    equipmentRaw,
    equipmentCodexRaw,
    minimum: uniqueAcquiredFloor,
  });
  if (uniqueBaseline > persistedUniqueEquipmentAcquired(effectiveAdvLogRaw)) {
    effectiveAdvLogRaw = await ensureUniqueEquipmentAcquisitionBaseline({
      executor: db,
      userId,
      equipmentRaw,
      equipmentCodexRaw,
      minimum: uniqueAcquiredFloor,
    });
  }

  const ctx = buildQuestCtx({
    charRaw,
    proficiencyRaw,
    advLogRaw: effectiveAdvLogRaw,
    equipmentRaw,
    skillsRaw,
    craftingRaw,
    farmRaw,
    woodcuttingRaw,
    miningRaw,
    fishingProgressRaw,
    equipmentCodexRaw,
    masteryTowerRaw,
    cookingRaw,
    lifeWorkshopRaw,
    lifeRequestsRaw,
    lifeFieldRecordsRaw,
    lifeFieldMilestonesEnabled: lifeFieldFeatures.milestonesEnabled,
    uniqueAcquiredFloor,
    extras,
  });
  const quests = deriveQuestViews(ctx, claimed);
  const current = currentGuideQuest(ctx, claimed, savedTrackedQuestId);
  const trackedQuestId =
    current?.id === savedTrackedQuestId ? savedTrackedQuestId : null;

  // 반복 퀘스트 — lazy 롤오버(주기 키 변경 시 무락 upsert — 동시 호출도 같은 스냅샷이라 무해).
  const now = new Date();
  const signals = buildRepeatSignals(effectiveAdvLogRaw, extras, {
    farmRaw,
    woodcuttingRaw,
    miningRaw,
    craftingRaw,
  });
  const rolled = rolloverRepeatSave(parseRepeatSave(repeatRaw), now, signals);
  if (rolled.changed) {
    await upsertSave(db, userId, REPEAT_QUESTS_KEY, rolled.save);
  }
  const repeatViews = deriveRepeatViews(rolled.save, signals);

  return Response.json({
    ok: true,
    lines: questLinesFor(ctx),
    quests,
    current,
    trackedQuestId,
    achievementSummary: achievementSummary(ctx, claimed),
    monsterCodex: deriveMonsterHuntCodex(effectiveAdvLogRaw),
    repeat: {
      daily: repeatViews.filter((q) => q.scope === "daily"),
      weekly: repeatViews.filter((q) => q.scope === "weekly"),
      dailyResetAt: nextDailyResetAt(now),
      weeklyResetAt: nextWeeklyResetAt(now),
      dailyBundle: {
        ...deriveRepeatBundle(rolled.save, signals, "daily"),
        seedPouch: {
          name: FARM_DAILY_QUEST_SEED_POUCH_NAME,
          seeds: FARM_DAILY_QUEST_SEED_REWARD,
        },
      },
      weeklyBundle: deriveRepeatBundle(rolled.save, signals, "weekly"),
    },
  });
}
