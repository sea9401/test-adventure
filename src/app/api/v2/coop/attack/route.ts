import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  coopBossAttackLog,
  coopBossContributors,
  coopBossSessions,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { recordGrowthLeapStaminaSpendInTx } from "@/lib/server/growthLeapProgress";
import { insertNotificationMany } from "@/lib/server/v2Notifications";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { prepareV2BattleActor } from "@/lib/server/v2BattlePrep";
import { insertFeedEntry } from "@/lib/server/serverFeed";
import { appendLog, resolveBattle } from "@/adventure/v2/combat/engine";
import { pickAutoAction } from "@/adventure/v2/combat/pickAutoAction";
import {
  COOP_ATTACK_STAMINA_COST,
  COOP_ATTACK_TURNS,
  COOP_BOSSES,
  coopBossForBattle,
  coopCriticalDamageFromLog,
  coopTierForRatio,
  parseCoopBossKindId,
  type CoopBossKindId,
  coopAttackCooldownMs,
  canAccessCoopBoss,
  parseCoopMechanicState,
  coopBossCurrentMp,
  coopBossMaxMp,
  coopBossMpPressureDamage,
  isStandardCoopBossKindId,
  withCoopBossMp,
  coopBossTrackingThreat,
  coopBossTrackingThreatMax,
  withCoopBossTrackingThreat,
  coopInvincibleFortressState,
  withCoopInvincibleFortressState,
  coopInvincibleFortressDisplay,
  coopSkywardCrystalEyeState,
  withCoopSkywardCrystalEyeState,
  coopSkywardCrystalEyeDisplay,
} from "@/adventure/data/v2/coopBosses";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import {
  applyRegen,
  parseStaminaFromSave,
  staminaConfigForCharacter,
  tryConsume,
} from "@/adventure/v2/stamina";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { toReplayPayload } from "@/adventure/data/v2/replayPayload";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import {
  COOP_COIN_MATERIAL_ID,
  coopKillingBlowReward,
} from "@/adventure/data/v2/coopRewards";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { COOP_BOSS_MAX_HP_DAMAGE_MULT } from "@/adventure/data/v2/v2CombatConstants";

// POST /api/v2/coop/attack — 협동 보스 1회 공격.
//
// 본문: { sessionId } — 같은 종류 동시 다수 소환(#714)이라 kind 가 아닌 세션 인스턴스 대상.
// 서버 권위 흐름(hunt 라우트와 같은 골격 — 단일 트랜잭션):
//   1. character.v2 잠금(전 라우트 공통 첫 락) → 스태미너 차감 가능 검사.
//   2. equipment/skills/proficiency lock-read → derive(왕복 0).
//   3. 세션 조기 검증(비잠금) → resolveBattle 시뮬(일반 PvE와 같은 3,000 ATB 틱, 전역 잔여
//      HP 시작 + 발악 스테이지 적용 — 플레이어는 현재 HP/MP와 무관하게 만전으로 시작).
//   4. session FOR UPDATE → 재검증(처치/만료) + 쿨다운 → hp 차감 + 처치 CAS(락 보유로
//      1명만 defeated 분기 — v1 attack.ts 의 C1/C2 race fix 승계).
//   5. contributor UPSERT + 공격 로그 1줄.
//   6. character.v2 에 스태미너와 처치 확정타 보상을 기록 — 협동 보스는 현재 HP/MP 를 소모하지 않는 별도 전투.
//      세션 검증을 통과한 뒤에만 쓰므로 쿨다운/만료 거부 시 스태미너 미소모.
// 처치 확정자(킬 CAS)는 트랜잭션 안에서 소액 막타 보상을 즉시 받고, tx 후 coop_kill 피드를
// 발행한다. 기여 보상은 별도 claim(본인 세이브만 — 교차 유저 락 0 원칙).

