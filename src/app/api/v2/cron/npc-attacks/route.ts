import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { outpostClaimAttempts, outpostOccupations } from "@/db/schema";
import { derivePlayerCombatFromSaves } from "@/lib/server/derivePlayerCombatFromSaves";
import { ensureSoloGuild } from "@/lib/server/v2EnsureSoloGuild";
import { readGuildResources } from "@/lib/server/v2GuildResources";
import { resolveBattle } from "@/adventure/battle/engine";
import { pickAutoAction } from "@/adventure/battle/pickAutoAction";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import { getChampion } from "@/adventure/data/v2/champions";
import { computeNextAttackAt } from "@/adventure/data/v2/npcAttack";
import { applySoldierBoost } from "@/adventure/data/v2/soldiers";

// POST /api/v2/cron/npc-attacks — cron 이 주기적으로 호출 (e.g. 매 시간).
// CRON_SECRET 헤더 검증. 모든 점령된 거점 중 nextAttackAt < now 인 것들 평가.
//
// 각 거점:
//   1. occupiedByUserId 의 PlayerCombat derive
//   2. tier × type 의 champion vs PlayerCombat 단판 sim
//   3. won (점령자 승리) → nextAttackAt 갱신 (tier interval)
//   4. lost → outpost_occupations row 삭제 (점령 풀림)
//   5. outpost_claim_attempts 로그 (defenderName = 챔피언, attackerUserId = 점령자 본인을 임시 사용 — log 추적용)
//
// 단순화 (후속):
//   - 자원 약탈 X (점령 풀림만)
//   - 알림 (server_feed) X
//   - 길드 점령 (occupiedByGuildId) 처리 X (현재 솔로 점령만)

export async function POST(req: Request) {
  // CRON_SECRET 검증
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // 평가 대상 거점들 (점령됨 + nextAttackAt 지남).
  const dueRows = await db
    .select()
    .from(outpostOccupations)
    .where(
      and(
        isNotNull(outpostOccupations.occupiedByUserId),
        lte(outpostOccupations.nextAttackAt, now),
      ),
    );

  const summary = {
    evaluated: 0,
    defended: 0, // 점령자 승리, nextAttackAt 갱신
    lost: 0, // 점령자 패배, 점령 풀림
    skipped: 0, // 데이터 누락 등
  };

  for (const occ of dueRows) {
    const outpost = OUTPOSTS.find((o) => o.id === occ.outpostId);
    if (!outpost || !occ.occupiedByUserId) {
      summary.skipped += 1;
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        // tx 안에서 다시 lock (다른 cron / claim 과 race 방지).
        const lockedOcc = (
          await tx
            .select()
            .from(outpostOccupations)
            .where(eq(outpostOccupations.outpostId, occ.outpostId))
            .for("update")
            .limit(1)
        )[0];
        if (
          !lockedOcc ||
          !lockedOcc.occupiedByUserId ||
          lockedOcc.nextAttackAt > now
        ) {
          // 잠금 후 상태 변경 (해제됐거나 이미 처리됨) → skip
          summary.skipped += 1;
          return;
        }

        const ownerId = lockedOcc.occupiedByUserId;
        const player = await derivePlayerCombatFromSaves(ownerId, tx);
        if (!player) {
          // 점령자 캐릭 없음 (이상) → skip + nextAttackAt 갱신
          await tx
            .update(outpostOccupations)
            .set({
              nextAttackAt: computeNextAttackAt(outpost.tier, now.getTime()),
            })
            .where(eq(outpostOccupations.outpostId, outpost.id));
          summary.skipped += 1;
          return;
        }

        const champion = getChampion(outpost.type, outpost.tier);
        // 점령자 길드 자원의 soldiers 보정 (수비측 영웅 강화).
        // 점령자 = guildMaster 가정 (1인 길드 + 다인 마스터). PR-vi-b 후속.
        const ownerGuildId = lockedOcc.occupiedByGuildId
          ?? (await ensureSoloGuild(tx, ownerId));
        const soldiers = (await readGuildResources(tx, ownerGuildId)).soldiers;
        // 점령자 영웅 hp = 만피 + 병사 보정.
        const playerForBattle = applySoldierBoost(
          { ...player.player, hp: player.maxHp },
          soldiers,
        );

        const battle = resolveBattle(
          playerForBattle,
          champion,
          "수비자", // log 상의 plain name
          {
            pickAction: (state) =>
              pickAutoAction(state, { rules: [], potions: {} }),
            potions: {},
          },
        );

        // 로그 — NPC 공격이라 attackerUserId=null. 수비자(점령자)는 defenderUserId.
        await tx.insert(outpostClaimAttempts).values({
          outpostId: outpost.id,
          attackerUserId: null,
          attackerGuildId: null,
          defenderName: champion.name, // 공격해온 NPC 챔피언 이름 (감사 추적용)
          defenderUserId: ownerId,
          // NPC 공격에서 won 의미 = 점령자(=수비) 승리 여부.
          won: battle.outcome === "win",
          turns: battle.turns,
        });

        if (battle.outcome === "win") {
          // 점령자 승리 → nextAttackAt 갱신
          await tx
            .update(outpostOccupations)
            .set({
              nextAttackAt: computeNextAttackAt(outpost.tier, now.getTime()),
            })
            .where(eq(outpostOccupations.outpostId, outpost.id));
          summary.defended += 1;
        } else {
          // 점령자 패배 → 점령 풀림
          await tx
            .delete(outpostOccupations)
            .where(eq(outpostOccupations.outpostId, outpost.id));
          summary.lost += 1;
        }
        summary.evaluated += 1;
      });
    } catch (e) {
      console.error("[npc-attacks] outpost error", occ.outpostId, e);
      summary.skipped += 1;
    }
  }

  return Response.json({ ok: true, ...summary });
}
