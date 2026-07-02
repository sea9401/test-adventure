import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  outpostDefenders,
  outpostOccupations,
  outpostTreasury,
  outpostVillages,
  savesKv,
  tileSettlements,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { resolveBattlePvP } from "@/adventure/v2/combat/engine-pvp";
import { autoDuelContext } from "@/adventure/v2/combat/duelOptions";
import {
  captureOutpostOccupation,
  recordOutpostAttack,
  replayEnvelope,
} from "@/lib/server/outpostWar";
import { applyStance } from "@/adventure/character/stance";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import { addGuildFame } from "@/lib/server/v2GuildFame";
import { resolveUserDisplayName } from "@/lib/server/serverFeed";
import { trimAttackReplays } from "@/lib/server/outpostAttackLog";
import {
  toPvpReplayPayload,
  type ReplayPayload,
} from "@/adventure/data/v2/replayPayload";
import {
  resolveOutpostMeta,
  isTileOutpostId,
  parseTileOutpostId,
  isTileAdjacentToNeutralOutpost,
} from "@/adventure/data/v2/tileWarfare";
import { guildTileFoothold } from "@/lib/server/tileWarfareGates";
import {
  isTileSettlementTier,
  tilePrevTier,
  TILE_TIER_LABEL,
  isTradeRouteTile,
  isLakeAdjacentTile,
} from "@/adventure/data/v2/tileConfig";
import {
  isOutpostProtected,
  currentFortHp,
  fortMaxHpForTier,
  tileFortMaxHp,
  siegeDamage,
  undefendedSiegeDamage,
} from "@/adventure/data/v2/outpostSiege";
import { derivePowerScore } from "@/adventure/data/v2/power";
import { outpostDefensePower } from "@/adventure/data/v2/outpostDefense";
import {
  lockVillage,
  upsertVillage,
  normalizeVillageOwner,
} from "@/lib/server/v2Settlement";
import { removeTileWarfare } from "@/lib/server/tileOccupation";
import {
  prevTier,
  VILLAGE_TIER_NAME,
  MAX_SLOTS_BY_TIER,
} from "@/adventure/data/v2/settlement";
import {
  RAID_TREASURY_STEAL_FRAC_DEFENDED,
  RAID_TREASURY_STEAL_FRAC_UNDEFENDED,
  TRADE_ROUTE_RAID_LOSS_MULT,
  LAKE_ATTACKER_PENALTY_MULT,
  HONOR_PER_DEFENSE_WIN,
  RAID_MIN_TILE_STAY_MS,
  V2_SETTLEMENT_WARFARE,
  V2_TILE_WARFARE,
} from "@/adventure/data/v2/settlementWarfareConfig";
import { parseWarVigor, vigorAfterBattle } from "@/adventure/data/v2/warVigor";
import { parseHonor, parseHonorEarned } from "@/adventure/data/v2/honor";

// POST /api/v2/outpost/attack — 정착지 전쟁 공격(약탈/정복). 설계: docs/v2-settlement-warfare-plan.md.
//   body: { outpostId, mode: "raid" | "conquest" }
//   raid    = 수비 큐 1번을 "건강도(전쟁 전용 HP 이월)" 결투로 격파 → 거점 금고 일부 탈취(마을 유지).
//   conquest= 수비 큐 전원 격파(건틀릿) + 성벽(fortHp) 누적 공성 완파 → 함락(마을 tier 1↓·소유 이관,
//             금고는 그대로). 성벽 데미지 = 수비 격파 시 siegeDamage(전투력 비율), 무방비(큐 0명)면
//             undefendedSiegeDamage(전투력÷4·캡 50%HP) → 여러 차례 공격으로 함락.
//   큐가 비면 무혈(수비 미등록 시 약탈/공성에 무방비 = 등록 인센티브).
//   플래그 off → 404. 옛 claim 라우트(3:3 토너먼트)는 손대지 않음 — PR-6 에서 제거.
//
// 🔑 건강도 MP 메모: resolveBattlePvP 는 매치 시작 시 MP 풀충전(engine-pvp). vigor.mp 는 전투
//   "시작"에 미반영(HP 가 전쟁 소모 축). 전투 후엔 hp/mp 둘 다 vigor 로 저장.

