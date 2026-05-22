import "server-only";

// 협동 토벌 보스 — attack 액션 처리.
//
// 클라는 playerName 만 보내고 PlayerCombat 은 서버에서 character.v2 + training.v2 로
// 재계산(위변조 방지). 세션 hp 차감 + contributor UPSERT + 공격 로그를 단일 트랜잭션으로
// 처리하고, 처치(defeated) 판정은 SELECT 시점의 stale hp 가 아니라 UPDATE 의 실제 결과(CAS)로 한다.

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  coopBossAttackLog,
  coopBossContributors,
  coopBossSessions,
} from "@/db/schema";
import { derivePlayerCombatFromSaves } from "@/lib/server/derivePlayerCombatFromSaves";
import { applyStance } from "@/adventure/character/stance";
import {
  COOP_ATTACK_COOLDOWN_MS,
  COOP_BOSSES,
  COOP_TIER_THRESHOLDS,
} from "@/adventure/coop/data";
import { simulateCoopAttack } from "@/adventure/coop/simulate";
import type { RegionId } from "@/adventure/data/world";
import { broadcastBossKill, setStoryFlagServer } from "./bossState";
import { applyLazyRegen } from "./regen";

export type CoopAttackBody = { action: "attack"; playerName: string };

export async function handleCoopAttack(
  userId: string,
  region: string,
  body: CoopAttackBody,
): Promise<Response> {
  const def = COOP_BOSSES[region as RegionId];
  if (!def) return new Response("region has no coop boss", { status: 400 });

  // 활성 세션 확인.
  let active = await db
    .select()
    .from(coopBossSessions)
    .where(
      and(
        eq(coopBossSessions.regionId, region),
        isNull(coopBossSessions.defeatedAt),
      ),
    )
    .limit(1);
  if (!active[0]) return new Response("no active boss", { status: 404 });

  // 월드 보스 lazy regen — 데미지 차감 직전에 분 단위 회복을 먼저 반영.
  // 그래야 "유저들 안 때리는 동안 보스가 풀피로 돌아왔다" 가 정확하게 모델링됨.
  await applyLazyRegen(active[0].id);
  active = await db
    .select()
    .from(coopBossSessions)
    .where(eq(coopBossSessions.id, active[0].id))
    .limit(1);
  const session = active[0];
  if (!session) return new Response("no active boss", { status: 404 });
  if (session.expiresAt < new Date()) {
    return new Response("session expired", { status: 410 });
  }
  if (session.hp <= 0) return new Response("already defeated", { status: 409 });

  // 서버측 PlayerCombat 재계산 — 저장된 character.v2 + training.v2 로 derive.
  // (클라가 보낸 stat 은 더 이상 신뢰하지 않음)
  const derived = await derivePlayerCombatFromSaves(userId);
  if (!derived) {
    return new Response("character not found", { status: 404 });
  }
  if (derived.player.hp <= 0) {
    return new Response("character is incapacitated", { status: 409 });
  }
  // 협동은 특수 전투 → 선택한 전술 적용(일반 사냥엔 미적용).
  const player = applyStance(derived.player, derived.selectedStance);

  // 시뮬레이션은 CPU 작업이라 트랜잭션 밖에서 — bossCurrentHp 는 in-tx SELECT 시점에 다시 클램프된다.
  const result = simulateCoopAttack({
    player,
    playerName: body.playerName ?? "모험가",
    bossName: session.bossName,
    bossCurrentHp: session.hp,
    bossMaxHp: session.maxHp,
    turns: 20,
  });

  // 세션/쿨다운/hp 차감/contributor 를 하나의 트랜잭션에 묶는다.
  // 핵심: session row 를 FOR UPDATE 로 잠가서 같은 보스에 대한 동시 공격을 직렬화.
  //   - C1 fix: 쿨다운 체크가 트랜잭션 밖이라 더블클릭으로 쿨다운 우회 + 데미지 중복 적용되던 race 제거.
  //   - C2 fix: 보스 처치 직후 후발 공격이 사망한 보스에 기여도/공격카운트를 적립하던 race 제거.
  // 이전 코멘트에 있던 "동시 UPDATE 직렬화 + GREATEST" 패턴은 hp 충돌 자체는 막아주지만,
  // 쿨다운/사망 가드를 함께 보장하지 못해 contributor / log 가 잘못 누적됨.
  const now = new Date();
  let realHp = session.hp;
  let iClaimedKill = false;
  let abortReason: "cooldown" | "defeated" | "expired" | null = null;
  let cooldownRetryMs = 0;

  await db.transaction(async (tx) => {
    // 1. session row FOR UPDATE — 이 트랜잭션 종료 전까진 다른 attack 이 이 보스를 못 만진다.
    const [s] = await tx
      .select()
      .from(coopBossSessions)
      .where(eq(coopBossSessions.id, session.id))
      .for("update");
    if (!s || s.defeatedAt !== null || s.hp <= 0) {
      abortReason = "defeated";
      return;
    }
    if (s.expiresAt < new Date()) {
      abortReason = "expired";
      return;
    }

    // 2. 쿨다운 — session lock 보유 중이라 contributor 읽기는 fresh.
    const [c] = await tx
      .select({ lastAttackAt: coopBossContributors.lastAttackAt })
      .from(coopBossContributors)
      .where(
        and(
          eq(coopBossContributors.sessionId, s.id),
          eq(coopBossContributors.userId, userId),
        ),
      );
    if (c?.lastAttackAt) {
      const next = c.lastAttackAt.getTime() + COOP_ATTACK_COOLDOWN_MS;
      if (Date.now() < next) {
        abortReason = "cooldown";
        cooldownRetryMs = next - Date.now();
        return;
      }
    }

    // 3. hp 차감 — lock 보유로 race 없음. GREATEST 는 안전 마진.
    const [updated] = await tx
      .update(coopBossSessions)
      .set({
        hp: sql`GREATEST(0, ${coopBossSessions.hp} - ${result.damageDealt})`,
      })
      .where(eq(coopBossSessions.id, s.id))
      .returning({ hp: coopBossSessions.hp });
    realHp = updated?.hp ?? s.hp;

    // 4. 사망 처리 — lock 보유로 1명만 이 분기.
    if (realHp === 0) {
      await tx
        .update(coopBossSessions)
        .set({
          defeatedAt: now,
          nextSpawnAt: new Date(now.getTime() + def.respawnMs),
        })
        .where(eq(coopBossSessions.id, s.id));
      iClaimedKill = true;
    }

    // 5. contributor UPSERT — 누적 데미지 / 공격 횟수 / lastAttackAt.
    await tx
      .insert(coopBossContributors)
      .values({
        sessionId: s.id,
        userId,
        damage: result.damageDealt,
        attackCount: 1,
        lastAttackAt: now,
      })
      .onConflictDoUpdate({
        target: [coopBossContributors.sessionId, coopBossContributors.userId],
        set: {
          damage: sql`${coopBossContributors.damage} + ${result.damageDealt}`,
          attackCount: sql`${coopBossContributors.attackCount} + 1`,
          lastAttackAt: now,
        },
      });

    // 6. 공격 로그 1줄 — 다른 사람도 보스 카드 밑에서 볼 수 있게.
    await tx.insert(coopBossAttackLog).values({
      sessionId: s.id,
      userId,
      name: body.playerName ?? "모험가",
      damageDealt: result.damageDealt,
      damageTaken: result.damageTaken,
      diedEarly: result.diedEarly,
      log: result.log,
      createdAt: now,
    });
  });

  if (abortReason === "cooldown") {
    return Response.json(
      { error: "cooldown", retryAfter: cooldownRetryMs },
      { status: 429 },
    );
  }
  if (abortReason === "defeated") {
    return new Response("already defeated", { status: 409 });
  }
  if (abortReason === "expired") {
    return new Response("session expired", { status: 410 });
  }

  // 처치 시 storyFlag set — savesKv 의 storyFlags.v2 갱신. CAS 로 처치를 점유한 1명만
  // 이 분기에 진입한다. 킬샷 운에 따라 슬롯 해금이 좌우되지 않도록, 이 세션의 silver+
  // 기여자(누적 데미지 / maxHp ≥ COOP_TIER_THRESHOLDS.silver) 전원에게 fan-out.
  // 킬샷 본인은 누적과 무관하게 무조건 포함 — 마지막 일격 자체가 의미있는 기여.
  // (서버에서 직접 patch — 클라이언트 상태와 다음 fetch 에 반영)
  // 응답에 본인 flag 를 실어 보내 클라가 메모리 상태에도 즉시 반영하게 한다.
  const storyFlagsSet: string[] = [];
  if (iClaimedKill && def.onDefeatFlag) {
    const flagId = def.onDefeatFlag;
    const contribs = await db
      .select({
        userId: coopBossContributors.userId,
        damage: coopBossContributors.damage,
      })
      .from(coopBossContributors)
      .where(eq(coopBossContributors.sessionId, session.id));
    const minRatio = COOP_TIER_THRESHOLDS.silver;
    const recipients = new Set<string>([userId]);
    for (const c of contribs) {
      if (c.damage / session.maxHp >= minRatio) recipients.add(c.userId);
    }
    await Promise.all(
      [...recipients].map((uid) => setStoryFlagServer(uid, flagId)),
    );
    storyFlagsSet.push(flagId);
  }
  // 1회 이상 attack 한 유저에게 set 되는 참여 flag — idempotent (이미 있으면 skip).
  if (def.onAttackFlag) {
    await setStoryFlagServer(userId, def.onAttackFlag);
    storyFlagsSet.push(def.onAttackFlag);
  }

  // 처치 broadcast — 광장 게시판에 1줄 시스템 글. CAS 로 처치를 점유한 1명만.
  if (iClaimedKill) {
    await broadcastBossKill(userId, session.id, session.bossName).catch(
      (err) => {
        // 부수 효과 — 실패해도 attack 응답은 정상 처리.
        console.warn("[coop] broadcast failed", err);
      },
    );
  }

  return Response.json({
    damageDealt: result.damageDealt,
    damageTaken: result.damageTaken,
    finalPlayerHp: result.finalPlayerHp,
    diedEarly: result.diedEarly,
    log: result.log,
    session: { hp: realHp, defeated: realHp === 0 },
    storyFlagsSet,
  });
}
