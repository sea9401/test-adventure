import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave } from "@/lib/server/savesKv";
import {
  buildQuestCtx,
  parseClaimed,
  GUIDE_QUESTS_KEY,
} from "@/lib/server/v2QuestContext";
import {
  deriveQuestViews,
  currentGuideQuest,
  QUEST_LINES,
} from "@/adventure/data/v2/v2Quests";

// GET /api/v2/me/quests — 가이드 퀘스트 현황. 완료 판정은 세이브 파생(읽기 전용, 락 없음).
//   라인 정의 + 각 퀘스트 status(claimed/claimable/active/locked) 반환.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [charRaw, proficiencyRaw, advLogRaw, equipmentRaw, guideRaw] =
    await Promise.all([
      readSave(db, userId, "character.v2", {}),
      readSave(db, userId, "proficiency.v2", {}),
      readSave(db, userId, "adventure-log.v2", {}),
      readSave(db, userId, "equipment.v2", {}),
      readSave(db, userId, GUIDE_QUESTS_KEY, {}),
    ]);

  const ctx = buildQuestCtx({
    charRaw,
    proficiencyRaw,
    advLogRaw,
    equipmentRaw,
  });
  const claimed = parseClaimed(guideRaw);
  const quests = deriveQuestViews(ctx, claimed);
  const current = currentGuideQuest(ctx, claimed);

  return Response.json({ ok: true, lines: QUEST_LINES, quests, current });
}
