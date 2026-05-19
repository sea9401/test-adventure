// POST /api/battle/claim-victory — 솔로 전투 승리 보상 (EPIC #3-3 Phase 1).
//
// body: { encounterId, enemyName, finalPlayerHp, playerMaxHp, isBoss }
//
// 흐름:
//   1) auth + session header.
//   2) 트랜잭션: 4 saves 키 (character/inventory/crafting/paragon) FOR UPDATE →
//      deterministic seed RNG 로 드랍 굴림 + EXP/gold 적용 + 재생 룬 → upsert.
//   3) 응답: { ok, enemyName, drops, expGained, goldGained, hpAfterRegen, saves }.
//
// 비-스코프 (클라 잔존): 칭호/스토리플래그/마일스톤 grants, quest progress(recordKill),
// adventureLog 카운터. Phase 2/3 에서 이전.

import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { requireSessionHeader } from "@/lib/server/checkSession";
import { jsonError, jsonOk } from "@/lib/server/jsonResponse";
import {
  applyBattleClaim,
  BattleClaimError,
  type BattleClaimOutcome,
} from "@/lib/server/battleClaim";

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return jsonError("unauthorized", 401);
  const sessionFail = await requireSessionHeader(userId, req);
  if (sessionFail) return sessionFail;

  let body: {
    encounterId?: unknown;
    enemyName?: unknown;
    finalPlayerHp?: unknown;
    playerMaxHp?: unknown;
    isBoss?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError("invalid_json");
  }
  const encounterId = body.encounterId;
  const enemyName = body.enemyName;
  const finalPlayerHp = body.finalPlayerHp;
  const playerMaxHp = body.playerMaxHp;
  const isBoss = body.isBoss;
  if (
    typeof encounterId !== "string" ||
    encounterId.length === 0 ||
    encounterId.length > 64
  ) {
    return jsonError("invalid_encounter_id");
  }
  if (typeof enemyName !== "string" || enemyName.length === 0) {
    return jsonError("invalid_enemy_name");
  }
  if (
    typeof finalPlayerHp !== "number" ||
    !Number.isFinite(finalPlayerHp) ||
    finalPlayerHp < 0
  ) {
    return jsonError("invalid_final_hp");
  }
  if (
    typeof playerMaxHp !== "number" ||
    !Number.isFinite(playerMaxHp) ||
    playerMaxHp <= 0
  ) {
    return jsonError("invalid_max_hp");
  }

  try {
    const outcome: BattleClaimOutcome = await db.transaction((tx) =>
      applyBattleClaim(tx, userId, {
        encounterId,
        enemyName,
        finalPlayerHp,
        playerMaxHp,
        isBoss: isBoss === true,
      }),
    );
    return jsonOk<BattleClaimOutcome>(outcome);
  } catch (e) {
    if (e instanceof BattleClaimError) return jsonError(e.code);
    console.error("[battle/claim-victory]", e);
    return jsonError("internal_error", 500);
  }
}
