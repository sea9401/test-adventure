// POST /api/enchant — 별빛 무구에 마법부여 한 슬롯 부여. 서버 권위.
//
// body: { instanceId: string, materialId: string }
//
// 흐름:
//   1) auth + session
//   2) 트랜잭션 안에서 inventory.v2 잠금 → affix·자루 검증 → 부여서 -1 → RNG value 롤 → 슬롯 push
//   3) 새 inventory.v2 + slot(affixId·value) + itemId 반환 → 클라가 replace + 토스트.

import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { requireSessionHeader } from "@/lib/server/checkSession";
import { jsonError, jsonOk } from "@/lib/server/jsonResponse";
import {
  EnchantError,
  applyEnchantAction,
  type EnchantOutcome,
} from "@/lib/server/enchant";

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return jsonError("unauthorized", 401);
  const sessionFail = await requireSessionHeader(userId, req);
  if (sessionFail) return sessionFail;

  let body: { instanceId?: unknown; materialId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError("invalid_json");
  }
  // 길이 상한 — 정상 UUID 36자, materialId 는 enchant_<id> 컨벤션. 위조된 거대 문자열 차단.
  if (
    typeof body.instanceId !== "string" ||
    body.instanceId.length === 0 ||
    body.instanceId.length > 128
  ) {
    return jsonError("invalid_instance_id");
  }
  if (
    typeof body.materialId !== "string" ||
    body.materialId.length === 0 ||
    body.materialId.length > 64
  ) {
    return jsonError("invalid_material_id");
  }
  const instanceId = body.instanceId;
  const materialId = body.materialId;

  try {
    const outcome: EnchantOutcome = await db.transaction((tx) =>
      applyEnchantAction(tx, userId, instanceId, materialId),
    );
    return jsonOk<EnchantOutcome>(outcome);
  } catch (e) {
    if (e instanceof EnchantError) {
      return jsonError(e.code);
    }
    console.error("[enchant]", e);
    return jsonError("internal_error", 500);
  }
}
