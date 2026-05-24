import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fiefdomRaids, fiefdoms, guildMembers, guilds } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  SHIELD_MS,
  simulateFiefdomBattle,
} from "@/lib/server/fiefdomBattle";
import { applyTick } from "@/adventure/fiefdom/tick";
import type { FiefdomState } from "@/adventure/fiefdom/types";

// POST /api/fiefdom/attack — 서버 권위 전투.
// 본문: { defenderGuildId: number }.
// 검증: 인증, 길드 가입, 자기 자신 X, defender 존재 & 미해체 & shield 비활성.
// 트랜잭션: 두 영지 FOR UPDATE → sim → 양쪽 state 갱신 + raid 로그 + shield 활성화.
// 응답: { won, loot, myStateAfter, defenderShieldUntil } — 클라가 화면 갱신용.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  let body: { defenderGuildId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const defenderGuildId = body.defenderGuildId;
  if (typeof defenderGuildId !== "number" || !Number.isInteger(defenderGuildId)) {
    return Response.json({ error: "defender_guild_id_invalid" }, { status: 400 });
  }

  const membership = await db
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  if (!membership[0]) {
    return Response.json({ error: "no_guild" }, { status: 403 });
  }
  const attackerGuildId = membership[0].guildId;
  if (attackerGuildId === defenderGuildId) {
    return Response.json({ error: "self_attack_forbidden" }, { status: 400 });
  }

  const defenderGuild = await db
    .select({ id: guilds.id, disbandedAt: guilds.disbandedAt })
    .from(guilds)
    .where(eq(guilds.id, defenderGuildId))
    .limit(1);
  if (!defenderGuild[0] || defenderGuild[0].disbandedAt) {
    return Response.json({ error: "defender_unavailable" }, { status: 404 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      // 두 영지 FOR UPDATE — 동시 공격 race 방지.
      const attacker = await tx
        .select()
        .from(fiefdoms)
        .where(eq(fiefdoms.guildId, attackerGuildId))
        .limit(1)
        .for("update");
      const defender = await tx
        .select()
        .from(fiefdoms)
        .where(eq(fiefdoms.guildId, defenderGuildId))
        .limit(1)
        .for("update");
      if (!attacker[0]) return { kind: "error" as const, status: 404, reason: "attacker_fiefdom_missing" };
      if (!defender[0]) return { kind: "error" as const, status: 404, reason: "defender_fiefdom_missing" };

      const now = new Date();
      if (defender[0].shieldUntil && defender[0].shieldUntil > now) {
        return {
          kind: "error" as const,
          status: 410,
          reason: "defender_shielded",
          shieldUntil: defender[0].shieldUntil.toISOString(),
        };
      }

      // 양측 모두 tick 먼저 — 마지막 활동 이후 누적 생산/훈련/regen 반영된 상태로 전투 시뮬.
      const nowMs = now.getTime();
      const { state: attackerTicked } = applyTick(attacker[0].state as FiefdomState, nowMs);
      const { state: defenderTicked } = applyTick(defender[0].state as FiefdomState, nowMs);
      const outcome = simulateFiefdomBattle(attackerTicked, defenderTicked, nowMs);

      const shieldUntil = new Date(now.getTime() + SHIELD_MS);
      await tx
        .update(fiefdoms)
        .set({ state: outcome.attackerStateAfter, updatedAt: now })
        .where(eq(fiefdoms.guildId, attackerGuildId));
      await tx
        .update(fiefdoms)
        .set({
          state: outcome.defenderStateAfter,
          shieldUntil,
          updatedAt: now,
        })
        .where(eq(fiefdoms.guildId, defenderGuildId));

      await tx.insert(fiefdomRaids).values({
        attackerGuildId,
        defenderGuildId,
        initiatorUserId: userId,
        won: outcome.won,
        lootGold: outcome.loot.gold,
        lootWood: outcome.loot.wood,
        lootFood: outcome.loot.food,
      });

      return {
        kind: "ok" as const,
        won: outcome.won,
        loot: outcome.loot,
        myStateAfter: outcome.attackerStateAfter,
        defenderShieldUntil: shieldUntil.toISOString(),
      };
    });

    if (result.kind === "error") {
      const payload: Record<string, unknown> = { error: result.reason };
      if ("shieldUntil" in result) payload.shieldUntil = result.shieldUntil;
      return Response.json(payload, { status: result.status });
    }
    return Response.json(result);
  } catch (e) {
    console.error("[fiefdom/attack] transaction failed", e);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

