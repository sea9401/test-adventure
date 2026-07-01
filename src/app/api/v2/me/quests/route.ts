import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave, upsertSave } from "@/lib/server/savesKv";
import {
  buildQuestCtx,
  buildRepeatSignals,
  assembleQuestExtras,
  parseClaimed,
  GUIDE_QUESTS_KEY,
  REPEAT_QUESTS_KEY,
} from "@/lib/server/v2QuestContext";
import {
  deriveQuestViews,
  currentGuideQuest,
  questLinesFor,
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

// GET /api/v2/me/quests — 가이드 퀘스트 현황. 완료 판정은 세이브/DB 파생(읽기 전용, 락 없음).
//   현 직군에게 보이는 라인 + 각 퀘스트 status(claimed/claimable/active/locked) 반환.
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
    assembleQuestExtras(db, userId),
  ]);

  const claimed = parseClaimed(guideRaw);
  const retroactiveObtainedAt = Date.now();
  const retroactiveTitleIds = await backfillClaimedQuestTitleRewards(
    userId,
    claimed,
    advLogRaw,
    retroactiveObtainedAt,
  );
  const effectiveAdvLogRaw =
    retroactiveTitleIds.length > 0
      ? addTitlesToAdventureLog(
          advLogRaw,
          retroactiveTitleIds,
          retroactiveObtainedAt,
        )
      : advLogRaw;

  const ctx = buildQuestCtx({
    charRaw,
    proficiencyRaw,
    advLogRaw: effectiveAdvLogRaw,
    equipmentRaw,
    skillsRaw,
    craftingRaw,
    extras,
  });
  const quests = deriveQuestViews(ctx, claimed);
  const current = currentGuideQuest(ctx, claimed);

  // 반복 퀘스트 — lazy 롤오버(주기 키 변경 시 무락 upsert — 동시 호출도 같은 스냅샷이라 무해).
  const now = new Date();
  const signals = buildRepeatSignals(effectiveAdvLogRaw, extras);
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
    repeat: {
      daily: repeatViews.filter((q) => q.scope === "daily"),
      weekly: repeatViews.filter((q) => q.scope === "weekly"),
      dailyResetAt: nextDailyResetAt(now),
      weeklyResetAt: nextWeeklyResetAt(now),
      dailyBundle: deriveRepeatBundle(rolled.save, signals, "daily"),
      weeklyBundle: deriveRepeatBundle(rolled.save, signals, "weekly"),
    },
  });
}
