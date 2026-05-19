// POST /api/battle/claim-victory — 솔로 전투 승리 보상 (EPIC #3-3 Phase 1+2).
//
// body: { encounterId, enemyName, finalPlayerHp, playerMaxHp, isBoss,
//         damageTakenThisCombat, potionsConsumedTotal }
//
// 흐름:
//   1) auth + session header.
//   2) 트랜잭션: 6 saves 키 (character/inventory/crafting/paragon/adventure-log/storyFlags)
//      FOR UPDATE → deterministic seed RNG 로 드랍 굴림 + EXP/gold + 재생 룬 → 칭호
//      grants + onDefeatFlag + addKill/noDamageWins + 마일스톤 스킬북 → upsert.
//   3) 응답: { ok, drops, grantedTitleIds, milestones, expGained, ..., saves }.
//
// 비-스코프 (Phase 3): quest progress(recordKill), 패배 페널티, 서버 dedup.

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
    damageTakenThisCombat?: unknown;
    potionsConsumedTotal?: unknown;
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
  const damageTakenThisCombat = body.damageTakenThisCombat;
  const potionsConsumedTotal = body.potionsConsumedTotal;
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
  if (
    typeof damageTakenThisCombat !== "number" ||
    !Number.isFinite(damageTakenThisCombat) ||
    damageTakenThisCombat < 0
  ) {
    return jsonError("invalid_damage_taken");
  }
  if (
    typeof potionsConsumedTotal !== "number" ||
    !Number.isFinite(potionsConsumedTotal) ||
    potionsConsumedTotal < 0
  ) {
    return jsonError("invalid_potions_consumed");
  }

  try {
    const outcome: BattleClaimOutcome = await db.transaction((tx) =>
      applyBattleClaim(tx, userId, {
        encounterId,
        enemyName,
        finalPlayerHp,
        playerMaxHp,
        isBoss: isBoss === true,
        damageTakenThisCombat,
        potionsConsumedTotal,
      }),
    );
    return jsonOk<BattleClaimOutcome>(outcome);
  } catch (e) {
    if (e instanceof BattleClaimError) return jsonError(e.code);
    console.error("[battle/claim-victory]", e);
    return jsonError("internal_error", 500);
  }
}
