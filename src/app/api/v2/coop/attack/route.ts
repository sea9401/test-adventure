import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  coopBossAttackLog,
  coopBossContributors,
  coopBossSessions,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { insertFeedEntry } from "@/lib/server/serverFeed";
import { resolveBattle } from "@/adventure/v2/combat/engine";
import { pickAutoAction } from "@/adventure/v2/combat/pickAutoAction";
import {
  COOP_ATTACK_STAMINA_COST,
  COOP_ATTACK_TURNS,
  COOP_BOSSES,
  coopBossForBattle,
  coopTierForRatio,
  parseCoopBossKindId,
  coopAttackCooldownMs,
  canAccessCoopBoss,
} from "@/adventure/data/v2/coopBosses";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import {
  MAX_STAMINA,
  applyRegen,
  parseStaminaFromSave,
  staminaCapBonusOf,
  tryConsume,
} from "@/adventure/v2/stamina";
import {
  applyHpRegen,
  canHuntWithHp,
  parseHpRegenSince,
} from "@/adventure/v2/hpRegen";
import {
  elementDamageMult,
  parseV2Element,
  V2_ELEMENT_ADV_PCT,
  V2_ELEMENT_DIS_PCT,
  type V2Element,
} from "@/adventure/data/v2/elements";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { emptyProficiency } from "@/adventure/data/v2/proficiency";
import { sanitizeCombatLoadout } from "@/lib/server/v2Skills";
import { readCodexSpBonus } from "@/lib/server/codexSpBonus";
import type { EquipmentSave } from "@/adventure/data/v2/v2Equipment";
import { toReplayPayload } from "@/adventure/data/v2/replayPayload";

// POST /api/v2/coop/attack — 협동 보스 1회 공격.
//
// 본문: { sessionId } — 같은 종류 동시 다수 소환(#714)이라 kind 가 아닌 세션 인스턴스 대상.
// 서버 권위 흐름(hunt 라우트와 같은 골격 — 단일 트랜잭션):
//   1. character.v2 잠금(전 라우트 공통 첫 락) → 스태미너 차감 가능 검사 + HP 게이트.
//   2. equipment/skills/proficiency lock-read → derive(왕복 0).
//   3. 세션 조기 검증(비잠금) → resolveBattle 시뮬(COOP_ATTACK_TURNS 턴 캡, 전역 잔여
//      HP 시작 + 발악 스테이지 적용 — 실제 차감은 아래 GREATEST 클램프).
//   4. session FOR UPDATE → 재검증(처치/만료) + 쿨다운 → hp 차감 + 처치 CAS(락 보유로
//      1명만 defeated 분기 — v1 attack.ts 의 C1/C2 race fix 승계).
//   5. contributor UPSERT + 공격 로그 1줄.
//   6. character.v2(스태미너·HP/MP)·inventory.v2(충전약 자동 회복) 기록 — 세션 검증을
//      통과한 뒤에만 쓰므로 쿨다운/만료 거부 시 스태미너 미소모.
// 처치 확정자(킬 CAS)는 tx 후 coop_kill 피드 발행. 보상은 별도 claim(본인 세이브만 —
// 교차 유저 락 0 원칙).

