import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostOccupations, outpostClaimAttempts, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { derivePlayerCombatFromSaves } from "@/lib/server/derivePlayerCombatFromSaves";
import { resolveBattle } from "@/adventure/battle/engine";
import { resolveBattlePvP } from "@/adventure/battle/engine-pvp";
import { pickAutoAction } from "@/adventure/battle/pickAutoAction";
import { applyStance } from "@/adventure/character/stance";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import { CLAIM_STAMINA_COST, getChampion } from "@/adventure/data/v2/champions";
import { computeNextAttackAt } from "@/adventure/data/v2/npcAttack";
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
    // 이미 점령 상태 확인 — FOR UPDATE 로 lock 해서 PvP 시도 사이 race 직렬화.
    const occRow = (
      await tx
        .select()
        .from(outpostOccupations)
        .where(eq(outpostOccupations.outpostId, outpost.id))
        .for("update")
        .limit(1)
    )[0];

    if (occRow && occRow.occupiedByUserId === userId) {
      return {
        ok: false as const,
        status: 400,
        body: { ok: false as const, error: "already_yours" as const },
      };
    }
    // occRow 있고 자기 점령 아님 → PvP claim (아래 흐름에서 분기).
    const pvpDefenderId =
      occRow && occRow.occupiedByUserId && occRow.occupiedByUserId !== userId
        ? occRow.occupiedByUserId
        : null;

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

    // playerName fetch (공격자)
    const profileRow = await tx
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(
        and(eq(savesKv.userId, userId), eq(savesKv.key, "character-profile.v2")),
      )
      .limit(1);
    const profile = (profileRow[0]?.value ?? null) as { name?: string } | null;
    const playerName = profile?.name?.trim() || "모험가";

    let won: boolean;
    let turns: number;
    let battleFinalPlayerHp: number;
    let defenderLabel: string;
    let defenderUserIdForLog: string | null;
    let pvpFallbackToNpc = false;
    // fallback 후 stale occRow 가 row 처리 분기에 다시 잡히지 않도록.
    // (delete 한 row 가 occRow 에 남아 있어서 UPDATE 분기로 가면 0행 update — silent miss)
    let stillHasOccRow = !!occRow;

    if (pvpDefenderId) {
      // === PvP claim — 점령자 영웅 vs 공격자 영웅 단판 ===
      const defender = await derivePlayerCombatFromSaves(pvpDefenderId, tx);
      if (!defender) {
        // 점령자 캐릭 없음 = stale occupation (saves 손상/유저 삭제 등).
        // row 정리 후 NPC claim 로 fallthrough. ownership 이전이 의미 없는
        // 케이스라 stale row 삭제 + NPC 일기토 흐름.
        await tx
          .delete(outpostOccupations)
          .where(eq(outpostOccupations.outpostId, outpost.id));
        pvpFallbackToNpc = true;
        stillHasOccRow = false;
      } else {
        // 수비자 이름
        const defProfileRow = await tx
          .select({ value: savesKv.value })
          .from(savesKv)
          .where(
            and(
              eq(savesKv.userId, pvpDefenderId),
              eq(savesKv.key, "character-profile.v2"),
            ),
          )
          .limit(1);
        const defProfile = (defProfileRow[0]?.value ?? null) as {
          name?: string;
        } | null;
        defenderLabel = defProfile?.name?.trim() || "수비자";
        defenderUserIdForLog = pvpDefenderId;

        // PvP sim — 수비자는 만피 기준 (사냥 누적 hp 무관, 비동기 자동 방어 정책).
        // 라이브 /api/pvp/challenge 패턴 따라 양측 applyStance (보스/특수전투 보정).
        const attackerStanced = applyStance(playerForBattle, player.selectedStance);
        const defenderStanced = applyStance(
          { ...defender.player, hp: defender.maxHp },
          defender.selectedStance,
        );
        const pvp = resolveBattlePvP(
          attackerStanced,
          defenderStanced,
          playerName,
          defenderLabel,
          {
            pickAction: () => ({ kind: "attack" }),
            potions: { p1: {}, p2: {} },
          },
        );
        won = pvp.outcome === "p1_win";
        turns = pvp.turns;
        battleFinalPlayerHp = pvp.finalState.p1.hp;
      }
    }

    // NPC claim 또는 PvP fallback (수비자 derive 실패)
    if (!pvpDefenderId || pvpFallbackToNpc) {
      const champion = getChampion(outpost.type, outpost.tier);
      defenderLabel = champion.name;
      defenderUserIdForLog = null;
      const battle = resolveBattle(
        playerForBattle,
        champion,
        playerName,
        {
          pickAction: (state) =>
            pickAutoAction(state, { rules: [], potions: {} }),
          potions: {},
        },
      );
      won = battle.outcome === "win";
      turns = battle.turns;
      battleFinalPlayerHp = battle.finalState.playerHp;
    }

    // log attempt
    await tx.insert(outpostClaimAttempts).values({
      outpostId: outpost.id,
      attackerUserId: userId,
      attackerGuildId: null,
      defenderName: defenderLabel!,
      defenderUserId: defenderUserIdForLog!,
      won: won!,
      turns: turns!,
    });

    // 점령 성공 → occupations 처리.
    //   - NPC claim 신규: INSERT (race 시 23505 catch → raceLost)
    //   - PvP claim 인수: UPDATE (점령권 이전, 정책·세율·자원 anchor 리셋)
    let occupation: {
      outpostId: string;
      occupiedByUserId: string;
      occupiedAt: string;
    } | null = null;
    let raceLost = false;
    if (won!) {
      const newOccupiedAt = new Date();
      if (stillHasOccRow) {
        // PvP 인수 — UPDATE
        await tx
          .update(outpostOccupations)
          .set({
            occupiedByUserId: userId,
            occupiedByGuildId: null,
            occupiedAt: newOccupiedAt,
            policy: "open",
            taxRate: "0.100",
            nextAttackAt: computeNextAttackAt(outpost.tier, Date.now()),
            // 자원 anchor 도 리셋 — 옛 점령자가 쌓아둔 시간 공격자가 못 가져감.
            lastHarvestedAt: newOccupiedAt,
          })
          .where(eq(outpostOccupations.outpostId, outpost.id));
        occupation = {
          outpostId: outpost.id,
          occupiedByUserId: userId,
          occupiedAt: newOccupiedAt.toISOString(),
        };
      } else {
        // NPC 신규 claim — INSERT (race 시 catch)
        try {
          await tx.insert(outpostOccupations).values({
            outpostId: outpost.id,
            occupiedByUserId: userId,
            occupiedByGuildId: null,
            policy: "open",
            taxRate: "0.100",
            nextAttackAt: computeNextAttackAt(outpost.tier, Date.now()),
          });
          occupation = {
            outpostId: outpost.id,
            occupiedByUserId: userId,
            occupiedAt: newOccupiedAt.toISOString(),
          };
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code === "23505") {
            raceLost = true;
          } else {
            throw e;
          }
        }
      }
    }

    // 사냥 후 hp 적용 (단판 패턴)
    const afterHp = Math.max(0, battleFinalPlayerHp!);

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
        won: won!,
        raceLost,
        pvp: !!pvpDefenderId && !pvpFallbackToNpc,
        championName: defenderLabel!,
        turns: turns!,
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
