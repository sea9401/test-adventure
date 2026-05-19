// POST /api/quests/claim — 퀘스트 보상 수령. 서버 권위.
//
// body: { questId: string }
//
// 흐름:
//   1) auth + session header 강제 (mutation 라우트).
//   2) 트랜잭션 안에서 character/inventory/storyFlags/adventure-log/quest-progress
//      잠금 → state==='ready' 검사 → 보상 mutate + 사이드이펙트 + state 전환.
//   3) 새 saves + 토큰 + applied 반환. 클라가 replaceFromSaved + 토스트.

import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { requireSessionHeader } from "@/lib/server/checkSession";
import { jsonError, jsonOk } from "@/lib/server/jsonResponse";
import {
  QuestRewardError,
  applyQuestRewardServer,
  type QuestRewardOutcome,
} from "@/lib/server/questReward";

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return jsonError("unauthorized", 401);
  const sessionFail = await requireSessionHeader(userId, req);
  if (sessionFail) return sessionFail;

  let body: { questId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError("invalid_json");
  }
  const questId = body.questId;
  if (typeof questId !== "string" || questId.length === 0) {
    return jsonError("invalid_quest_id");
  }

  try {
    const outcome: QuestRewardOutcome = await db.transaction((tx) =>
      applyQuestRewardServer(tx, userId, questId),
    );
    return jsonOk<QuestRewardOutcome>(outcome);
  } catch (e) {
    if (e instanceof QuestRewardError) {
      return jsonError(e.code);
    }
    console.error("[quests.claim]", e);
    return jsonError("internal_error", 500);
  }
}
