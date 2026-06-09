import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave } from "@/lib/server/savesKv";
import {
  buildQuestCtx,
  assembleQuestExtras,
  parseClaimed,
  GUIDE_QUESTS_KEY,
} from "@/lib/server/v2QuestContext";
import {
  deriveQuestViews,
  currentGuideQuest,
  questLinesFor,
} from "@/adventure/data/v2/v2Quests";

// GET /api/v2/me/quests — 가이드 퀘스트 현황. 완료 판정은 세이브/DB 파생(읽기 전용, 락 없음).
//   현 직군에게 보이는 라인 + 각 퀘스트 status(claimed/claimable/active/locked) 반환.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [charRaw, proficiencyRaw, advLogRaw, equipmentRaw, guideRaw, extras] =
    await Promise.all([
      readSave(db, userId, "character.v2", {}),
      readSave(db, userId, "proficiency.v2", {}),
      readSave(db, userId, "adventure-log.v2", {}),
      readSave(db, userId, "equipment.v2", {}),
      readSave(db, userId, GUIDE_QUESTS_KEY, {}),
      assembleQuestExtras(db, userId),
    ]);

  const ctx = buildQuestCtx({
    charRaw,
    proficiencyRaw,
    advLogRaw,
    equipmentRaw,
    extras,
  });
  const claimed = parseClaimed(guideRaw);
  const quests = deriveQuestViews(ctx, claimed);
  const current = currentGuideQuest(ctx, claimed);

  return Response.json({
    ok: true,
    lines: questLinesFor(ctx),
    quests,
    current,
  });
}
