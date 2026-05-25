import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostOccupations, outpostClaimAttempts, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { derivePlayerCombatFromSaves } from "@/lib/server/derivePlayerCombatFromSaves";
import { resolveBattle } from "@/adventure/battle/engine";
import { pickAutoAction } from "@/adventure/battle/pickAutoAction";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import { CLAIM_STAMINA_COST, getChampion } from "@/adventure/data/v2/champions";
import {
  applyRegen,
  parseStaminaFromSave,
  tryConsume,
} from "@/adventure/v2/stamina";
import { applyHpRegen, parseHpRegenSince } from "@/adventure/v2/hpRegen";

// POST /api/v2/outpost/claim — 거점 점령 시도 (1대1 일기토 NPC).
//
// body: { outpostId: string }
//
// 흐름:
//   1. ensureUser → 401
//   2. outpost 찾기 + 검증 (존재·neutral X·이미 자신 점령 X)
//   3. character.v2 잠금 + stamina 회복 + CLAIM_STAMINA_COST(tier) 차감
//   4. derivePlayerCombat
//   5. champion = NPC 영웅 (tier × type)
//   6. hp 회복 적용 후 resolveBattle 단판
//   7. won → outpost_occupations upsert (occupiedByUserId = user)
//   8. log → outpost_claim_attempts
//   9. character.v2 save (stamina + hp + exp/level if won)
//
// 단순화 (후속 PR):
//   - 점령 길드 vs 다른 길드 = 3:3 토너먼트 (지금은 PvP 아예 X — 이미 점령된 거점 시도 시 reject)
//   - 점령 실패 페널티 없음
//   - 챔피언 격파 보상 (점령 자체가 보상)

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { outpostId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.outpostId !== "string" || body.outpostId.length === 0) {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }
  const outpost = OUTPOSTS.find((o) => o.id === body.outpostId);
  if (!outpost) {
    return Response.json({ ok: false, error: "no_such_outpost" }, { status: 400 });
  }
  if (outpost.neutral) {
    return Response.json(
      { ok: false, error: "neutral_not_claimable" },
      { status: 400 },
    );
  }

  const cost = CLAIM_STAMINA_COST[outpost.tier];

  const result = await db.transaction(async (tx) => {
    // 이미 점령 상태 확인
    const occRow = (
      await tx
        .select()
        .from(outpostOccupations)
        .where(eq(outpostOccupations.outpostId, outpost.id))
        .limit(1)
    )[0];

    if (occRow) {
      if (occRow.occupiedByUserId === userId) {
        return {
          ok: false as const,
          status: 400,
          body: { ok: false as const, error: "already_yours" as const },
        };
      }
      // 다른 점령자 — PvP claim 은 후속 PR.
      return {
        ok: false as const,
        status: 400,
        body: {
          ok: false as const,
          error: "already_occupied_by_other" as const,
          occupiedByUserId: occRow.occupiedByUserId,
          occupiedByGuildId: occRow.occupiedByGuildId,
        },
      };
    }

    // character.v2 잠금
    const charSave = await lockSaveForUpdate<{
      stamina?: unknown;
      hp?: number;
      hpRegenSince?: number;
      level?: number;
      exp?: number;
      gold?: number;
      [k: string]: unknown;
    }>(tx, userId, "character.v2", {});

    const now = Date.now();
    const stamina = parseStaminaFromSave(charSave.stamina, now);
    const afterStamina = tryConsume(stamina, cost, now);
    if (!afterStamina) {
      return {
        ok: false as const,
        status: 409,
        body: {
          ok: false as const,
          error: "out_of_stamina" as const,
          requiredStamina: cost,
          stamina: applyRegen(stamina, now),
        },
      };
    }

    const player = await derivePlayerCombatFromSaves(userId, tx);
    if (!player) {
      return {
        ok: false as const,
        status: 400,
        body: { ok: false as const, error: "no_character" as const },
      };
    }

    // hp 회복 적용
    const hpRegen = applyHpRegen(
      Math.max(0, charSave.hp ?? player.maxHp),
      player.maxHp,
      parseHpRegenSince(charSave.hpRegenSince, now),
      now,
    );
    const playerForBattle = { ...player.player, hp: hpRegen.hp };

    const champion = getChampion(outpost.type, outpost.tier);

    // playerName fetch
    const profileRow = await tx
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(
        and(eq(savesKv.userId, userId), eq(savesKv.key, "character-profile.v2")),
      )
      .limit(1);
    const profile = (profileRow[0]?.value ?? null) as { name?: string } | null;
    const playerName = profile?.name?.trim() || "모험가";

    const battle = resolveBattle(playerForBattle, champion, playerName, {
      pickAction: (state) => pickAutoAction(state, { rules: [], potions: {} }),
      potions: {},
    });
    const won = battle.outcome === "win";

    // log attempt
    await tx.insert(outpostClaimAttempts).values({
      outpostId: outpost.id,
      attackerUserId: userId,
      attackerGuildId: null,
      defenderName: champion.name,
      defenderUserId: null,
      won,
      turns: battle.turns,
    });

    // 점령 성공 → occupations 에 행 추가
    let occupation: {
      outpostId: string;
      occupiedByUserId: string;
      occupiedAt: string;
    } | null = null;
    if (won) {
      await tx.insert(outpostOccupations).values({
        outpostId: outpost.id,
        occupiedByUserId: userId,
        occupiedByGuildId: null,
        policy: "open",
        taxRate: "0",
      });
      occupation = {
        outpostId: outpost.id,
        occupiedByUserId: userId,
        occupiedAt: new Date().toISOString(),
      };
    }

    // 사냥 후 hp 적용 (라이브 단판 패턴)
    const afterHp = Math.max(0, battle.finalState.playerHp);

    const next = {
      ...charSave,
      stamina: afterStamina,
      hp: afterHp,
      hpRegenSince: now,
    };
    await upsertSave(tx, userId, "character.v2", next);

    return {
      ok: true as const,
      status: 200,
      body: {
        ok: true as const,
        won,
        championName: champion.name,
        turns: battle.turns,
        stamina: afterStamina,
        hpBefore: hpRegen.hp,
        hpAfter: afterHp,
        maxHp: player.maxHp,
        occupation,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
