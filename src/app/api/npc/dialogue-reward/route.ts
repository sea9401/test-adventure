// POST /api/npc/dialogue-reward — NPC 대화 1회성 보상. 서버 권위.
//
// body: { dialogueId: DialogueRewardId }
//
// 흐름:
//   1) auth + session header 강제 (mutation 라우트).
//   2) 트랜잭션 안에서 character.v2 / inventory.v2 / storyFlags.v2 잠금 →
//      DIALOGUE_REWARDS 정의대로 mutate. storyFlag 이미 박혀 있으면 idempotent.
//   3) 새 saves + applied 반환. 클라가 replaceFromSaved.

import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { requireSessionHeader } from "@/lib/server/checkSession";
import { jsonError, jsonOk } from "@/lib/server/jsonResponse";
import {
  DIALOGUE_REWARDS,
  type DialogueRewardId,
} from "@/adventure/data/dialogueRewards";
import {
  DialogueRewardError,
  applyDialogueReward,
  type DialogueRewardOutcome,
} from "@/lib/server/dialogueReward";

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return jsonError("unauthorized", 401);
  const sessionFail = await requireSessionHeader(userId, req);
  if (sessionFail) return sessionFail;

  let body: { dialogueId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError("invalid_json");
  }
  const dialogueId = body.dialogueId;
  if (
    typeof dialogueId !== "string" ||
    !(dialogueId in DIALOGUE_REWARDS)
  ) {
    return jsonError("invalid_dialogue_id");
  }

  try {
    const outcome: DialogueRewardOutcome = await db.transaction((tx) =>
      applyDialogueReward(tx, userId, dialogueId as DialogueRewardId),
    );
    return jsonOk<DialogueRewardOutcome>(outcome);
  } catch (e) {
    if (e instanceof DialogueRewardError) {
      return jsonError(e.code);
    }
    console.error("[dialogue-reward]", e);
    return jsonError("internal_error", 500);
  }
}
