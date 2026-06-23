import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  outpostDefenders,
  outpostOccupations,
  outpostTreasury,
  tileSettlements,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { resolveBattlePvP } from "@/adventure/v2/combat/engine-pvp";
import { applyStance } from "@/adventure/character/stance";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import { addGuildFame } from "@/lib/server/v2GuildFame";
import { resolveUserDisplayName } from "@/lib/server/serverFeed";
import {
  toPvpReplayPayload,
  type ReplayPayload,
} from "@/adventure/data/v2/replayPayload";
import {
  resolveOutpostMeta,
  isTileOutpostId,
  parseTileOutpostId,
} from "@/adventure/data/v2/tileWarfare";
import {
  isTileSettlementTier,
  tilePrevTier,
  TILE_TIER_LABEL,
} from "@/adventure/data/v2/tileConfig";
import {
  isOutpostProtected,
  currentFortHp,
  repairHpFromGold,
  FORT_MAX_HP,
  SIEGE_DAMAGE_PER_WIN,
  REPAIR_GOLD_PER_HP,
  POST_CAPTURE_PROTECT_MS,
} from "@/adventure/data/v2/outpostSiege";
import { computeNextAttackAt } from "@/adventure/data/v2/npcAttack";
import {
  lockVillage,
  upsertVillage,
  normalizeVillageOwner,
} from "@/lib/server/v2Settlement";
import {
  prevTier,
  VILLAGE_TIER_NAME,
  MAX_SLOTS_BY_TIER,
} from "@/adventure/data/v2/settlement";
import {
  RAID_TREASURY_STEAL_FRAC,
  HONOR_PER_DEFENSE_WIN,
  V2_SETTLEMENT_WARFARE,
  V2_TILE_WARFARE,
} from "@/adventure/data/v2/settlementWarfareConfig";
import { parseWarVigor, vigorAfterBattle } from "@/adventure/data/v2/warVigor";
import { parseHonor, parseHonorEarned } from "@/adventure/data/v2/honor";

// POST /api/v2/outpost/attack — 정착지 전쟁 공격(약탈/정복). 설계: docs/v2-settlement-warfare-plan.md.
//   body: { outpostId, mode: "raid" | "conquest" }
//   raid    = 수비 큐 1번을 "건강도(전쟁 전용 HP 이월)" 결투로 격파 → 거점 금고 50% 탈취(마을 유지).
//   conquest= 수비 큐 전원 격파(건틀릿) + 성벽(fortHp) 누적 공성 완파 → 함락(마을 tier 1↓·소유 이관,
//             금고는 그대로). 성벽은 한 번에 SIEGE_DAMAGE_PER_WIN 깎임 → 여러 차례 공격으로 함락.
//   큐가 비면 무혈(수비 미등록 시 약탈/공성에 무방비 = 등록 인센티브).
//   플래그 off → 404. 옛 claim 라우트(3:3 토너먼트)는 손대지 않음 — PR-6 에서 제거.
//
// 🔑 건강도 MP 메모: resolveBattlePvP 는 매치 시작 시 MP 풀충전(engine-pvp). vigor.mp 는 전투
//   "시작"에 미반영(HP 가 전쟁 소모 축). 전투 후엔 hp/mp 둘 다 vigor 로 저장.