type CharSave = {
  stamina?: unknown;
  staminaCapBonus?: unknown;
  hp?: number;
  hpRegenSince?: number;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const maybeUserId = await ensureUser();
  if (!maybeUserId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const userId: string = maybeUserId;

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

  let defeatedNow = false;
  let defeatedKind: string | null = null;
  const result = await db.transaction(async (tx) => {
    const now = Date.now();
    // === 1. character.v2 잠금 + 스태미너/HP 게이트 ===
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const stamina = parseStaminaFromSave(charSave.stamina, now);
    const staminaMax =
      MAX_STAMINA + staminaCapBonusOf(charSave.staminaCapBonus);
    // 코어루프 — 스태미나 폐지(소환권이 비용). 무료 공격, 180s 쿨다운이 throttle. off — 기존 차감.
    let afterStamina = applyRegen(stamina, now, staminaMax);
    if (!V2_CORE_LOOP_V2) {
      const after = tryConsume(stamina, COOP_ATTACK_STAMINA_COST, now, staminaMax);
      if (!after) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "out_of_stamina" as const,
            stamina: applyRegen(stamina, now, staminaMax),
          },
        };
      }
      afterStamina = after;
    }

    // === 2. derive preload (hunt 와 동일 락 순서: character→equipment→skills→proficiency) ===
    const equipmentSave = await lockSaveForUpdate<EquipmentSave>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const skillsRaw = await lockSaveForUpdate(
      tx,
      userId,
      "skills.v2",
      emptyV2SkillsState() as unknown as Record<string, unknown>,
    );
    const proficiencyRaw = await lockSaveForUpdate(
      tx,
      userId,
      "proficiency.v2",
      emptyProficiency() as unknown as Record<string, unknown>,
    );
    // 코어루프 — 전투 직전 로드아웃 sanitize(SP 예산/직업고정 강제). flag off=원본 그대로(추가 작업 0).
    const v2SkillsParsed = parseV2SkillsState(skillsRaw);
    const codexBonus = V2_CORE_LOOP_V2
      ? await readCodexSpBonus(tx, userId)
      : null;
    const v2Skills = V2_CORE_LOOP_V2
      ? sanitizeCombatLoadout(
          v2SkillsParsed,
          charSave,
          proficiencyRaw,
          codexBonus?.total ?? 0,
        )
      : v2SkillsParsed;
    const player = await derivePlayerCombatV2(userId, tx, {
      character: charSave,
      equipmentSave,
      proficiencyRaw,
      skillsRaw,
    });
    if (!player) {
      return {
        status: 400,
        body: { ok: false as const, error: "no_character" as const },
      };
    }

    // 사냥과 동일한 사전 HP 회복 + 저체력 게이트(5% 미만 차단·스태미너 미소모).
    const regenResult = applyHpRegen(
      Math.max(0, charSave.hp ?? player.maxHp),
      player.maxHp,
      parseHpRegenSince(charSave.hpRegenSince, now),
      now,
    );
    if (!canHuntWithHp(regenResult.hp, player.maxHp)) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "hp_zero" as const,
          stamina: applyRegen(stamina, now, staminaMax),
        },
      };
    }

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
    let viewerGuildId: number | null = null;
    if (V2_CORE_LOOP_V2) {
      viewerGuildId = await getGuildId(tx, userId);
      if (
        !canAccessCoopBoss(sessionPeek, { userId, guildId: viewerGuildId })
      ) {
        return {
          status: 403,
          body: { ok: false as const, error: "no_permission" as const },
        };
      }
    }
    const kindId = parseCoopBossKindId(sessionPeek.regionId);
    if (!kindId) {
      return {
        status: 400,
        body: { ok: false as const, error: "bad_session" as const },
      };
    }
    const kind = COOP_BOSSES[kindId];

    // 전투 시뮬 — hunt 와 동일한 속성 baked atk + 캐릭 속성. 보스 hp = 전역 잔여
    // (#715 — 막타 처치가 리플레이에 보이고 damageDealt 자연 클램프. 동시 공격의 stale
    // 스냅샷 잔여분은 아래 GREATEST + min(s.hp) 클램프가 흡수).
    const playerElement = parseV2Element(
      (charSave as { element?: unknown }).element,
    );
    const basicAttackElement: V2Element =
      player.weaponElement !== "neutral" ? player.weaponElement : playerElement;
    // 전역 잔여 HP 기준으로 발악 스테이지를 굽되, 전투 maxHp 는 공유 최대 HP로 유지한다.
    // 그래야 처형/HP비율 스킬이 "남은 HP를 최대 HP로 오인"하지 않는다.
    const { monster: bossMonsterForCurrentHp, enrageNotes } = coopBossForBattle(
      kind,
      sessionPeek.hp,
    );
    const bossStartHp = Math.max(
      1,
      Math.min(Math.floor(sessionPeek.hp), kind.sharedMaxHp),
    );
    const bossMonster = {
      ...bossMonsterForCurrentHp,
      hp: kind.sharedMaxHp,
    };
    const playerElemMult = elementDamageMult(
      basicAttackElement,
      bossMonster.element ?? "neutral",
      // 원소 통달(원소술사) — 유리/불리 +%p 가산. 미보유=0 → 전역 상수(기존 동작 동일). hunt 와 동일.
      V2_ELEMENT_ADV_PCT + (player.player.elementAdvPctBonus ?? 0),
      V2_ELEMENT_DIS_PCT + (player.player.elementDisPctBonus ?? 0),
    );
    const profile = await readSave<{ name?: string } | null>(
      tx,
      userId,
      "character-profile.v2",
      null,
    );
    const playerName = profile?.name?.trim() || "모험가";
    const playerForBattle = {
      ...player.player,
      hp: regenResult.hp,
      mp: player.player.mp,
      atk: Math.max(1, Math.round(player.player.atk * playerElemMult)),
      magicAtk: Math.max(
        0,
        Math.round((player.player.magicAtk ?? 0) * playerElemMult),
      ),
      attackElement: basicAttackElement,
      characterElement: playerElement,
    };
    const battleResult = resolveBattle(playerForBattle, bossMonster, playerName, {
      pickAction: (state) => pickAutoAction(state, { rules: [], potions: {} }),
      potions: {},
      v2Skills,
      isBoss: true, // %HP 효과 감산 + breaker 보너스.
      // 발악 상태 안내 — 전투 로그 첫머리(현재 전역 HP 기준 적용 중인 스테이지).
      ...(enrageNotes.length > 0
        ? { openingNote: enrageNotes.join(" ") }
        : {}),
      // 1회 공격 = 플레이어 행동 N회. ATB 경로의 maxTurns 는 플레이어 행동 카운터라
      // 레거시 페이즈 보정(*2)을 적용하면 코어루프에서 공격권이 두 배 길어진다.
      // 도달 시 종료(타임아웃 lose 는 협동에선 정상 흐름 — 데미지만 누적).
      maxTurns: COOP_ATTACK_TURNS,
      initialEnemyHp: bossStartHp,
    });
    const damageDealt = Math.max(
      0,
      bossStartHp - battleResult.finalState.enemyHp,
    );
    const damageTaken = Math.max(
      0,
      regenResult.hp - battleResult.finalState.playerHp,
    );
    const diedEarly = battleResult.finalState.playerHp <= 0;

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
    if (s.expiresAt.getTime() <= now) {
      return {
        status: 410,
        body: { ok: false as const, error: "expired" as const },
      };
    }
    // 가시성 race 가드 — 시뮬 도중 소환자가 범위를 좁혔으면(예: 공개→나만) 잠금 후 거절(데미지 미반영).
    if (
      V2_CORE_LOOP_V2 &&
      !canAccessCoopBoss(s, { userId, guildId: viewerGuildId })
    ) {
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
    const nowDate = new Date(now);
    const [updated] = await tx
      .update(coopBossSessions)
      .set({
        hp: sql`GREATEST(0, ${coopBossSessions.hp} - ${appliedDamage})`,
      })
      .where(eq(coopBossSessions.id, s.id))
      .returning({ hp: coopBossSessions.hp });
    const bossHp = updated?.hp ?? s.hp;
    if (bossHp === 0) {
      // 처치 — 락 보유로 이 분기는 정확히 1명(킬 CAS). nextSpawnAt 없음(소환형).
      await tx
        .update(coopBossSessions)
        .set({ defeatedAt: nowDate })
        .where(eq(coopBossSessions.id, s.id));
      defeatedNow = true;
      defeatedKind = kindId;
    }

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
    await tx.insert(coopBossAttackLog).values({
      sessionId: s.id,
      userId,
      name: playerName,
      damageDealt: appliedDamage,
      damageTaken,
      diedEarly,
      log: [], // 전체 로그는 응답 replay 로만 — DB 비대화 방지(피드는 데미지 라인).
      createdAt: nowDate,
    });

    // === 6. character.v2(스태미너·HP/MP) + inventory.v2 충전약 — hunt 와 동일 ===
    let afterHp = Math.max(0, battleResult.finalState.playerHp);
    const maxMp = player.player.maxMp ?? 0;
    let afterMp = Math.max(
      0,
      Math.min(maxMp, battleResult.finalState.playerMp),
    );
    const invSave = await lockSaveForUpdate<{
      hpCharges?: number;
      mpCharges?: number;
      [k: string]: unknown;
    }>(tx, userId, "inventory.v2", {});
    let hpCharges = Math.max(0, invSave.hpCharges ?? 0);
    let mpCharges = Math.max(0, invSave.mpCharges ?? 0);
    if (afterHp > 0 && afterHp < player.maxHp && hpCharges > 0) {
      const restore = Math.min(player.maxHp - afterHp, hpCharges);
      afterHp += restore;
      hpCharges -= restore;
    }
    if (afterMp < maxMp && mpCharges > 0) {
      const restore = Math.min(maxMp - afterMp, mpCharges);
      afterMp += restore;
      mpCharges -= restore;
    }
    await upsertSave(tx, userId, "inventory.v2", {
      ...invSave,
      hpCharges,
      mpCharges,
    });
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      stamina: afterStamina,
      hp: afterHp,
      mp: afterMp,
      hpRegenSince: now,
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        stamina: afterStamina,
        result: {
          kind: kindId,
          damageDealt: appliedDamage,
          damageTaken,
          diedEarly,
          turns: battleResult.turns,
          bossHp,
          bossMaxHp: s.maxHp,
          defeated: bossHp === 0,
          myDamage,
          myTier: coopTierForRatio(myDamage / Math.max(1, s.maxHp)),
          hpAfter: afterHp,
          maxHp: player.maxHp,
          hpCharges,
          mpCharges,
          replay: toReplayPayload(battleResult.finalState, 200),
        },
      },
    };
  });

  // 처치 피드 — 킬 CAS 를 점유한 1명만(트랜잭션 밖 — insertFeedEntry 자체가 실패 삼킴).
  if (defeatedNow && defeatedKind) {
    await insertFeedEntry(userId, "coop_kill", { kind: defeatedKind });
  }

  return Response.json(result.body, { status: result.status });
}