type WarVigorSave = {
  warVigor?: unknown;
  // 자유 타일 지도 위치 마커(move-tile 갱신) — 약탈 "현지 위치" 게이트에 사용.
  tilePos?: { col?: number; row?: number; at?: number };
  [k: string]: unknown;
};

export async function POST(req: Request) {
  if (!V2_SETTLEMENT_WARFARE) {
    return Response.json({ ok: false, error: "disabled" }, { status: 404 });
  }
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { outpostId?: unknown; mode?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const outpostId = typeof body.outpostId === "string" ? body.outpostId : "";
  const mode = body.mode;
  if (mode !== "raid" && mode !== "conquest") {
    return Response.json({ ok: false, error: "invalid_mode" }, { status: 400 });
  }
  let outpost = resolveOutpostMeta(outpostId);
  // 타일 전쟁 — tile id 면 tile_settlements 의 tier 로 메타 합성(없으면 undefined→아래 거부).
  if (!outpost && V2_TILE_WARFARE && isTileOutpostId(outpostId)) {
    const pos = parseTileOutpostId(outpostId);
    if (pos) {
      const [ts] = await db
        .select({ tier: tileSettlements.tier, name: tileSettlements.name })
        .from(tileSettlements)
        .where(
          and(eq(tileSettlements.col, pos.col), eq(tileSettlements.row, pos.row)),
        )
        .limit(1);
      if (ts && isTileSettlementTier(ts.tier)) {
        outpost = resolveOutpostMeta(outpostId, { tier: ts.tier, name: ts.name });
      }
    }
  }
  if (!outpost || outpost.neutral) {
    return Response.json(
      { ok: false, error: "no_such_outpost" },
      { status: 400 },
    );
  }

  const now = Date.now();
  const result = await db.transaction(async (tx) => {
    // lock 순서: occupation FOR UPDATE → 수비 큐 → 세이브 → 금고/길드자원. claim 미러.
    const occRow = (
      await tx
        .select()
        .from(outpostOccupations)
        .where(eq(outpostOccupations.outpostId, outpost.id))
        .for("update")
        .limit(1)
    )[0];

    const attackerGuildId = await getGuildId(tx, userId);
    if (!occRow) {
      // 점령행 없음 = 미점령 거점(NPC 운영) — 전쟁 대상 아님. (타일은 백필로 항상 점령행 보유.)
      return {
        status: 400,
        body: { ok: false as const, error: "not_occupied" },
      };
    }
    // 소유 = 점령행. 길드 타일=occupiedByGuildId, 솔로(무길드) 타일=null + occupiedByUserId(주인).
    const defenderGuildId = occRow.occupiedByGuildId;
    const defenderUserId = occRow.occupiedByUserId;
    // 영토=길드 소유 — 전쟁(약탈/정복)은 길드만. 무소속 공격자는 차단(길드 생성/가입 필요).
    //   (옛 솔로 공격자=함락 시 철거 경로는 폐기 — 무소속은 전쟁 자체에 참여 불가.)
    if (attackerGuildId == null) {
      return { status: 400, body: { ok: false as const, error: "no_guild" } };
    }
    // 약탈/정복 모두 보급선(영토 연속성) 게이트 없음 — 점령(claim)이 아니라 전쟁 행위.
    //   함락 직후 보호막은 존중.
    if (isOutpostProtected(occRow.protectedUntil, new Date(now))) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "protected",
          protectedUntil: occRow.protectedUntil.toISOString(),
        },
      };
    }

    // 수비 대상 검증 + 수비 큐 구성.
    //   길드 타일 = 등록 큐(스테일 제외·등록순), 솔로 타일 = 주인 단독 자동 수비(큐 합성).
    let queue: Array<{ userId: string }>;
    if (defenderGuildId == null) {
      if (defenderUserId == null) {
        // 소유자 불명(이상한 행) — 전쟁 대상 아님.
        return {
          status: 400,
          body: { ok: false as const, error: "not_occupied" },
        };
      }
      if (defenderUserId === userId) {
        return {
          status: 400,
          body: { ok: false as const, error: "already_yours" },
        };
      }
      queue = [{ userId: defenderUserId }];
    } else {
      if (defenderGuildId === attackerGuildId) {
        return {
          status: 400,
          body: { ok: false as const, error: "already_yours" },
        };
      }
      queue = await tx
        .select({ userId: outpostDefenders.userId })
        .from(outpostDefenders)
        .where(
          and(
            eq(outpostDefenders.outpostId, outpost.id),
            eq(outpostDefenders.guildId, defenderGuildId),
          ),
        )
        .orderBy(
          asc(outpostDefenders.registeredAt),
          asc(outpostDefenders.userId),
        );
    }

    const attacker = await derivePlayerCombatV2(userId, tx);
    if (!attacker) {
      return {
        status: 400,
        body: { ok: false as const, error: "no_character" },
      };
    }

    // 관련 세이브 사전 정렬 lock(데드락 회피) — raid=공격자+1번, conquest=공격자+큐 전원.
    const defenderIds =
      mode === "raid"
        ? queue[0]
          ? [queue[0].userId]
          : []
        : queue.map((q) => q.userId);
    const lockIds = Array.from(new Set([userId, ...defenderIds])).sort();
    for (const id of lockIds) {
      await lockSaveForUpdate<unknown>(tx, id, "character.v2", {});
    }
    const attackerSave = await lockSaveForUpdate<WarVigorSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const attackerName = await resolveUserDisplayName(userId);
    // 공격 기록 리플레이 봉투용 성별(claim 미러 — character-profile.v2.gender, 기본 male1).
    const attackerProfileRow = await tx
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(
        and(eq(savesKv.userId, userId), eq(savesKv.key, "character-profile.v2")),
      )
      .limit(1);
    const attackerProfile = (attackerProfileRow[0]?.value ?? null) as {
      gender?: string;
    } | null;
    const attackerGender =
      typeof attackerProfile?.gender === "string" &&
      attackerProfile.gender.length > 0
        ? attackerProfile.gender
        : "male1";
    const attackerVigor = parseWarVigor(attackerSave.warVigor);
    const aMaxMp = attacker.player.maxMp ?? 0;

    // === 위치/인접 게이트 (타일 정착지 대상만 — 옛 카탈로그 거점은 오프보드·inert 라 현행 유지) ===
    //   약탈 = 대상 정착지 칸에 "1시간 이상 체류"해야(tilePos 일치+at 경과). 멀리서 약탈 불가.
    //   정복 = 내 길드 영지에 4방향 인접한 칸만(연속 확장). 땅 없는 길드는 중립 거점 인접에서 발판.
    //   전투/건강도 소모 전(여기서) 거부해 무효 시도에 비용이 들지 않게 한다.
    if (isTileOutpostId(outpost.id)) {
      const pos = parseTileOutpostId(outpost.id);
      if (pos) {
        if (mode === "raid") {
          const tp = attackerSave.tilePos;
          if (!tp || tp.col !== pos.col || tp.row !== pos.row) {
            return {
              status: 400,
              body: { ok: false as const, error: "not_present" },
            };
          }
          const arrivedAt =
            typeof tp.at === "number" && Number.isFinite(tp.at) ? tp.at : 0;
          const elapsedMs = Math.max(0, now - arrivedAt);
          if (elapsedMs < RAID_MIN_TILE_STAY_MS) {
            return {
              status: 400,
              body: {
                ok: false as const,
                error: "raid_stay_required",
                requiredMs: RAID_MIN_TILE_STAY_MS,
                elapsedMs,
                availableAt: arrivedAt + RAID_MIN_TILE_STAY_MS,
              },
            };
          }
        } else {
          // conquest — attackerGuildId 는 위 no_guild 가드 통과로 non-null.
          const foothold = await guildTileFoothold(
            tx,
            attackerGuildId,
            pos.col,
            pos.row,
          );
          const allowed =
            foothold.adjacentOwned ||
            (!foothold.ownsAny &&
              isTileAdjacentToNeutralOutpost(pos.col, pos.row));
          if (!allowed) {
            return {
              status: 400,
              body: { ok: false as const, error: "no_foothold" },
            };
          }
        }
      }
    }

    // ===================== 약탈(raid) =====================
    if (mode === "raid") {
      // 약탈 = 거점 금고 일부 탈취 — 길드 금고가 있는 길드↔길드 전용. 솔로(금고 없음)는 정복만.
      if (defenderGuildId == null) {
        return {
          status: 400,
          body: { ok: false as const, error: "raid_solo_unsupported" },
        };
      }
      if (attackerGuildId == null) {
        return { status: 400, body: { ok: false as const, error: "no_guild" } };
      }
      const defender1Id = queue[0]?.userId ?? null;
      let won: boolean;
      let defenderName: string | null = null;
      let replay: ReplayPayload | null = null;
      let raidTurns = 0;
      let raidBattled = false; // 실제 전투(수비자 존재)면 true → 공격 기록 INSERT.
      // 수비 성공 시 점령 길드(수비자 소속)에 누적할 명성 — tx 끝에서 단일 UPDATE.
      let defenderFameDelta = 0;
      // 약탈은 "1시간 체류 후 1회"다. 유효한 약탈 시도 후 같은 칸 체류 시작시각을 리셋해
      // 조건 충족 뒤 연속 클릭으로 금고를 비우는 일을 막는다.
      const nextTilePos =
        isTileOutpostId(outpost.id) && attackerSave.tilePos
          ? {
              col: attackerSave.tilePos.col,
              row: attackerSave.tilePos.row,
              at: now,
            }
          : null;
      let attackerSaveUpdated = false;

      if (defender1Id == null) {
        won = true; // 무방비 → 무혈 약탈.
      } else {
        const defender = await derivePlayerCombatV2(defender1Id, tx);
        if (!defender) {
          await tx
            .delete(outpostDefenders)
            .where(
              and(
                eq(outpostDefenders.outpostId, outpost.id),
                eq(outpostDefenders.userId, defender1Id),
              ),
            );
          won = true;
        } else {
          defenderName = await resolveUserDisplayName(defender1Id);
          const defenderSave = await lockSaveForUpdate<WarVigorSave>(
            tx,
            defender1Id,
            "character.v2",
            {},
          );
          const defenderVigor = parseWarVigor(defenderSave.warVigor);
          const aStartHp = Math.max(
            1,
            Math.floor(attacker.maxHp * attackerVigor.hp),
          );
          const dStartHp = Math.max(
            1,
            Math.floor(defender.maxHp * defenderVigor.hp),
          );
          const attackerStanced = applyStance(
            { ...attacker.player, hp: aStartHp },
            attacker.selectedStance,
          );
          const defenderStanced = applyStance(
            { ...defender.player, hp: dStartHp },
            defender.selectedStance,
          );
          const pvp = resolveBattlePvP(
            attackerStanced,
            defenderStanced,
            attackerName,
            defenderName,
            autoDuelContext(),
          );
          won = pvp.outcome === "p1_win";
          replay = toPvpReplayPayload(pvp.finalState, defenderName, 200);
          raidTurns = pvp.turns;
          raidBattled = true;
          const dMaxMp = defender.player.maxMp ?? 0;
          await upsertSave(tx, userId, "character.v2", {
            ...attackerSave,
            ...(nextTilePos ? { tilePos: nextTilePos } : {}),
            warVigor: vigorAfterBattle(
              pvp.finalState.p1.hp,
              attacker.maxHp,
              pvp.finalState.p1.mp,
              aMaxMp,
              now,
            ),
          });
          attackerSaveUpdated = true;
          // 수비 성공(공격자 패배 = 수비자 승리)이면 명성 보상(보유+누적). 진 수비자는 0.
          const honorReward = won ? 0 : HONOR_PER_DEFENSE_WIN;
          defenderFameDelta = honorReward;
          const dHonorBefore = parseHonor(defenderSave.honor);
          await upsertSave(tx, defender1Id, "character.v2", {
            ...defenderSave,
            honor: dHonorBefore + honorReward,
            honorEarned:
              parseHonorEarned(defenderSave.honorEarned, dHonorBefore) +
              honorReward,
            warVigor: vigorAfterBattle(
              pvp.finalState.p2.hp,
              defender.maxHp,
              pvp.finalState.p2.mp,
              dMaxMp,
              now,
            ),
          });
          if (won) {
            await tx
              .delete(outpostDefenders)
              .where(
                and(
                  eq(outpostDefenders.outpostId, outpost.id),
                  eq(outpostDefenders.userId, defender1Id),
                ),
              );
          }
        }
      }

      if (nextTilePos && !attackerSaveUpdated) {
        await upsertSave(tx, userId, "character.v2", {
          ...attackerSave,
          tilePos: nextTilePos,
        });
      }

      let stolenGold = 0;
      if (won) {
        const tRow = (
          await tx
            .select({ gold: outpostTreasury.gold })
            .from(outpostTreasury)
            .where(eq(outpostTreasury.outpostId, outpost.id))
            .for("update")
            .limit(1)
        )[0];
        const treasury = Math.max(0, tRow?.gold ?? 0);
        const stealFrac = raidBattled
          ? RAID_TREASURY_STEAL_FRAC_DEFENDED
          : RAID_TREASURY_STEAL_FRAC_UNDEFENDED;
        stolenGold = Math.floor(treasury * stealFrac);
        // 지형 보정(P3) — 방어 정착지가 교역로면 탈취 ×1.10(양날), 호수 인접이면 ×0.90(공격자
        //   약화). 합성곱. 비-타일/비-해당지형은 무변경. 금고 잔액 초과 클램프.
        const raidDefPos = parseTileOutpostId(outpost.id);
        if (raidDefPos) {
          let mult = 1;
          if (isTradeRouteTile(raidDefPos.col, raidDefPos.row)) {
            mult *= TRADE_ROUTE_RAID_LOSS_MULT;
          }
          if (isLakeAdjacentTile(raidDefPos.col, raidDefPos.row)) {
            mult *= LAKE_ATTACKER_PENALTY_MULT;
          }
          if (mult !== 1) {
            stolenGold = Math.min(treasury, Math.floor(stolenGold * mult));
          }
        }
        if (stolenGold > 0) {
          await tx
            .update(outpostTreasury)
            .set({ gold: treasury - stolenGold, updatedAt: sql`now()` })
            .where(eq(outpostTreasury.outpostId, outpost.id));
          const ag = await lockGuildResources(tx, attackerGuildId);
          await upsertGuildResources(tx, attackerGuildId, {
            gold: ag.gold + stolenGold,
          });
        }
      }

      // 수비 성공분을 점령 길드 누적 명성에 가산(앞으로만). guild_resources 다음(락 순서).
      await addGuildFame(tx, defenderGuildId, defenderFameDelta);

      // 공격 기록(최근 공격 기록 탭) — 실제 전투가 있었던 약탈만(무혈/스테일 수비자 제외).
      if (raidBattled) {
        await recordOutpostAttack(tx, {
          outpostId: outpost.id,
          attackerUserId: userId,
          attackerGuildId,
          defenderName: defenderName ?? "수비자",
          defenderUserId: defender1Id,
          won,
          turns: raidTurns,
          replay: replayEnvelope(replay, attackerName, attackerGender),
        });
      }

      return {
        status: 200,
        body: {
          ok: true as const,
          mode: "raid" as const,
          won,
          stolenGold,
          defenderName,
          tilePos: nextTilePos,
          raidAvailableAt: nextTilePos
            ? nextTilePos.at + RAID_MIN_TILE_STAY_MS
            : null,
          replay,
        },
      };
    }

    // ===================== 정복(conquest) =====================
    // 큐 전원 건틀릿 — 공격자 HP 가 전투 사이에 이월(MP 는 매치 풀충전). 진 수비자는 큐 탈락.
    let currentHp = Math.max(1, Math.floor(attacker.maxHp * attackerVigor.hp));
    let attackerFinal: { hp: number; mp: number } | null = null;
    let defendersDefeated = 0;
    // 공격 기록용 — 마지막 실제 전투 캡처(건틀릿 요약 1건 INSERT).
    let lastPvp: ReturnType<typeof resolveBattlePvP> | null = null;
    let lastDefenderName: string | null = null;
    let lastDefenderId: string | null = null;
    let clearedQueue = true;
    // 이 공격에서 수비자들이 막아낸 만큼 점령 길드에 누적할 명성 — tx 끝에서 단일 UPDATE.
    let defenderFameDelta = 0;
    for (const d of queue) {
      const defender = await derivePlayerCombatV2(d.userId, tx);
      if (!defender) {
        // 스테일 수비자(캐릭 없음) → 자동 격파.
        await tx
          .delete(outpostDefenders)
          .where(
            and(
              eq(outpostDefenders.outpostId, outpost.id),
              eq(outpostDefenders.userId, d.userId),
            ),
          );
        defendersDefeated += 1;
        continue;
      }
      const defenderSave = await lockSaveForUpdate<WarVigorSave>(
        tx,
        d.userId,
        "character.v2",
        {},
      );
      const dVigor = parseWarVigor(defenderSave.warVigor);
      const dStartHp = Math.max(1, Math.floor(defender.maxHp * dVigor.hp));
      const dName = await resolveUserDisplayName(d.userId);
      const attackerStanced = applyStance(
        { ...attacker.player, hp: currentHp },
        attacker.selectedStance,
      );
      const defenderStanced = applyStance(
        { ...defender.player, hp: dStartHp },
        defender.selectedStance,
      );
      const pvp = resolveBattlePvP(
        attackerStanced,
        defenderStanced,
        attackerName,
        dName,
        autoDuelContext(),
      );
      lastPvp = pvp;
      lastDefenderName = dName;
      lastDefenderId = d.userId;
      const dMaxMp = defender.player.maxMp ?? 0;
      // 이 수비자가 공격자를 막아냈으면(공격자 패배) 명성 보상(보유+누적). 진 수비자는 0.
      const defenderWon = pvp.outcome !== "p1_win";
      const honorReward = defenderWon ? HONOR_PER_DEFENSE_WIN : 0;
      defenderFameDelta += honorReward;
      const dHonorBefore = parseHonor(defenderSave.honor);
      await upsertSave(tx, d.userId, "character.v2", {
        ...defenderSave,
        honor: dHonorBefore + honorReward,
        honorEarned:
          parseHonorEarned(defenderSave.honorEarned, dHonorBefore) +
          honorReward,
        warVigor: vigorAfterBattle(
          pvp.finalState.p2.hp,
          defender.maxHp,
          pvp.finalState.p2.mp,
          dMaxMp,
          now,
        ),
      });
      attackerFinal = { hp: pvp.finalState.p1.hp, mp: pvp.finalState.p1.mp };
      if (pvp.outcome === "p1_win") {
        await tx
          .delete(outpostDefenders)
          .where(
            and(
              eq(outpostDefenders.outpostId, outpost.id),
              eq(outpostDefenders.userId, d.userId),
            ),
          );
        defendersDefeated += 1;
        currentHp = pvp.finalState.p1.hp;
      } else {
        clearedQueue = false;
        break;
      }
    }
    // 공격자 건강도 저장(전투가 한 번이라도 있었으면).
    if (attackerFinal) {
      await upsertSave(tx, userId, "character.v2", {
        ...attackerSave,
        warVigor: vigorAfterBattle(
          attackerFinal.hp,
          attacker.maxHp,
          attackerFinal.mp,
          aMaxMp,
          now,
        ),
      });
    }

    let captured = false;
    let razed = false; // 솔로 공격자 함락 = 철거(빈땅). 길드 공격자 함락 = 인수(razed=false).
    let downgradedTo: string | null = null;
    // 방어 타일 좌표(비-타일 거점=null). 호수 공성 페널티 + fortMaxHp 폴백에 공용.
    const defTilePos = parseTileOutpostId(outpost.id);
    // 저장된 fortMaxHp 우선(found/promote 가 요새터 ×1.15 반영해 기록) — 폴백도 타일이면 동일 헬퍼.
    const fortMaxHp =
      occRow.fortMaxHp ??
      (defTilePos
        ? tileFortMaxHp(defTilePos.col, defTilePos.row, outpost.tier)
        : fortMaxHpForTier(outpost.tier));
    let fortHpAfter = currentFortHp(
      occRow.fortHp,
      fortMaxHp,
      occRow.fortUpdatedAt,
      new Date(now),
    );

    if (clearedQueue) {
      // 성벽 자동 수리 폐지 — 공성 데미지가 그대로 박힌다(수비는 별도 수동 수리
      //   /api/v2/outpost/repair 로 직접 골드를 써서 보강). 옛 금고 자동수리는 무방비
      //   거점도 돈으로 무한 방어돼 공격이 안 먹히는 역설을 만들어 제거.
      // 성벽 데미지 — 공격자 합성전투력 기반.
      const attackerPower = derivePowerScore({
        atk: attacker.player.atk,
        magicAtk: attacker.player.magicAtk ?? 0,
        def: attacker.player.def,
        spd: attacker.player.spd,
        maxHp: attacker.maxHp,
        maxMp: aMaxMp,
      });
      // 무방비(수비 큐 0명 = defendersDefeated 0)면 전투력÷4(캡 50%HP·벌칙), 수비 격파면 전투력 비율.
      let siegeAmt =
        defendersDefeated === 0
          ? undefendedSiegeDamage(attackerPower, fortMaxHp)
          : siegeDamage(attackerPower, outpostDefensePower(outpost));
      // 호수 인접 방어 정착지 = 공성 데미지 −10%(공격자 약화·≥1 보장)·P3. 비-타일/비-인접 무변경.
      if (defTilePos && isLakeAdjacentTile(defTilePos.col, defTilePos.row)) {
        siegeAmt = Math.max(1, Math.round(siegeAmt * LAKE_ATTACKER_PENALTY_MULT));
      }
      const damaged = Math.max(0, fortHpAfter - siegeAmt);
      const newOccupiedAt = new Date();
      if (damaged <= 0) {
        // 함락. 공격자 정체성으로 분기 — 길드 공격자=인수(소유 이전), 솔로 공격자=철거(빈땅).
        captured = true;
        if (attackerGuildId == null) {
          // 솔로 공격자는 점령으로 소유할 수 없음 → 막타 시 정착지 철거(빈땅·게이트상 타일 전용).
          //   전쟁 행(점령/금고/수비큐/영주) + 정착지 + 생산(마을) 모두 제거 → (col,row) 재개척 가능.
          razed = true;
          const pos = parseTileOutpostId(outpost.id);
          if (pos) {
            await removeTileWarfare(tx, pos.col, pos.row);
            await tx
              .delete(tileSettlements)
              .where(
                and(
                  eq(tileSettlements.col, pos.col),
                  eq(tileSettlements.row, pos.row),
                ),
              );
            await tx
              .delete(outpostVillages)
              .where(eq(outpostVillages.outpostId, outpost.id));
          }
          fortHpAfter = 0;
        } else {
          // 길드 공격자 = 인수 — 소유 이전 + 성벽 풀충전 + 보호막(claim 함락과 공용 규칙).
          await captureOutpostOccupation(tx, {
            outpostId: outpost.id,
            newOwnerUserId: userId,
            newOwnerGuildId: attackerGuildId,
            tier: outpost.tier,
            fortMaxHp,
            occupiedAt: newOccupiedAt,
            nowMs: now,
          });
          fortHpAfter = fortMaxHp;

          // 타일 정착지 함락 — tier 1단계 강등(tile_settlements) + 소유자=정복자(userId 갱신).
          //   founder 가드: 소유자를 정복자로 바꿔 이후 demolish/promote 의 소유 체크(existing.userId
          //   === userId)가 자동으로 옛 창립자를 막고 정복자만 허용. 옛 마을(outpost_villages) 무관.
          if (isTileOutpostId(outpost.id)) {
            const pos = parseTileOutpostId(outpost.id);
            if (pos) {
              const [ts] = await tx
                .select({ tier: tileSettlements.tier })
                .from(tileSettlements)
                .where(
                  and(
                    eq(tileSettlements.col, pos.col),
                    eq(tileSettlements.row, pos.row),
                  ),
                )
                .for("update")
                .limit(1);
              if (ts && isTileSettlementTier(ts.tier)) {
                const down = tilePrevTier(ts.tier);
                const downTier = down ?? ts.tier;
                await tx
                  .update(tileSettlements)
                  .set({ tier: downTier, userId })
                  .where(
                    and(
                      eq(tileSettlements.col, pos.col),
                      eq(tileSettlements.row, pos.row),
                    ),
                  );
                downgradedTo = down ? TILE_TIER_LABEL[downTier] : null;
              }
            }
          }
          // 마을 tier 1단계 강등 + 소유 이관(금고는 그대로 인수). 최하(마을)=강등 없이 이관.
          //   강등 시 해금 칸이 새 tier 상한 초과면 클램프(슬롯 종류도 트림). 진행 작업은
          //   normalizeVillageOwner 가 비움. 타일이면 village=null 로 스킵(위 tile 분기가 처리).
          const village = isTileOutpostId(outpost.id)
            ? null
            : await lockVillage(tx, outpost.id);
          if (village) {
            const transferred = normalizeVillageOwner(village, attackerGuildId);
            const down = prevTier(village.tier);
            const downTier = down ?? village.tier;
            const maxSlots = MAX_SLOTS_BY_TIER[downTier];
            const newUnlocked = Math.min(transferred.unlockedSlots, maxSlots);
            const newSlotKinds: typeof transferred.slotKinds = {};
            for (const [k, v] of Object.entries(transferred.slotKinds)) {
              if (Number(k) < newUnlocked) newSlotKinds[Number(k)] = v;
            }
            const newBuildings: typeof transferred.buildings = {};
            for (const [k, v] of Object.entries(transferred.buildings)) {
              if (Number(k) < newUnlocked) newBuildings[Number(k)] = v;
            }
            await upsertVillage(tx, {
              ...transferred,
              tier: downTier,
              unlockedSlots: newUnlocked,
              slotKinds: newSlotKinds,
              buildings: newBuildings,
            });
            downgradedTo = down ? VILLAGE_TIER_NAME[downTier] : null;
          }
          // 소유 변경 → 옛 소유 길드의 수비 큐 전체 제거.
          await tx
            .delete(outpostDefenders)
            .where(eq(outpostDefenders.outpostId, outpost.id));
        }
      } else {
        // 성벽만 감소(공성 진행·소유 유지). fortUpdatedAt 갱신으로 재생 재시작.
        await tx
          .update(outpostOccupations)
          .set({ fortHp: damaged, fortUpdatedAt: newOccupiedAt })
          .where(eq(outpostOccupations.outpostId, outpost.id));
        fortHpAfter = damaged;
      }
    }

    // 수비 성공분을 점령 길드 누적 명성에 가산(앞으로만). 함락 시엔 delta=0(수비 전원 격파)
    //   이라 소유 이관과 무관. guild_resources(수리 락) 다음(락 순서).
    //   솔로 타일(defenderGuildId=null)은 길드 명성 없음 — 주인 개인 honor 는 위 루프에서 지급됨.
    if (defenderGuildId != null) {
      await addGuildFame(tx, defenderGuildId, defenderFameDelta);
    }

    // 공격 기록(최근 공격 기록 탭) — 정복 시도 1건 요약(마지막 전투 리플레이·무혈이면 "수비 없음").
    const conquestReplay = lastPvp
      ? toPvpReplayPayload(lastPvp.finalState, lastDefenderName ?? "수비대", 200)
      : null;
    await recordOutpostAttack(tx, {
      outpostId: outpost.id,
      attackerUserId: userId,
      attackerGuildId,
      defenderName: lastDefenderName ?? "(수비 없음)",
      defenderUserId: lastDefenderId,
      won: clearedQueue,
      turns: lastPvp?.turns ?? 0,
      replay: replayEnvelope(conquestReplay, attackerName, attackerGender),
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        mode: "conquest" as const,
        clearedQueue,
        captured,
        razed,
        fortHp: fortHpAfter,
        fortMaxHp,
        downgradedTo,
        defendersDefeated,
      },
    };
  });

  // 공격 시도가 기록된 성공 응답이면 거점당 최신 N 건으로 trim(실패 삼킴·부수효과). claim 미러.
  if (result.body.ok) {
    try {
      await trimAttackReplays(outpost.id);
    } catch {
      // 부수효과 — 실패 삼킴.
    }
  }

  return Response.json(result.body, { status: result.status });
}
