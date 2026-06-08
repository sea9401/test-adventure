import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  guildMembers,
  outpostOccupations,
  outpostClaimAttempts,
  savesKv,
  v2GuildResources,
} from "@/db/schema";
import { readGuildResources } from "@/lib/server/v2GuildResources";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { resolveBattle } from "@/adventure/v2/combat/engine";
import { resolveBattlePvP } from "@/adventure/v2/combat/engine-pvp";
import { pickAutoAction } from "@/adventure/v2/combat/pickAutoAction";
import { applyStance } from "@/adventure/character/stance";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import {
  fetchLineupCandidates,
  runTournamentForGuilds,
} from "@/lib/server/v2RunTournament";
// PR-7: 병사 시스템 폐기 — applySoldierBoost/simulateTroopBattle/computePlunder 제거.
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import { outpostDefensePower } from "@/adventure/data/v2/outpostDefense";
import { derivePowerScore } from "@/adventure/data/v2/power";
import {
  FORT_MAX_HP,
  SIEGE_DAMAGE_PER_WIN,
  POST_CAPTURE_PROTECT_MS,
  REPAIR_GOLD_PER_HP,
  currentFortHp,
  isOutpostProtected,
  repairHpFromGold,
} from "@/adventure/data/v2/outpostSiege";
import { canClaimOutpost } from "@/adventure/data/v2/supplyLine";
import { CLAIM_STAMINA_COST, getChampion } from "@/adventure/data/v2/champions";
import { computeNextAttackAt } from "@/adventure/data/v2/npcAttack";
import {
  applyRegen,
  parseStaminaFromSave,
  tryConsume,
} from "@/adventure/v2/stamina";
import {
  applyHpRegen,
  canHuntWithHp,
  parseHpRegenSince,
} from "@/adventure/v2/hpRegen";
import {
  toReplayPayload,
  toPvpReplayPayload,
  type ReplayPayload,
} from "@/adventure/data/v2/replayPayload";

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
    // lock 순서 — occupations FOR UPDATE 가 항상 먼저. 그 후 길드 조회.
    const occRow = (
      await tx
        .select()
        .from(outpostOccupations)
        .where(eq(outpostOccupations.outpostId, outpost.id))
        .for("update")
        .limit(1)
    )[0];

    // 공격자 길드 필수 — 무소속은 점령 불가.
    const attackerGuildId = await getGuildId(tx, userId);
    if (attackerGuildId == null) {
      return {
        ok: false as const,
        status: 400,
        body: { ok: false as const, error: "no_guild" as const },
      };
    }

    // defender 측 — occupiedByGuildId 만 사용. 자동 솔로 길드 백필 없음.
    const defenderGuildId: number | null = occRow?.occupiedByGuildId ?? null;

    // 같은 길드 (자기 길드 점령) → 모집 거부.
    if (defenderGuildId !== null && defenderGuildId === attackerGuildId) {
      return {
        ok: false as const,
        status: 400,
        body: { ok: false as const, error: "already_yours" as const },
      };
    }

    // 보급선 게이트 — target 은 우리 길드가 이미 소유한 거점이나 중립 자유도시에 인접해야
    // 점령 가능(영토 연속성). 우리 길드 소유 거점 목록을 읽어 인접 판정.
    const ownedRows = await tx
      .select({ outpostId: outpostOccupations.outpostId })
      .from(outpostOccupations)
      .where(eq(outpostOccupations.occupiedByGuildId, attackerGuildId));
    if (
      !canClaimOutpost(
        outpost.id,
        ownedRows.map((r) => r.outpostId),
      )
    ) {
      return {
        ok: false as const,
        status: 400,
        body: { ok: false as const, error: "no_supply_line" as const },
      };
    }

    // PvP defender 유저 — 같은 길드 아니고 occupiedByUserId 있으면.
    // 1인 길드 가정에서는 곧 occupiedByUserId 가 그 길드의 마스터. 다인 길드
    // 토너먼트는 라인업 멤버들의 character.v2 도 사전 정렬 lock 안에 포함.
    const pvpDefenderId =
      occRow && occRow.occupiedByUserId && occRow.occupiedByUserId !== userId
        ? occRow.occupiedByUserId
        : null;

    const now = Date.now();

    // 공성 보호막 — 함락 직후 일정 시간 재공성 불가(핑퐁 방지). stamina 소모 전 early return.
    //   단, 점령자 캐릭이 없는 stale 점령은 막지 않는다(아래 PvP fallback 이 row 삭제 후 NPC
    //   claim 으로 정리 — 빈 거점이 보호막 동안 잠기는 것 방지). live 체크는 보호막 거점만(드묾).
    if (occRow && isOutpostProtected(occRow.protectedUntil, new Date(now))) {
      const occupierLive =
        occRow.occupiedByUserId != null &&
        (
          await tx
            .select({ k: savesKv.key })
            .from(savesKv)
            .where(
              and(
                eq(savesKv.userId, occRow.occupiedByUserId),
                eq(savesKv.key, "character.v2"),
              ),
            )
            .limit(1)
        ).length > 0;
      if (occupierLive) {
        return {
          ok: false as const,
          status: 409,
          body: {
            ok: false as const,
            error: "protected" as const,
            protectedUntil: occRow.protectedUntil.toISOString(),
          },
        };
      }
    }

    // === stamina pre-check (lock 없이 read) ===
    // 락 전 빠른 거부. 부족 시 사전 정렬 lock 안 잡고 early return.
    // 실제 차감은 lock 후 다시 check (race 안전).
    const charPreRow = (
      await tx
        .select({ value: savesKv.value })
        .from(savesKv)
        .where(
          and(eq(savesKv.userId, userId), eq(savesKv.key, "character.v2")),
        )
        .limit(1)
    )[0];
    const charPre = (charPreRow?.value ?? {}) as { stamina?: unknown };
    const staminaPre = parseStaminaFromSave(charPre.stamina, now);
    if (!tryConsume(staminaPre, cost, now)) {
      return {
        ok: false as const,
        status: 409,
        body: {
          ok: false as const,
          error: "out_of_stamina" as const,
          requiredStamina: cost,
          stamina: applyRegen(staminaPre, now),
        },
      };
    }

    // === 토너먼트 사전 결정 (PvP 시 양측 멤버 수) ===
    let useTournament = false;
    let attackerLineupIds: string[] = [];
    let defenderLineupIds: string[] = [];
    if (pvpDefenderId && defenderGuildId !== null) {
      const [aMembers, dMembers] = await Promise.all([
        tx
          .select({ userId: guildMembers.userId })
          .from(guildMembers)
          .where(eq(guildMembers.guildId, attackerGuildId)),
        tx
          .select({ userId: guildMembers.userId })
          .from(guildMembers)
          .where(eq(guildMembers.guildId, defenderGuildId)),
      ]);
      useTournament = aMembers.length >= 2 && dMembers.length >= 2;
      if (useTournament) {
        [attackerLineupIds, defenderLineupIds] = await Promise.all([
          fetchLineupCandidates(tx, attackerGuildId),
          fetchLineupCandidates(tx, defenderGuildId),
        ]);
      }
    }

    // === character.v2 합집합 사전 정렬 lock ===
    // 모든 관련 userId — attacker, defender (PvP), 토너먼트 라인업 멤버 (양측).
    // 사전 정렬 → cross-tx 데드락 회피.
    const charLockIds = Array.from(
      new Set([
        userId,
        ...(pvpDefenderId ? [pvpDefenderId] : []),
        ...attackerLineupIds,
        ...defenderLineupIds,
      ]),
    ).sort();
    for (const id of charLockIds) {
      await lockSaveForUpdate<unknown>(tx, id, "character.v2", {});
    }

    // === attacker char.v2 lock 된 상태에서 read + stamina 재check + 차감 ===
    const charSave = await lockSaveForUpdate<{
      stamina?: unknown;
      hp?: number;
      hpRegenSince?: number;
      level?: number;
      exp?: number;
      gold?: number;
      [k: string]: unknown;
    }>(tx, userId, "character.v2", {});
    const stamina = parseStaminaFromSave(charSave.stamina, now);
    const afterStamina = tryConsume(stamina, cost, now);
    if (!afterStamina) {
      // race — pre-check 후 다른 tx 가 차감. lock 후 정확.
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

    const player = await derivePlayerCombatV2(userId, tx);
    if (!player) {
      return {
        ok: false as const,
        status: 400,
        body: { ok: false as const, error: "no_character" as const },
      };
    }

    // hp 회복 + 병사 보정 적용
    const hpRegen = applyHpRegen(
      Math.max(0, charSave.hp ?? player.maxHp),
      player.maxHp,
      parseHpRegenSince(charSave.hpRegenSince, now),
      now,
    );
    // PR-7: 병사 시스템 폐기 — applySoldierBoost 제거.
    const playerForBattle = { ...player.player, hp: hpRegen.hp };

    // 체력 부족(최대치 5% 미만) 상태에선 거점 사냥/점령 시도 불가 — 스태미나 미소모 +
    // hpRegenSince 미리셋. 일반 던전 사냥과 동일 기준(canHuntWithHp)으로 회복돼야 다시 시도 가능.
    if (!canHuntWithHp(hpRegen.hp, player.maxHp)) {
      return {
        ok: false as const,
        status: 409,
        body: {
          ok: false as const,
          error: "hp_zero" as const,
          stamina: applyRegen(stamina, now),
        },
      };
    }

    // 수비 전투력 게이트 — 왕국 소속 거점은 거리 비례 수비 전투력(중심 5000 → 외곽 1500).
    //   내 합성 전투력(derivePowerScore)이 그에 못 미치면 점령 시도 불가. upsert 전 early
    //   return 이라 스태미나 미소모. 중립·분쟁지대(defense 0)는 게이트 없음 — 기존 난이도.
    const outpostDefense = outpostDefensePower(outpost);
    if (outpostDefense > 0) {
      // state 라우트의 combat.power 와 동일 입력(= 화면 "내 전투력")으로 계산해 일치 보장.
      const myPower = derivePowerScore({
        atk: player.player.atk,
        magicAtk: player.player.magicAtk ?? 0,
        def: player.player.def,
        spd: player.player.spd,
        maxHp: player.maxHp,
        maxMp: player.player.maxMp,
      });
      if (myPower < outpostDefense) {
        return {
          ok: false as const,
          status: 409,
          body: {
            ok: false as const,
            error: "insufficient_power" as const,
            requiredPower: outpostDefense,
            playerPower: myPower,
            stamina: applyRegen(stamina, now),
          },
        };
      }
    }

    // playerName fetch (공격자)
    const profileRow = await tx
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(
        and(eq(savesKv.userId, userId), eq(savesKv.key, "character-profile.v2")),
      )
      .limit(1);
    const profile = (profileRow[0]?.value ?? null) as {
      name?: string;
      gender?: string;
    } | null;
    const playerName = profile?.name?.trim() || "모험가";
    const playerGender =
      typeof profile?.gender === "string" && profile.gender.length > 0
        ? profile.gender
        : "male1";

    let won: boolean;
    let turns: number;
    let battleFinalPlayerHp: number;
    // 전투 리플레이 — 사냥/아레나와 동일한 ReplayBattleScene 으로 표시(나=p1 관점).
    // NPC 일기토 + PvP 1v1 모두 생성. 다인 길드 3:3 토너먼트는 단일 finalState 가 없어
    // null → 카드가 매치별 텍스트 요약으로 폴백.
    let replay: ReplayPayload | null = null;
    let defenderLabel: string;
    let defenderUserIdForLog: string | null;
    let pvpFallbackToNpc = false;
    // fallback 후 stale occRow 가 row 처리 분기에 다시 잡히지 않도록.
    // (delete 한 row 가 occRow 에 남아 있어서 UPDATE 분기로 가면 0행 update — silent miss)
    let stillHasOccRow = !!occRow;
    // PR-7: 본 병사 전쟁 폐기 — troopBattle/plunderStone 제거.
    let duelWonByAttacker: boolean | null = null;
    // 다인 길드 토너먼트 결과 (양측 모두 멤버 2+ 인 경우). 아니면 null.
    let tournamentSummary: {
      matches: {
        attackerName: string;
        defenderName: string;
        winnerSide: "attacker" | "defender";
        turns: number;
      }[];
      attackerLineupCount: number;
      defenderLineupCount: number;
    } | null = null;

    if (pvpDefenderId) {
      // === PvP claim — 영웅 일기토 + 본 병사 전쟁 ===
      const defender = await derivePlayerCombatV2(pvpDefenderId, tx);
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

        // 1단계 — 사전 단계에서 결정된 useTournament 분기.
        if (useTournament) {
          // === 다인 길드 vs 다인 길드 — 3:3 토너먼트 (왕좌 모드) ===
          // 영웅 raw stat sim (병사 보정 X — 본 전쟁이 병사 layer).
          // 사전 단계에서 잠근 lineup ids 를 그대로 helper 에 전달
          // (lineup row stale race 후 lock 밖 멤버 read 차단).
          const t = await runTournamentForGuilds(
            tx,
            attackerLineupIds,
            defenderLineupIds,
          );
          duelWonByAttacker = t.result.attackerWon;
          turns = t.result.matches.reduce((s, m) => s + m.turns, 0);
          battleFinalPlayerHp = hpRegen.hp;
          tournamentSummary = {
            matches: t.result.matches.map((m) => ({
              attackerName: m.attackerName,
              defenderName: m.defenderName,
              winnerSide: m.winnerSide,
              turns: m.turns,
            })),
            attackerLineupCount: t.attackerLineupCount,
            defenderLineupCount: t.defenderLineupCount,
          };
        } else {
          // === 1인 길드 vs 1인 길드 — 영웅 일기토 ===
          // PR-7: 병사 시스템 폐기 — 일기토에 병사 보정 제거 (applySoldierBoost X).
          const attackerStanced = applyStance(
            playerForBattle,
            player.selectedStance,
          );
          const defenderBase = { ...defender.player, hp: defender.maxHp };
          const defenderStanced = applyStance(
            defenderBase,
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
          duelWonByAttacker = pvp.outcome === "p1_win";
          turns = pvp.turns;
          battleFinalPlayerHp = pvp.finalState.p1.hp;
          // PvP 일기토 리플레이(나=p1·상대=수비자). 승패 무관 — 전투 진행을 로그로 표시.
          replay = toPvpReplayPayload(pvp.finalState, defenderLabel, 200);
        }

        // PR-7: 본 병사 전쟁 폐기 — 점령권은 영웅(일기토/토너먼트) 결과로 결정.
        won = duelWonByAttacker;
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
      replay = toReplayPayload(battle.finalState, 200);
    }

    // log attempt
    await tx.insert(outpostClaimAttempts).values({
      outpostId: outpost.id,
      attackerUserId: userId,
      attackerGuildId,
      defenderName: defenderLabel!,
      defenderUserId: defenderUserIdForLog!,
      won: won!,
      turns: turns!,
    });

    // 점령/공성 처리 (docs/v2-outpost-siege-plan.md).
    //   - 비점령(NPC) 신규: INSERT — 단판(승리 즉시 점령). race 시 23505 → raceLost.
    //   - 점령된 거점(다른 길드): 공성 — 승리 시 성벽 깎기. 0 이하면 함락(소유권 이전 +
    //     성벽 풀충전 + 보호막). 아니면 성벽만 줄고 소유권 유지.
    let occupation: {
      outpostId: string;
      occupiedByUserId: string;
      occupiedByGuildId: number;
      occupiedAt: string;
    } | null = null;
    let raceLost = false;
    // 응답용 성벽 상태 — 점령된 거점이면 재생 반영 현재값, 비점령이면 풀성벽(표시용).
    const fortMaxHp = occRow?.fortMaxHp ?? FORT_MAX_HP;
    let fortHpAfter = occRow
      ? currentFortHp(occRow.fortHp, fortMaxHp, occRow.fortUpdatedAt, new Date(now))
      : FORT_MAX_HP;
    let captured = false;
    let repairedHp = 0;
    let repairGoldSpent = 0;
    if (won!) {
      const newOccupiedAt = new Date();
      if (stillHasOccRow) {
        // 길드 금고 자동 수리(B안) — 데미지 전, 수비 길드 금고 골드로 결손분 보강.
        //   원자적 조건부 차감(WHERE gold>=cost). 금고가 한도라 마르면 함락.
        //   race 로 차감 실패 시 이번 타격은 수리 없음(드묾·음수잔액 불가).
        //   🔒 락순서: guild_resources 는 이 tx 의 occupation+character.v2 락 이후 마지막에만
        //   건드린다. treasury/claim 도 guild_resources 를 character.v2 이후 마지막에 잡고
        //   eject 는 안 건드림 → occupation→character→guild_resources 단일 순서, 사이클 없음.
        if (defenderGuildId != null && fortHpAfter < fortMaxHp) {
          const guildGold = (await readGuildResources(tx, defenderGuildId)).gold;
          const hp = repairHpFromGold(fortMaxHp - fortHpAfter, guildGold);
          if (hp > 0) {
            const cost = hp * REPAIR_GOLD_PER_HP;
            const deducted = await tx
              .update(v2GuildResources)
              .set({
                gold: sql`${v2GuildResources.gold} - ${cost}`,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(v2GuildResources.guildId, defenderGuildId),
                  gte(v2GuildResources.gold, cost),
                ),
              )
              .returning({ gold: v2GuildResources.gold });
            if (deducted.length > 0) {
              repairedHp = hp;
              repairGoldSpent = cost;
              fortHpAfter += hp;
            }
          }
        }
        // 공성 — 승리 1회당 성벽 SIEGE_DAMAGE_PER_WIN 감소(수리 반영 후).
        const damaged = Math.max(0, fortHpAfter - SIEGE_DAMAGE_PER_WIN);
        if (damaged <= 0) {
          // 함락 — 소유권 이전 + 성벽 풀충전 + 보호막.
          captured = true;
          await tx
            .update(outpostOccupations)
            .set({
              occupiedByUserId: userId,
              occupiedByGuildId: attackerGuildId,
              occupiedAt: newOccupiedAt,
              policy: "open",
              taxRate: "0.100",
              nextAttackAt: computeNextAttackAt(outpost.tier, Date.now()),
              fortHp: fortMaxHp,
              fortUpdatedAt: newOccupiedAt,
              protectedUntil: new Date(now + POST_CAPTURE_PROTECT_MS),
            })
            .where(eq(outpostOccupations.outpostId, outpost.id));
          occupation = {
            outpostId: outpost.id,
            occupiedByUserId: userId,
            occupiedByGuildId: attackerGuildId,
            occupiedAt: newOccupiedAt.toISOString(),
          };
          fortHpAfter = fortMaxHp;
        } else {
          // 성벽만 감소 — 소유권 유지(공성 진행). fortUpdatedAt 갱신으로 재생 재시작.
          await tx
            .update(outpostOccupations)
            .set({ fortHp: damaged, fortUpdatedAt: newOccupiedAt })
            .where(eq(outpostOccupations.outpostId, outpost.id));
          fortHpAfter = damaged;
        }
      } else {
        // 비점령(NPC) 신규 claim — 단판. 승리 즉시 점령(풀성벽 + 보호막). race 시 catch.
        try {
          await tx.insert(outpostOccupations).values({
            outpostId: outpost.id,
            occupiedByUserId: userId,
            occupiedByGuildId: attackerGuildId,
            policy: "open",
            taxRate: "0.100",
            nextAttackAt: computeNextAttackAt(outpost.tier, Date.now()),
            fortHp: FORT_MAX_HP,
            fortMaxHp: FORT_MAX_HP,
            fortUpdatedAt: newOccupiedAt,
            protectedUntil: new Date(now + POST_CAPTURE_PROTECT_MS),
          });
          captured = true;
          occupation = {
            outpostId: outpost.id,
            occupiedByUserId: userId,
            occupiedByGuildId: attackerGuildId,
            occupiedAt: newOccupiedAt.toISOString(),
          };
          fortHpAfter = FORT_MAX_HP;
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

    // 사냥 후 hp 적용 (단판 패턴).
    // 병사 보정으로 battle 안 maxHp 가 늘었으므로 base maxHp 로 cap.
    // (안 그러면 저장 hp 가 다음 regen tick 의 base max 캡까지 의미상 잉여)
    const afterHp = Math.min(player.maxHp, Math.max(0, battleFinalPlayerHp!));

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
        // NPC 일기토면 전투 리플레이 — ClaimResultCard 가 ReplayBattleScene 으로 표시.
        // (PvP/토너먼트는 null.) startPlayerHp/이름/성별은 리플레이 BattleScene 용.
        replay,
        startPlayerHp: hpRegen.hp,
        playerName,
        gender: playerGender,
        occupation,
        // 공성 — captured=소유권 이전 여부, fortHp/fortMaxHp=이번 타격 후 성벽(승리 시 −SIEGE).
        //   won && !captured = 성벽만 깎인 공성 진행. 비점령 단판 점령은 captured=true.
        captured,
        fortHp: fortHpAfter,
        fortMaxHp,
        // 길드 금고 자동 수리(PR-2) — 이번 타격 전 수비 길드 금고로 보강한 HP·소모 골드.
        repairedHp,
        repairGoldSpent,
        // 다인 길드 토너먼트 결과. 양측 모두 멤버 2+ 일 때만.
        // (PR-7b: troopBattle 응답 키 제거 — 본 병사 전쟁 시스템 폐기.)
        tournament: tournamentSummary,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