type WarVigorSave = { warVigor?: unknown; [k: string]: unknown };

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
    // 솔로 공격자(무길드)는 "솔로 타일" 정복만 허용. 길드 영지·카탈로그 거점은 길드 소속만 공격
    //   (개인이 길드 땅을 사유화하는 것을 막는다·카탈로그 거점 동작은 기존과 동일).
    if (
      attackerGuildId == null &&
      !(defenderGuildId == null && isTileOutpostId(outpost.id))
    ) {
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
    const attackerVigor = parseWarVigor(attackerSave.warVigor);
    const aMaxMp = attacker.player.maxMp ?? 0;

    // ===================== 약탈(raid) =====================
    if (mode === "raid") {
      // 약탈 = 거점 금고 50% 탈취 — 길드 금고가 있는 길드↔길드 전용. 솔로(금고 없음)는 정복만.
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
      // 수비 성공 시 점령 길드(수비자 소속)에 누적할 명성 — tx 끝에서 단일 UPDATE.
      let defenderFameDelta = 0;

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
            {
              pickAction: () => ({ kind: "attack" }),
              potions: { p1: {}, p2: {} },
            },
          );
          won = pvp.outcome === "p1_win";
          replay = toPvpReplayPayload(pvp.finalState, defenderName, 200);
          const dMaxMp = defender.player.maxMp ?? 0;
          await upsertSave(tx, userId, "character.v2", {
            ...attackerSave,
            warVigor: vigorAfterBattle(
              pvp.finalState.p1.hp,
              attacker.maxHp,
              pvp.finalState.p1.mp,
              aMaxMp,
              now,
            ),
          });
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
        stolenGold = Math.floor(treasury * RAID_TREASURY_STEAL_FRAC);
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

      return {
        status: 200,
        body: {
          ok: true as const,
          mode: "raid" as const,
          won,
          stolenGold,
          defenderName,
          replay,
        },
      };
    }

    // ===================== 정복(conquest) =====================
    // 큐 전원 건틀릿 — 공격자 HP 가 전투 사이에 이월(MP 는 매치 풀충전). 진 수비자는 큐 탈락.
    let currentHp = Math.max(1, Math.floor(attacker.maxHp * attackerVigor.hp));
    let attackerFinal: { hp: number; mp: number } | null = null;
    let defendersDefeated = 0;
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
        { pickAction: () => ({ kind: "attack" }), potions: { p1: {}, p2: {} } },
      );
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
    let downgradedTo: string | null = null;
    const fortMaxHp = occRow.fortMaxHp ?? FORT_MAX_HP;
    let fortHpAfter = currentFortHp(
      occRow.fortHp,
      fortMaxHp,
      occRow.fortUpdatedAt,
      new Date(now),
    );

    if (clearedQueue) {
      // 수비 길드 금고 자동 수리(데미지 전·claim 미러). 정복은 공격자 골드 안 씀 → 수비 길드만 잠금.
      //   솔로 타일(defenderGuildId=null)은 길드 금고가 없어 성벽 자동 수리 없음(데미지 그대로).
      if (defenderGuildId != null && fortHpAfter < fortMaxHp) {
        // 🔑 lock 먼저 — 잠근 잔액으로 수리 HP 계산. read-then-lock 이면 그 사이 동시 tx 가 골드를
        //   바꿔 stale 잔액으로 수리 + 음수 클램프(골드 보존 깨짐). repairHpFromGold 가 잔액으로
        //   hp 를 캡하므로 차감 후 항상 ≥0.
        const dr = await lockGuildResources(tx, defenderGuildId);
        const hp = repairHpFromGold(fortMaxHp - fortHpAfter, dr.gold);
        if (hp > 0) {
          fortHpAfter += hp;
          await upsertGuildResources(tx, defenderGuildId, {
            gold: dr.gold - hp * REPAIR_GOLD_PER_HP,
          });
        }
      }
      const damaged = Math.max(0, fortHpAfter - SIEGE_DAMAGE_PER_WIN);
      const newOccupiedAt = new Date();
      if (damaged <= 0) {
        // 함락 — 소유 이전 + 성벽 풀충전 + 보호막.
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
        // village 는 카탈로그 거점(비-타일)만 — 그 경우 공격자는 항상 길드 소속(위 게이트가
        //   솔로 공격자를 솔로 타일로 한정)이라 attackerGuildId 는 여기서 non-null.
        if (village && attackerGuildId != null) {
          const transferred = normalizeVillageOwner(village, attackerGuildId);
          const down = prevTier(village.tier);
          const downTier = down ?? village.tier;
          const maxSlots = MAX_SLOTS_BY_TIER[downTier];
          const newUnlocked = Math.min(transferred.unlockedSlots, maxSlots);
          const newSlotKinds: typeof transferred.slotKinds = {};
          for (const [k, v] of Object.entries(transferred.slotKinds)) {
            if (Number(k) < newUnlocked) newSlotKinds[Number(k)] = v;
          }
          await upsertVillage(tx, {
            ...transferred,
            tier: downTier,
            unlockedSlots: newUnlocked,
            slotKinds: newSlotKinds,
          });
          downgradedTo = down ? VILLAGE_TIER_NAME[downTier] : null;
        }
        // 소유 변경 → 옛 소유 길드의 수비 큐 전체 제거.
        await tx
          .delete(outpostDefenders)
          .where(eq(outpostDefenders.outpostId, outpost.id));
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

    return {
      status: 200,
      body: {
        ok: true as const,
        mode: "conquest" as const,
        clearedQueue,
        captured,
        fortHp: fortHpAfter,
        fortMaxHp,
        downgradedTo,
        defendersDefeated,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