type CharSave = {
  stamina?: unknown;
  staminaCapBonus?: unknown;
  materials?: unknown;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const maybeUserId = await ensureUser();
  if (!maybeUserId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const userId: string = maybeUserId;
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:coop:attack",
    userLimit: 90,
    ipLimit: 500,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { sessionId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.length > 0
      ? body.sessionId
      : null;
  if (!sessionId) {
    return Response.json({ ok: false, error: "bad_session" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const now = Date.now();
    // === 1. character.v2 잠금 + 스태미너 게이트 ===
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const stamina = parseStaminaFromSave(charSave.stamina, now);
    const staminaConfig = staminaConfigForCharacter(charSave, now);
    const staminaMax = staminaConfig.max;
    const afterStamina = tryConsume(
      stamina,
      COOP_ATTACK_STAMINA_COST,
      now,
      staminaMax,
      staminaConfig.regenBonusPct,
    );
    if (!afterStamina) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "out_of_stamina" as const,
          stamina: applyRegen(
            stamina,
            now,
            staminaMax,
            staminaConfig.regenBonusPct,
          ),
        },
      };
    }

    // === 2. derive preload (hunt 와 동일 락 순서: character→equipment→skills→proficiency) ===
    const preparedActor = await prepareV2BattleActor({
      tx,
      userId,
      charSave,
    });
    if (!preparedActor) {
      return {
        status: 400,
        body: { ok: false as const, error: "no_character" as const },
      };
    }
    const { player, skills: v2Skills } = preparedActor;

    // === 3. 세션 조기 검증(비잠금 — 시뮬 전 빠른 거부) + kind 해석 ===
    const peekRows = await tx
      .select()
      .from(coopBossSessions)
      .where(eq(coopBossSessions.id, sessionId))
      .limit(1);
    const sessionPeek = peekRows[0];
    if (
      !sessionPeek ||
      sessionPeek.defeatedAt !== null ||
      sessionPeek.expiresAt.getTime() <= now
    ) {
      return {
        status: 404,
        body: { ok: false as const, error: "no_active_boss" as const },
      };
    }
    // 코어루프 — 가시성/공격 권한(공개/길드원만/소환자만). 소환자가 소환 "후" 범위를 바꿀 수 있어
    //   (코드 부재 시 race) peek 는 빠른 거절용이고, 아래 FOR UPDATE 잠금 후 한 번 더 재검증한다.
    const viewerGuildId = await getGuildId(tx, userId);
    if (!canAccessCoopBoss(sessionPeek, { userId, guildId: viewerGuildId })) {
      return {
        status: 403,
        body: { ok: false as const, error: "no_permission" as const },
      };
    }
    const kindId = parseCoopBossKindId(sessionPeek.regionId);
    if (!kindId) {
      return {
        status: 400,
        body: { ok: false as const, error: "bad_session" as const },
      };
    }
    const kind = COOP_BOSSES[kindId];
    const peekMechanicState = parseCoopMechanicState(sessionPeek.mechanicState);
    const bossMaxMp = coopBossMaxMp(kind);
    const bossStartMp = coopBossCurrentMp(kind, peekMechanicState);
    const bossBattleStartMp = Math.min(
      bossStartMp,
      kind.base.v2MaxMp ?? bossStartMp,
    );
    const trackingThreatMax = coopBossTrackingThreatMax(kind);
    const trackingThreatAtStart = coopBossTrackingThreat(
      kind,
      peekMechanicState,
    );
    const fortressStateAtStart = kindId === "invincible_fortress"
      ? coopInvincibleFortressState(
          kind,
          sessionPeek.mechanicState,
          sessionPeek.hp,
        )
      : null;
    const crystalEyeStateAtStart = kindId === "skyward_crystal_eye"
      ? coopSkywardCrystalEyeState(kind, sessionPeek.mechanicState)
      : null;
    const bossMechanic =
      trackingThreatMax > 0
        ? {
            kind: "tracking_weapon" as const,
            initialThreat: trackingThreatAtStart,
          }
        : kindId === "toxic_blood_lord"
          ? { kind: "toxic_blood_lord" as const }
          : kindId === "glacial_colossus"
            ? { kind: "glacial_colossus" as const }
          : kindId === "invincible_fortress"
            ? {
                kind: "invincible_fortress" as const,
                sharedMaxHp: kind.sharedMaxHp,
                initialState: fortressStateAtStart!,
              }
          : kindId === "skyward_crystal_eye"
            ? {
                kind: "skyward_crystal_eye" as const,
                sharedMaxHp: kind.sharedMaxHp,
                initialState: crystalEyeStateAtStart!,
              }
          : undefined;

    // 전투 시뮬. 보스 hp = 전역 잔여
    // (#715 — 막타 처치가 리플레이에 보이고 damageDealt 자연 클램프. 동시 공격의 stale
    // 스냅샷 잔여분은 아래 GREATEST + min(s.hp) 클램프가 흡수).
    // 전역 잔여 HP 기준으로 발악 스테이지를 굽되, 전투 maxHp 는 공유 최대 HP로 유지한다.
    // 그래야 처형/HP비율 스킬이 "남은 HP를 최대 HP로 오인"하지 않는다.
    const { monster: bossMonsterForCurrentHp, enrageNotes } = coopBossForBattle(
      kind,
      sessionPeek.hp,
      {
        conditionalEnrageWeakened: sessionPeek.hardEnrageWeakened,
        bossMp: bossBattleStartMp,
      },
    );
    const bossStartHp = Math.max(
      1,
      Math.min(Math.floor(sessionPeek.hp), kind.sharedMaxHp),
    );
    const bossMonster = {
      ...bossMonsterForCurrentHp,
      hp: kind.sharedMaxHp,
    };
    const profile = await readSave<{ name?: string } | null>(
      tx,
      userId,
      "character-profile.v2",
      null,
    );
    const playerName = profile?.name?.trim() || "모험가";
    const battleMaxHp = player.maxHp;
    const battleMaxMp = player.player.maxMp ?? 0;
    const playerForBattle = {
      ...player.player,
      hp: battleMaxHp,
      mp: battleMaxMp,
    };
    const battleResult = resolveBattle(playerForBattle, bossMonster, playerName, {
      pickAction: (state) => pickAutoAction(state, { rules: [], potions: {} }),
      potions: {},
      v2Skills,
      isBoss: true, // %HP 효과 감산 + breaker 보너스.
      maxHpDamageMult: COOP_BOSS_MAX_HP_DAMAGE_MULT,
      // 발악 상태 안내 — 전투 로그 첫머리(현재 전역 HP 기준 적용 중인 스테이지).
      ...(enrageNotes.length > 0
        ? { openingNote: enrageNotes.join(" ") }
        : {}),
      // 라이브 ATB는 공통 3,000틱 제한이 먼저 끝낸다. maxTurns는 같은 수치의 안전 가드로만
      // 남겨 20행동 조기 종료 없이 생존·지속형 빌드도 전투 시간 전체를 활용하게 한다.
      // 타임아웃 lose 는 협동에선 정상 흐름이며 그때까지 준 데미지만 누적한다.
      maxTurns: COOP_ATTACK_TURNS,
      initialEnemyHp: bossStartHp,
      ...(bossMechanic ? { bossMechanic } : {}),
    });
    const damageDealt = Math.max(
      0,
      bossStartHp - battleResult.finalState.enemyHp,
    );
    const criticalDamageRaw = coopCriticalDamageFromLog(
      battleResult.finalState.log,
    );
    const damageTaken = Math.max(
      0,
      battleMaxHp - battleResult.finalState.playerHp,
    );
    const simulatedBossMpAfter = Math.max(
      0,
      Math.min(bossBattleStartMp, battleResult.finalState.enemyMp),
    );
    const bossMpSpentByCasts = Math.max(
      0,
      bossBattleStartMp - simulatedBossMpAfter,
    );
    const diedEarly = battleResult.finalState.playerHp <= 0;
    const battleTrackingState =
      battleResult.finalState.bossMechanic?.kind === "tracking_weapon"
        ? battleResult.finalState.bossMechanic
        : null;
    const battleToxicState =
      battleResult.finalState.bossMechanic?.kind === "toxic_blood_lord"
        ? battleResult.finalState.bossMechanic
        : null;
    const battleGlacialState =
      battleResult.finalState.bossMechanic?.kind === "glacial_colossus"
        ? battleResult.finalState.bossMechanic
        : null;
    const battleFortressState =
      battleResult.finalState.bossMechanic?.kind === "invincible_fortress"
        ? battleResult.finalState.bossMechanic
        : null;
    const battleCrystalEyeState =
      battleResult.finalState.bossMechanic?.kind === "skyward_crystal_eye"
        ? battleResult.finalState.bossMechanic
        : null;
    // === 4. session FOR UPDATE — 재검증 + 쿨다운 + 차감 + 처치 CAS ===
    const [s] = await tx
      .select()
      .from(coopBossSessions)
      .where(eq(coopBossSessions.id, sessionPeek.id))
      .for("update");
    if (!s || s.defeatedAt !== null || s.hp <= 0) {
      return {
        status: 409,
        body: { ok: false as const, error: "already_defeated" as const },
      };
    }
    if (fortressStateAtStart) {
      const lockedFortressState = coopInvincibleFortressState(
        kind,
        s.mechanicState,
        s.hp,
      );
      if (
        s.hp !== sessionPeek.hp ||
        JSON.stringify(lockedFortressState) !==
          JSON.stringify(fortressStateAtStart)
      ) {
        return {
          status: 409,
          body: { ok: false as const, error: "boss_state_changed" as const },
        };
      }
    }
    if (crystalEyeStateAtStart) {
      const lockedCrystalEyeState = coopSkywardCrystalEyeState(
        kind,
        s.mechanicState,
      );
      if (
        s.hp !== sessionPeek.hp ||
        JSON.stringify(lockedCrystalEyeState) !==
          JSON.stringify(crystalEyeStateAtStart)
      ) {
        return {
          status: 409,
          body: { ok: false as const, error: "boss_state_changed" as const },
        };
      }
    }
    if (s.expiresAt.getTime() <= now) {
      return {
        status: 410,
        body: { ok: false as const, error: "expired" as const },
      };
    }
    // 가시성 race 가드 — 시뮬 도중 전체 공개 전의 범위를 좁혔으면 잠금 후 거절(데미지 미반영).
    if (!canAccessCoopBoss(s, { userId, guildId: viewerGuildId })) {
      return {
        status: 403,
        body: { ok: false as const, error: "no_permission" as const },
      };
    }
    const [contrib] = await tx
      .select({ lastAttackAt: coopBossContributors.lastAttackAt })
      .from(coopBossContributors)
      .where(
        and(
          eq(coopBossContributors.sessionId, s.id),
          eq(coopBossContributors.userId, userId),
        ),
      );
    if (contrib?.lastAttackAt) {
      const nextAt = contrib.lastAttackAt.getTime() + coopAttackCooldownMs();
      if (now < nextAt) {
        return {
          status: 429,
          body: {
            ok: false as const,
            error: "cooldown" as const,
            retryAfterMs: nextAt - now,
          },
        };
      }
    }

    // 오버킬 클램프 — 기여도(contributor.damage)는 실제로 깎은 양만 적립
    // (시뮬은 peek 시점 잔여 HP 시작이라 보통 안 넘치지만, 동시 공격의 stale 스냅샷 흡수).
    const appliedDamage = Math.min(damageDealt, s.hp);
    const appliedCriticalDamage =
      damageDealt > 0
        ? Math.min(
            appliedDamage,
            Math.floor((criticalDamageRaw * appliedDamage) / damageDealt),
          )
        : 0;
    const projectedBossHp = Math.max(0, s.hp - appliedDamage);
    const bossBleedingAtEnd = battleResult.finalState.enemyV2Dots.some(
      (dot) => dot.tag === "bleed" && dot.stacks > 0 && dot.turns > 0,
    );
    const conditionalEnrage = kind.conditionalEnrage;
    const weakenConditionalEnrage =
      conditionalEnrage != null &&
      !s.hardEnrageWeakened &&
      s.hp / Math.max(1, s.maxHp) > conditionalEnrage.hpFraction &&
      projectedBossHp / Math.max(1, s.maxHp) <= conditionalEnrage.hpFraction &&
      (kindId === "abyssal_tyrant"
        ? appliedCriticalDamage > 0
        : bossBleedingAtEnd);
    const currentBossMp = coopBossCurrentMp(kind, s.mechanicState);
    const bossMpPressureDamage = coopBossMpPressureDamage(
      battleResult.finalState.log,
      {
        damageDealt: appliedDamage,
        bossMaxHp: s.maxHp,
        bossMaxMp,
      },
    );
    const appliedBossMpDamage = Math.min(
      currentBossMp,
      bossMpSpentByCasts + bossMpPressureDamage,
    );
    const nextBossMp = Math.max(0, currentBossMp - appliedBossMpDamage);
    const nextMechanicStateWithMp = withCoopBossMp(
      kind,
      s.mechanicState,
      nextBossMp,
    );
    const nextTrackingThreat =
      projectedBossHp <= 0 ? 0 : (battleTrackingState?.trackingThreat ?? 0);
    let nextMechanicState = withCoopBossTrackingThreat(
      kind,
      nextMechanicStateWithMp,
      nextTrackingThreat,
    );
    if (kindId === "invincible_fortress") {
      if (projectedBossHp > 0 && battleFortressState) {
        nextMechanicState = withCoopInvincibleFortressState(
          kind,
          nextMechanicState,
          battleFortressState,
          projectedBossHp,
        );
      } else {
        const { fortress: _terminalFortress, ...terminalMechanicState } =
          nextMechanicState;
        nextMechanicState = terminalMechanicState;
      }
    }
    if (kindId === "skyward_crystal_eye") {
      if (projectedBossHp > 0 && battleCrystalEyeState) {
        nextMechanicState = withCoopSkywardCrystalEyeState(
          kind,
          nextMechanicState,
          battleCrystalEyeState,
        );
      } else {
        const { crystalEye: _terminalCrystalEye, ...terminalMechanicState } =
          nextMechanicState;
        nextMechanicState = terminalMechanicState;
      }
    }
    const nowDate = new Date(now);
    const [updated] = await tx
      .update(coopBossSessions)
      .set({
        hp: sql`GREATEST(0, ${coopBossSessions.hp} - ${appliedDamage})`,
        ...(weakenConditionalEnrage ? { hardEnrageWeakened: true } : {}),
        mechanicState: nextMechanicState,
      })
      .where(eq(coopBossSessions.id, s.id))
      .returning({ hp: coopBossSessions.hp });
    const bossHp = updated?.hp ?? s.hp;
    const killingBlowReward =
      bossHp === 0 && isStandardCoopBossKindId(kindId)
        ? coopKillingBlowReward(kindId)
        : null;
    if (bossHp === 0) {
      // 처치 — 락 보유로 이 분기는 정확히 1명(킬 CAS). nextSpawnAt 없음(소환형).
      await tx
        .update(coopBossSessions)
        .set({ defeatedAt: nowDate })
        .where(eq(coopBossSessions.id, s.id));
    }

    const replay = toReplayPayload(
      killingBlowReward
        ? {
            ...battleResult.finalState,
            log: appendLog(battleResult.finalState.log, {
              kind: "info",
              turn: "player",
              text: `[처치 확정타] 협동 주화 ×${killingBlowReward.coin} · ${killingBlowReward.bossMaterialName} ×${killingBlowReward.bossMaterialCount} 획득`,
            }),
          }
        : battleResult.finalState,
      { playerCombat: playerForBattle },
    );

    // === 5. contributor UPSERT + 공격 로그 ===
    await tx
      .insert(coopBossContributors)
      .values({
        sessionId: s.id,
        userId,
        damage: appliedDamage,
        attackCount: 1,
        lastAttackAt: nowDate,
      })
      .onConflictDoUpdate({
        target: [coopBossContributors.sessionId, coopBossContributors.userId],
        set: {
          damage: sql`${coopBossContributors.damage} + ${appliedDamage}`,
          attackCount: sql`${coopBossContributors.attackCount} + 1`,
          lastAttackAt: nowDate,
        },
      });
    const [myRow] = await tx
      .select({ damage: coopBossContributors.damage })
      .from(coopBossContributors)
      .where(
        and(
          eq(coopBossContributors.sessionId, s.id),
          eq(coopBossContributors.userId, userId),
        ),
      );
    const myDamage = myRow?.damage ?? appliedDamage;
    const [attackLog] = await tx
      .insert(coopBossAttackLog)
      .values({
        sessionId: s.id,
        userId,
        name: playerName,
        damageDealt: appliedDamage,
        damageTaken,
        diedEarly,
        log: replay,
        createdAt: nowDate,
      })
      .returning({ id: coopBossAttackLog.id });

    // === 6. character.v2 스태미너 + 처치 확정타 보상 기록 — HP/MP·회복약은 협동 보스 전투와 분리 ===
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      stamina: afterStamina,
      ...(killingBlowReward
        ? {
            materials: mergeDrops(charSave.materials, {
              [COOP_COIN_MATERIAL_ID]: killingBlowReward.coin,
              [killingBlowReward.bossMaterialId]:
                killingBlowReward.bossMaterialCount,
            }),
          }
        : {}),
    });
    await recordGrowthLeapStaminaSpendInTx(
      tx,
      userId,
      COOP_ATTACK_STAMINA_COST,
      now,
    );

    return {
      status: 200,
      body: {
        ok: true as const,
        stamina: afterStamina,
        result: {
          attackId: attackLog.id,
          kind: kindId,
          damageDealt: appliedDamage,
          damageTaken,
          diedEarly,
          turns: battleResult.turns,
          bossHp,
          bossMaxHp: s.maxHp,
          bossMp: nextBossMp,
          bossMaxMp,
          bossMpDamage: appliedBossMpDamage,
          bossMpDepleted: currentBossMp > 0 && nextBossMp === 0,
          trackingThreat: nextTrackingThreat,
          trackingThreatMax,
          trackingReady:
            trackingThreatMax > 0 && nextTrackingThreat >= trackingThreatMax,
          trackingCounterCount:
            battleTrackingState?.trackingCounterCount ?? 0,
          trackingCounterDamage:
            battleTrackingState?.trackingCounterDamage ?? 0,
          toxicBloodStacks: battleToxicState?.toxicBloodStacks ?? 0,
          toxicRecoveryLockActions:
            battleToxicState?.toxicRecoveryLockActions ?? 0,
          toxicExplosionCount: battleToxicState?.toxicExplosionCount ?? 0,
          toxicDamageTaken: battleToxicState?.toxicDamageTaken ?? 0,
          glacialChillStacks:
            battleGlacialState?.glacialChillStacks ?? 0,
          glacialFreezePending:
            battleGlacialState?.glacialFreezePending ?? 0,
          glacialFreezeCount:
            battleGlacialState?.glacialFreezeCount ?? 0,
          glacialSkippedActionCount:
            battleGlacialState?.glacialSkippedActionCount ?? 0,
          fortressCompletedResults:
            battleFortressState?.barrierResults ?? [],
          ...coopInvincibleFortressDisplay(
            kind,
            nextMechanicState,
            bossHp,
          ),
          ...coopSkywardCrystalEyeDisplay(
            kind,
            nextMechanicState,
            bossHp,
          ),
          crystalEyeArtilleryEvents:
            battleResult.finalState.skywardCrystalEyeArtilleryEvents ?? [],
          defeated: bossHp === 0,
          myDamage,
          myTier: kind.rewardMode === "coop"
            ? coopTierForRatio(myDamage / Math.max(1, s.maxHp), kindId)
            : null,
          killingBlowReward,
          replay,
        },
      },
    };
  });

  // 처치 피드/개인 알림 — 킬 CAS 를 점유한 1명만(트랜잭션 밖 — 부수 효과).
  const defeatedResult =
    result.status === 200 && result.body.ok ? result.body.result : null;
  if (defeatedResult?.defeated) {
    const defeatedKind = defeatedResult.kind as CoopBossKindId;
    const isStandardReward = isStandardCoopBossKindId(defeatedKind);
    if (defeatedResult.killingBlowReward) {
      recordEconomyEventSoon({
        userId,
        eventType: "reward.coop.killing_blow",
        itemKind: "coop_killing_blow_bundle",
        quantity: 1,
        detail: {
          sessionId,
          kind: defeatedKind,
          coopCoin: defeatedResult.killingBlowReward.coin,
          bossMaterialId: defeatedResult.killingBlowReward.bossMaterialId,
          bossMaterialCount:
            defeatedResult.killingBlowReward.bossMaterialCount,
        },
      });
    }
    if (isStandardReward) {
      await insertFeedEntry(userId, "coop_kill", {
        kind: defeatedKind,
        sessionId,
      });
    }
    const contributors = await db
      .select({
        userId: coopBossContributors.userId,
        damage: coopBossContributors.damage,
      })
      .from(coopBossContributors)
      .where(eq(coopBossContributors.sessionId, sessionId));
    const recipients = isStandardReward
      ? contributors
          .filter((c) =>
            coopTierForRatio(
              c.damage / Math.max(1, defeatedResult.bossMaxHp),
              defeatedKind,
            ),
          )
          .map((c) => c.userId)
      : [];
    if (recipients.length > 0) {
      const bossName = COOP_BOSSES[defeatedKind]?.name ?? defeatedKind;
      await insertNotificationMany(recipients, "coop_defeated", {
        sessionId,
        kindId: defeatedKind,
        bossName,
      });
    }
  }

  return Response.json(result.body, { status: result.status });
}
