import { db } from "@/db";
import { isTutorialLine, questById } from "@/adventure/data/v2/v2Quests";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  GUIDE_QUESTS_KEY,
  guideQuestSavePayload,
  parseClaimed,
} from "@/lib/server/v2QuestContext";

// POST /api/v2/me/quests/track { questId: string | null }
// 진행 중 업적 하나를 메인 목표로 저장한다. null 은 추적 해제.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { questId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const questId = body.questId === null ? null : body.questId;
  if (
    questId !== null &&
    (typeof questId !== "string" || questId.length === 0)
  ) {
    return Response.json({ ok: false, error: "invalid_quest" }, { status: 400 });
  }
  const quest = questId ? questById(questId) : null;
  if (questId && (!quest || isTutorialLine(quest.line))) {
    return Response.json({ ok: false, error: "invalid_quest" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const guideSave = await lockSaveForUpdate<{
      claimed?: unknown;
      trackedQuestId?: unknown;
    }>(tx, userId, GUIDE_QUESTS_KEY, {});
    const claimed = parseClaimed(guideSave);
    if (questId && claimed.has(questId)) {
      return {
        status: 409,
        body: { ok: false as const, error: "already_completed" as const },
      };
    }

    await upsertSave(
      tx,
      userId,
      GUIDE_QUESTS_KEY,
      guideQuestSavePayload(claimed, questId),
    );
    return {
      status: 200,
      body: { ok: true as const, trackedQuestId: questId },
    };
  });

  return Response.json(result.body, { status: result.status });
}
