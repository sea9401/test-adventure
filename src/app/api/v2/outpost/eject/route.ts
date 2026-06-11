import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, outpostOccupations, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { resolveBattlePvP } from "@/adventure/v2/combat/engine-pvp";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import {
  HUNT_COST,
  applyRegen,
  parseStaminaFromSave,
  tryConsume,
} from "@/adventure/v2/stamina";
import { applyHpRegen, parseHpRegenSince } from "@/adventure/v2/hpRegen";
import {
  isIntruderActive,
  parseLastHuntedOutpost,
  type EjectedFrom,
} from "@/adventure/data/v2/intruderTracking";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import { insertFeedEntry } from "@/lib/server/serverFeed";
import { toPvpReplayPayload } from "@/adventure/data/v2/replayPayload";
import { insertNotification } from "@/lib/server/v2Notifications";

// POST /api/v2/outpost/eject — 점령 길드 멤버가 침입자 1v1 토벌.
//
// body: { outpostId, targetUserId }
// 결과:
//   - 승리: 침입자 lastHuntedOutpost 삭제 + ejectedFrom 마킹. 다음 hunt 응답에 surface.
//   - 패배: 도전자만 스태미너/HP 소모, 침입자 변동 X.
// 스태미너 비용 = 사냥 1회와 동일 (HUNT_COST). 토벌은 작은 행위라 placeholder 톤.
//
// lock 순서 (claim 흐름과 정합):
//   1. outpost FOR UPDATE
//   2. getGuildId (viewer)
//   3. character.v2 합집합 사전 정렬 lock

const EJECT_STAMINA_COST = HUNT_COST;

