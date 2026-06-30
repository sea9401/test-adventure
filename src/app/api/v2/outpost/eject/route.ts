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
import {
  V2_CORE_LOOP_V2,
} from "@/adventure/data/v2/coreLoopConfig";
import { applyHpRegen, parseHpRegenSince } from "@/adventure/v2/hpRegen";
import {
  isIntruderActive,
  parseLastHuntedOutpost,
  type EjectedFrom,
} from "@/adventure/data/v2/intruderTracking";
import { nearestNeutralOutpostId } from "@/adventure/data/v2/outposts";
import { insertFeedEntry } from "@/lib/server/serverFeed";
import { toPvpReplayPayload } from "@/adventure/data/v2/replayPayload";
import { insertNotification } from "@/lib/server/v2Notifications";
import { parseWarVigor, vigorAfterBattle } from "@/adventure/data/v2/warVigor";
import { TILE_POS_BY_OUTPOST } from "@/adventure/data/v2/tileConfig";
import {
  isKnownOutpostId,
  parseTileOutpostId,
} from "@/adventure/data/v2/tileWarfare";

// POST /api/v2/outpost/eject — 점령 길드 멤버가 침입자 1v1 토벌.
//
// body: { outpostId, targetUserId }
// 결과:
//   - 승리: 침입자 lastHuntedOutpost 삭제 + ejectedFrom 마킹. 다음 hunt 응답에 surface.
//   - 패배: 도전자만 스태미너/HP 소모, 침입자는 위치 유지 + 전쟁 건강도만 감소.
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
  gold?: number;
  tilePos?: { col?: number; row?: number; at?: number };
  lastBattleAt?: number; // 코어루프 사냥 쿨다운. 토벌은 자기 영지 방어라 쿨다운을 보지 않는다.
  lastVisitedOutpost?: { outpostId?: string; at?: number };
  discoveredOutpostIds?: string[];
  lastHuntedOutpost?: unknown;
  ejectedFrom?: unknown;
  warVigor?: unknown;
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
    !isKnownOutpostId(body.outpostId)
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

    // === 4. 침입자 활성 여부 (사냥 TTL 또는 현재 타일 체류) ===
    const now = Date.now();
    const targetLast = parseLastHuntedOutpost(defenderSave.lastHuntedOutpost);
    const targetTilePos = parseTileOutpostId(outpostId);
    const targetIsPresent =
      targetTilePos != null &&
      defenderSave.tilePos?.col === targetTilePos.col &&
      defenderSave.tilePos?.row === targetTilePos.row;
    if (!targetIsPresent && !isIntruderActive(targetLast, outpostId, now)) {
      return {
        status: 400,
        body: { ok: false as const, error: "intruder_inactive" as const },
      };
    }

    // === 5. 도전자 비용 ===
    // 코어루프 on — 토벌은 자기 영지 방어라 스태미나·전투 쿨다운 없이 즉시 가능.
    // off — 기존 스태미나 차감(무변경).
    const stamina = parseStaminaFromSave(attackerSave.stamina, now);
    let afterStamina = applyRegen(stamina, now);
    if (!V2_CORE_LOOP_V2) {
      const after = tryConsume(stamina, EJECT_STAMINA_COST, now);
      if (!after) {
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
      afterStamina = after;
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
    // 침입자는 일반 HP 대신 전쟁 건강도 기준으로 버틴다. 이기면 추방되지 않고 건강도만 깎인다.
    const defenderVigor = parseWarVigor(defenderSave.warVigor);
    const defenderStartHp = Math.max(
      1,
      Math.floor(defenderCombat.maxHp * defenderVigor.hp),
    );

    const attackerProfile = await readProfile(tx, userId);
    const attackerName = attackerProfile.name;
    const defenderName = (await readProfile(tx, targetUserId)).name;

    const battleResult = resolveBattlePvP(
      { ...attackerCombat.player, hp: attackerRegen.hp },
      { ...defenderCombat.player, hp: defenderStartHp },
      attackerName,
      defenderName,
      { pickAction: () => ({ kind: "attack" }), potions: { p1: {}, p2: {} } },
    );
    const won = battleResult.outcome === "p1_win";
    // 토벌 전투 리플레이 — 토벌자(=나) p1 시점. 결과 카드 아래 BattleScene 표시용.
    const replay = toPvpReplayPayload(battleResult.finalState, defenderName, 200);
    const attackerHpAfter = Math.max(0, battleResult.finalState.p1.hp);
    const defenderHpAfter = Math.max(0, battleResult.finalState.p2.hp);
    const defenderMaxMp = defenderCombat.player.maxMp ?? 0;
    const defenderWarVigorAfter = vigorAfterBattle(
      defenderHpAfter,
      defenderCombat.maxHp,
      battleResult.finalState.p2.mp,
      defenderMaxMp,
      now,
    );

    // 토벌 현상금/추방 — 승리 시 침입자 보유(들고 있는) 골드 전액 압류 → 토벌자에게.
    // 입금분(bankedGold)은 안전 — 은행에 넣어두면 안 뺏긴다. 추가로 침입자를 가장 가까운
    // 중립 자유도시로 추방(위치 강제 이동). 패배 시 0 / 위치 불변.
    const targetGold = Math.max(0, defenderSave.gold ?? 0);
    const bountyGold = won ? targetGold : 0; // 보유 전액.
    const hunterGold = Math.max(0, attackerSave.gold ?? 0);
    const exileToId = won ? nearestNeutralOutpostId(outpostId) : null;

    // === 7. 도전자 저장 (stamina + hp + 현상금) ===
    await upsertSave(tx, userId, "character.v2", {
      ...attackerSave,
      stamina: afterStamina,
      hp: attackerHpAfter,
      hpRegenSince: now,
      gold: hunterGold + bountyGold, // 패배면 bountyGold=0 → 변동 없음.
    });

    // === 8. 침입자 저장 — 승리 시 토벌 마킹+송환, 패배 시 전쟁 건강도만 갱신 ===
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
      // 추방 — 가장 가까운 중립 자유도시로 강제 이동. 발견 목록에도 보장(미발견 허브 방지).
      const exileTarget = exileToId ?? outpostId;
      const exileTilePos = TILE_POS_BY_OUTPOST.get(exileTarget);
      const prevDiscovered = defenderSave.discoveredOutpostIds ?? [];
      const nextDiscovered = prevDiscovered.includes(exileTarget)
        ? prevDiscovered
        : [...prevDiscovered, exileTarget];
      await upsertSave(tx, targetUserId, "character.v2", {
        ...defenderSaveWithoutLast,
        warVigor: defenderWarVigorAfter,
        gold: 0, // 보유 골드 전액 압류(입금분은 안전).
        lastVisitedOutpost: { outpostId: exileTarget, at: now }, // 추방.
        tilePos: exileTilePos
          ? { col: exileTilePos.col, row: exileTilePos.row, at: now }
          : undefined,
        discoveredOutpostIds: nextDiscovered,
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
        warVigor: defenderWarVigorAfter,
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
        defenderHpBefore: defenderStartHp,
        defenderHpAfter,
        defenderMaxHp: defenderCombat.maxHp,
        stamina: afterStamina,
        replay,
        attackerGender: attackerProfile.gender,
        // 토벌 현상금 — 승리 시 침입자 보유 전액 압류분(0이면 침입자 무일푼).
        bountyGold,
        // 추방된 중립 자유도시 id (패배 시 null).
        exiledTo: exileToId,
      },
    };
  });

  // 전쟁 피드 — 토벌 성공은 공적 사건(force). tx 커밋 후 부수효과.
  const fb = result.body as {
    ok?: boolean;
    won?: boolean;
    attackerName?: string;
    defenderName?: string;
    bountyGold?: number;
    exiledTo?: string | null;
  };
  if (fb.ok && fb.won) {
    await insertFeedEntry(
      userId,
      "outpost_eject",
      { outpostId, targetName: fb.defenderName ?? "침입자" }
    );
    // 개인 알림 — 토벌당한 침입자 본인에게 즉시. 압류 골드 + 추방된 곳 동봉.
    await insertNotification(targetUserId, "ejected", {
      outpostId,
      byName: fb.attackerName ?? "수비대",
      gold: fb.bountyGold ?? 0,
      exiledTo: fb.exiledTo ?? undefined,
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
