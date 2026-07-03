import { eq } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { applyHpRegen, parseHpRegenSince } from "@/adventure/v2/hpRegen";
import { V2_CORE_LOOP_V2, spendGold } from "@/adventure/data/v2/coreLoopConfig";
import { V2_COMBAT_NUMBER_SCALE } from "@/adventure/data/v2/combatNumberScale";
import {
  V2_SETTLEMENT_WARFARE,
  WAR_VIGOR_FULL_RECOVERY_MS,
  HOTSPRING_VIGOR_RECOVERY_DIVISOR,
} from "@/adventure/data/v2/settlementWarfareConfig";
import { applyVigorRecovery, parseWarVigor } from "@/adventure/data/v2/warVigor";
import { guildHasHotspringAdjacency } from "@/lib/server/tileHotspring";

// POST /api/v2/me/heal — 치료소 만피 회복(항상 무료).
//
// HP/MP 즉시 만피 + 전쟁 건강도(war vigor)는 같은 방문에서 시간누적 회복분만 적용한다
// (즉시 100% 아님 = 전쟁 throttle 의미 유지). 옛 별도 "건강도 회복" 버튼을 이 한 버튼으로 통합.
// HP/MP·건강도가 모두 만충이면 409 already_full (UI 버튼은 disabled 이지만 race 방어).
// 회복 시 hpRegenSince 도 now 로 리셋.

type CharSave = {
  hp?: number;
  mp?: number;
  combatNumberScale?: unknown;
  hpRegenSince?: number;
  gold?: number;
  [k: string]: unknown;
};

export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );

    const player = await derivePlayerCombatV2(userId, tx);
    if (!player) {
      return {
        ok: false as const,
        status: 400,
        body: { ok: false as const, error: "no_character" as const },
      };
    }

    const now = Date.now();
    const maxHp = player.maxHp;
    const maxMp = Math.max(0, player.player.maxMp ?? 0);
    const savedHp = Math.max(0, player.player.hp);
    const savedMp = Math.max(0, charSave.mp ?? maxMp);
    const hpRegenSince = parseHpRegenSince(charSave.hpRegenSince, now);
    const regen = applyHpRegen(savedHp, maxHp, hpRegenSince, now);

    // 전쟁 건강도 — 저장값(회복 미적용) 기준으로 만충 여부 판정. 플래그 off 면 null.
    const vigorBefore = V2_SETTLEMENT_WARFARE
      ? parseWarVigor(charSave.warVigor)
      : null;
    const vigorFull = !vigorBefore || (vigorBefore.hp >= 1 && vigorBefore.mp >= 1);

    // HP/MP 둘 다 풀 + 건강도도 만충이어야 already_full. 하나라도 미달이면 회복 가능.
    if (regen.hp >= maxHp && savedMp >= maxMp && vigorFull) {
      return {
        ok: false as const,
        status: 409,
        body: {
          ok: false as const,
          error: "already_full" as const,
          hp: maxHp,
          maxHp,
          mp: maxMp,
          maxMp,
        },
      };
    }

    const gold = Math.max(0, charSave.gold ?? 0);
    const bankedGold = Math.max(0, Math.floor(Number(charSave.bankedGold) || 0));
    // 치료소 회복은 항상 무료.
    const cost = 0;
    // cost 차감만 은행 우선. cost === 0 이면 no-op(보유·은행 불변).
    const spend = spendGold(gold, bankedGold, cost);

    // 온천 인접 정착지 보유 길드원은 회복 가속(분모÷divisor) — docs §2.3. 플래그 off(vigorBefore
    //   null)면 쿼리 스킵.
    let vigorRecoveryMs = WAR_VIGOR_FULL_RECOVERY_MS;
    if (vigorBefore) {
      const guildRow = (
        await tx
          .select({ id: guildMembers.guildId })
          .from(guildMembers)
          .where(eq(guildMembers.userId, userId))
          .limit(1)
      )[0];
      if (await guildHasHotspringAdjacency(tx, guildRow?.id ?? null)) {
        vigorRecoveryMs =
          WAR_VIGOR_FULL_RECOVERY_MS / HOTSPRING_VIGOR_RECOVERY_DIVISOR;
      }
    }
    // 건강도는 시간누적분만 적용(즉시 만충 아님). 플래그 off 면 미접촉.
    const vigorAfter = vigorBefore
      ? applyVigorRecovery(vigorBefore, now, vigorRecoveryMs)
      : null;

    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      hp: maxHp,
      mp: maxMp,
      combatNumberScale: V2_COMBAT_NUMBER_SCALE,
      hpRegenSince: now,
      gold: spend.gold,
      bankedGold: spend.bankedGold,
      hasHealed: true, // 가이드 퀘스트(회복의 손길) 지표
      ...(vigorAfter ? { warVigor: vigorAfter } : {}),
    });

    return {
      ok: true as const,
      status: 200,
      body: {
        ok: true as const,
        hp: maxHp,
        maxHp,
        mp: maxMp,
        maxMp,
        gold: spend.gold,
        ...(V2_CORE_LOOP_V2 ? { bankedGold: spend.bankedGold } : {}),
        cost,
        ...(vigorAfter ? { warVigor: vigorAfter } : {}),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
