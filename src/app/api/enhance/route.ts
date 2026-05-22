// POST /api/enhance — 별빛 무구 인스턴스를 +1 강화 시도. 서버 권위.
//
// body: { instanceId: string, mode: EnhanceMode }
//
// 흐름:
//   1) auth + session
//   2) 트랜잭션 안에서 character.v2 + inventory.v2 잠금 → 모드 검증 → 별빛 조각 + 골드 차감
//      → RNG 굴림 → 성공: 단계 +1, history push / 실패: remainingAttempts -1
//   3) 새 inventory.v2 + character.v2(골드) + toLevel + remainingAttempts + shardsSpent
//      + goldSpent + success + mode 반환.

import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { requireSessionHeader } from "@/lib/server/checkSession";
import { jsonError, jsonOk } from "@/lib/server/jsonResponse";
import {
  ENHANCE_MODE_SPEC,
  type EnhanceMode,
} from "@/adventure/character/enhancement";
import {
  EnhanceError,
  applyEnhanceAction,
  type EnhanceOutcome,
} from "@/lib/server/enhance";

function isEnhanceMode(v: unknown): v is EnhanceMode {
  return typeof v === "string" && v in ENHANCE_MODE_SPEC;
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return jsonError("unauthorized", 401);
  const sessionFail = await requireSessionHeader(userId, req);
  if (sessionFail) return sessionFail;

  let body: { instanceId?: unknown; mode?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError("invalid_json");
  }
  // 길이 상한 — 정상 UUID 는 36자. 위조된 거대 문자열 차단.
  if (
    typeof body.instanceId !== "string" ||
    body.instanceId.length === 0 ||
    body.instanceId.length > 128
  ) {
    return jsonError("invalid_instance_id");
  }
  if (!isEnhanceMode(body.mode)) {
    return jsonError("invalid_mode");
  }
  const instanceId = body.instanceId;
  const mode = body.mode;

  try {
    const outcome: EnhanceOutcome = await db.transaction((tx) =>
      applyEnhanceAction(tx, userId, instanceId, mode),
    );
    return jsonOk<EnhanceOutcome>(outcome);
  } catch (e) {
    if (e instanceof EnhanceError) {
      return jsonError(e.code);
    }
    console.error("[enhance]", e);
    return jsonError("internal_error", 500);
  }
}