type CharSave = {
  stamina?: unknown;
  hp?: number;
  hpRegenSince?: number;
  lastHuntedOutpost?: unknown;
  ejectedFrom?: unknown;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { outpostId?: unknown; targetUserId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (
    typeof body.outpostId !== "string" ||
    !OUTPOSTS.some((o) => o.id === body.outpostId)
  ) {
    return Response.json({ ok: false, error: "bad_outpost" }, { status: 400 });
  }
  if (typeof body.targetUserId !== "string" || body.targetUserId.length === 0) {
    return Response.json({ ok: false, error: "bad_target" }, { status: 400 });
  }
  if (body.targetUserId === userId) {
    return Response.json({ ok: false, error: "self_target" }, { status: 400 });
  }
  const outpostId = body.outpostId;
  const targetUserId = body.targetUserId;

  const result = await db.transaction(async (tx) => {
    // === 1. outpost FOR UPDATE — 권한 검증 스냅샷 ===
    const occRow = (
      await tx
        .select()
        .from(outpostOccupations)
        .where(eq(outpostOccupations.outpostId, outpostId))
        .for("update")
        .limit(1)
    )[0];
    if (!occRow || occRow.occupiedByGuildId == null) {
      return {
        status: 403,
        body: { ok: false as const, error: "not_occupied" as const },
      };
    }
    const occupyingGuildId = occRow.occupiedByGuildId;

    // === 2. 사냥자 길드 확인 — 무소속이면 점령권한 자체가 없음. ===
    const viewerGuildId = await getGuildId(tx, userId);
    if (viewerGuildId == null || viewerGuildId !== occupyingGuildId) {
      return {
        status: 403,
        body: { ok: false as const, error: "not_owner_guild" as const },
      };
    }

    // 침입자가 같은 길드면 거부 (자기 길드원은 침입자 아님).
    const targetMembership = await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, targetUserId))
      .limit(1);
    if (targetMembership[0]?.guildId === occupyingGuildId) {
      return {
        status: 400,
        body: { ok: false as const, error: "target_same_guild" as const },
      };
    }

    // === 3. character.v2 합집합 사전 정렬 lock ===
    const ids = [userId, targetUserId].sort();
    const first = await lockSaveForUpdate<CharSave>(tx, ids[0], "character.v2", {});
    const second = await lockSaveForUpdate<CharSave>(tx, ids[1], "character.v2", {});
    const [attackerSave, defenderSave]: [CharSave, CharSave] =
      ids[0] === userId ? [first, second] : [second, first];

    // === 4. 침입자 활성 여부 (TTL) ===
    const now = Date.now();
    const targetLast = parseLastHuntedOutpost(defenderSave.lastHuntedOutpost);
    if (!isIntruderActive(targetLast, outpostId, now)) {
      return {
        status: 400,
        body: { ok: false as const, error: "intruder_inactive" as const },
      };
    }

    // === 5. 도전자 stamina 차감 (회복 적용 후) ===
    const stamina = parseStaminaFromSave(attackerSave.stamina, now);
    const afterStamina = tryConsume(stamina, EJECT_STAMINA_COST, now);
    if (!afterStamina) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "out_of_stamina" as const,
          stamina: applyRegen(stamina, now),
          requiredStamina: EJECT_STAMINA_COST,
        },
      };
    }

    // === 6. 양측 PlayerCombat derive ===
    const attackerCombat = await derivePlayerCombatV2(userId, tx);
    const defenderCombat = await derivePlayerCombatV2(targetUserId, tx);
    if (!attackerCombat) {
      return {
        status: 400,
        body: { ok: false as const, error: "no_character" as const },
      };
    }
    if (!defenderCombat) {
      // 침입자 캐릭이 derive 불가 — race(데이터 손상). 침입자 트래킹만 clear.
      const { lastHuntedOutpost: _drop, ...defenderSaveCleared } = defenderSave;
      void _drop;
      await upsertSave(tx, targetUserId, "character.v2", defenderSaveCleared);
      return {
        status: 400,
        body: { ok: false as const, error: "target_unavailable" as const },
      };
    }

    // 도전자 사전 hp 회복 (사냥과 동일 흐름).
    const attackerHpBefore = parseHpRegenSince(attackerSave.hpRegenSince, now);
    const attackerRegen = applyHpRegen(
      Math.max(0, attackerSave.hp ?? attackerCombat.maxHp),
      attackerCombat.maxHp,
      attackerHpBefore,
      now,
    );
    // 침입자 hp 도 회복 적용 — 일기토 진입 시 양측 fair.
    const defenderHpBefore = parseHpRegenSince(defenderSave.hpRegenSince, now);
    const defenderRegen = applyHpRegen(
      Math.max(0, defenderSave.hp ?? defenderCombat.maxHp),
      defenderCombat.maxHp,
      defenderHpBefore,
      now,
    );

    const attackerProfile = await readProfile(tx, userId);
    const attackerName = attackerProfile.name;
    const defenderName = (await readProfile(tx, targetUserId)).name;

    const battleResult = resolveBattlePvP(
      { ...attackerCombat.player, hp: attackerRegen.hp },
      { ...defenderCombat.player, hp: defenderRegen.hp },
      attackerName,
      defenderName,
      { pickAction: () => ({ kind: "attack" }), potions: { p1: {}, p2: {} } },
    );
    const won = battleResult.outcome === "p1_win";
    // 토벌 전투 리플레이 — 토벌자(=나) p1 시점. 결과 카드 아래 BattleScene 표시용.
    const replay = toPvpReplayPayload(battleResult.finalState, defenderName, 200);
    const attackerHpAfter = Math.max(0, battleResult.finalState.p1.hp);
    const defenderHpAfter = Math.max(0, battleResult.finalState.p2.hp);

    // === 7. 도전자 저장 (stamina + hp) ===
    await upsertSave(tx, userId, "character.v2", {
      ...attackerSave,
      stamina: afterStamina,
      hp: attackerHpAfter,
      hpRegenSince: now,
    });

    // === 8. 침입자 저장 — 승리 시 토벌 마킹, 패배 시 hp 만 갱신 ===
    if (won) {
      const ejectedNotice: EjectedFrom = {
        outpostId,
        byGuildId: viewerGuildId,
        at: now,
      };
      // lastHuntedOutpost 는 destructure 로 명시 제거 (undefined 박지 않음).
      const { lastHuntedOutpost: _dropLast, ...defenderSaveWithoutLast } =
        defenderSave;
      void _dropLast;
      await upsertSave(tx, targetUserId, "character.v2", {
        ...defenderSaveWithoutLast,
        hp: defenderHpAfter,
        hpRegenSince: now,
        ejectedFrom: ejectedNotice,
      });
      // 전쟁의 길 퀘 신호 — 토벌 승리 누적. lock 순서: character.v2 다음(hunt 와 동일).
      const logSave = await lockSaveForUpdate<{
        warEjectWins?: unknown;
        [k: string]: unknown;
      }>(tx, userId, "adventure-log.v2", {});
      await upsertSave(tx, userId, "adventure-log.v2", {
        ...logSave,
        warEjectWins: (Number(logSave.warEjectWins) || 0) + 1,
      });
    } else {
      await upsertSave(tx, targetUserId, "character.v2", {
        ...defenderSave,
        hp: defenderHpAfter,
        hpRegenSince: now,
      });
    }

    return {
      status: 200,
      body: {
        ok: true as const,
        won,
        turns: battleResult.turns,
        attackerName,
        defenderName,
        attackerHpBefore: attackerRegen.hp,
        attackerHpAfter,
        attackerMaxHp: attackerCombat.maxHp,
        defenderHpBefore: defenderRegen.hp,
        defenderHpAfter,
        defenderMaxHp: defenderCombat.maxHp,
        stamina: afterStamina,
        replay,
        attackerGender: attackerProfile.gender,
      },
    };
  });

  // 전쟁 피드 — 토벌 성공은 공적 사건(force). tx 커밋 후 부수효과.
  const fb = result.body as {
    ok?: boolean;
    won?: boolean;
    attackerName?: string;
    defenderName?: string;
  };
  if (fb.ok && fb.won) {
    await insertFeedEntry(
      userId,
      "outpost_eject",
      { outpostId, targetName: fb.defenderName ?? "침입자" },
      { force: true },
    );
    // 개인 알림 — 토벌당한 침입자 본인에게 즉시.
    await insertNotification(targetUserId, "ejected", {
      outpostId,
      byName: fb.attackerName ?? "수비대",
    });
  }

  return Response.json(result.body, { status: result.status });
}

async function readProfile(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
): Promise<{ name: string; gender: string }> {
  const row = await tx
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(
      and(eq(savesKv.userId, userId), eq(savesKv.key, "character-profile.v2")),
    )
    .limit(1);
  const profile = (row[0]?.value ?? null) as {
    name?: string;
    gender?: string;
  } | null;
  return {
    name: profile?.name?.trim() || "모험가",
    gender:
      typeof profile?.gender === "string" && profile.gender.length > 0
        ? profile.gender
        : "male1",
  };
}
