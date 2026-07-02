import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { outpostOccupations } from "@/db/schema";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { resolveBattle } from "@/adventure/v2/combat/engine";
import { pickAutoAction } from "@/adventure/v2/combat/pickAutoAction";
import { resolveOutpostMeta } from "@/adventure/data/v2/tileWarfare";
import { getChampion } from "@/adventure/data/v2/champions";
import { computeNextAttackAt } from "@/adventure/data/v2/npcAttack";
import {
  insertFeedEntry,
  resolveUserDisplayName,
} from "@/lib/server/serverFeed";
import {
  toReplayPayload,
  type StoredReplayEnvelope,
} from "@/adventure/data/v2/replayPayload";
import { recordOutpostAttack } from "@/lib/server/outpostWar";
import { trimAttackReplays } from "@/lib/server/outpostAttackLog";
import { insertNotification } from "@/lib/server/v2Notifications";
import { requireCronAuth } from "@/lib/server/cronAuth";
// PR-7b: 병사 시스템 폐기 — applySoldierBoost / readGuildResources soldiers 보정 제거.
// 점령자 영웅 단신으로 NPC 챔피언과 단판.

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
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

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
    const outpost = resolveOutpostMeta(occ.outpostId);
    if (!outpost || !occ.occupiedByUserId) {
      summary.skipped += 1;
      continue;
    }

    try {
      let lostOwnerId: string | null = null; // 점령 풀림 — tx 커밋 후 피드 발화용.
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
        const player = await derivePlayerCombatV2(ownerId, tx);
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
        // PR-7b: 병사 보정 제거 — 점령자 영웅 단신, hp = 만피.
        const playerForBattle = { ...player.player, hp: player.maxHp };

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
        // 리플레이 봉투 — 이 전투의 "player" 사이드 = 점령자(수비) 시점.
        // 닉네임 해석은 표시용 스냅샷 (실패해도 전투 처리엔 영향 없게 폴백).
        const ownerLabel = await resolveUserDisplayName(ownerId).catch(
          () => "점령자",
        );
        await recordOutpostAttack(tx, {
          outpostId: outpost.id,
          attackerUserId: null,
          attackerGuildId: null,
          defenderName: champion.name, // 공격해온 NPC 챔피언 이름 (감사 추적용)
          defenderUserId: ownerId,
          // NPC 공격에서 won 의미 = 점령자(=수비) 승리 여부.
          won: battle.outcome === "win",
          turns: battle.turns,
          replay: {
            payload: toReplayPayload(battle.finalState, 200),
            playerName: ownerLabel,
          } satisfies StoredReplayEnvelope,
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
          lostOwnerId = ownerId;
        }
        summary.evaluated += 1;
      });
      // 리플레이 보존 trim — tx 커밋 후 부수효과(실패 삼킴).
      await trimAttackReplays(outpost.id);
      // 전쟁 피드 — 점령 풀림은 공적 사건(force). tx 커밋 후 부수효과, actor = 잃은 점령자.
      if (lostOwnerId) {
        await insertFeedEntry(
          lostOwnerId,
          "outpost_capture",
          { outpostId: outpost.id, lostToNpc: true }
        );
        // 개인 알림 — 잃은 점령자에게 즉시(디바운스 없음).
        await insertNotification(lostOwnerId, "outpost_lost", {
          outpostId: outpost.id,
          byNpc: true,
        });
      }
    } catch (e) {
      console.error("[npc-attacks] outpost error", occ.outpostId, e);
      summary.skipped += 1;
    }
  }

  return Response.json({ ok: true, ...summary });
}
