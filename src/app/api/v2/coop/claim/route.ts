import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { coopBossContributors, coopBossSessions } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  coopTierForRatio,
  parseCoopBossKindId,
  rollCoopSpFruits,
  type CoopRewardTier,
} from "@/adventure/data/v2/coopBosses";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import { SP_FRUIT, fruitTierForBoss } from "@/adventure/data/v2/spFruit";

// POST /api/v2/coop/claim — 처치된 협동 보스의 기여 보상 수령.
//
// 본문: { sessionId }
// 보상 개편(2026-06-26·오너) = **SP 열매뿐**. 도달한 각 보상 티어(GOLD/EPIC/LEGEND)를 독립
//   굴림 → 통과 수만큼 그 보스 등급 열매 적립(LEGEND 최대 3개). 골드·유니크·칭호 보상 폐지.
//   가이드 퀘스트 bossKills 호환 위해 격파 보스 종류를 adventure-log.v2.coopBossKinds 에 기록.
//
// 멱등성(v1 claim 의 audit #9 승계): contributor row FOR UPDATE → 이미 claim 이면
// 저장된 claimedRewardSnapshot 그대로 반환(보상 재적용 없음·응답 손실 retry 안전).
// 락 순서: character.v2 먼저(전 라우트 공통) → adventure-log → contributor.

type RewardSnapshot = {
  tier: CoopRewardTier;
  // 획득한 SP 열매 개수(0~3)·등급. 멱등 스냅샷 — retry 시 그대로 반환.
  spFruitCount: number;
  spFruitMaterialId: string | null;
  spFruitName: string | null;
};

type CharSave = { materials?: unknown; [k: string]: unknown };

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

  const result = await db.transaction(async (tx) => {
    const now = Date.now();
    // === 1. character.v2 잠금(공통 첫 락 — attack 과의 데드락 회피) ===
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );

    // === 2. 세션 검증 — 처치(hp<=0)된 세션만 보상. 만료(hp>0)는 보상 없음 ===
    const [session] = await tx
      .select()
      .from(coopBossSessions)
      .where(eq(coopBossSessions.id, sessionId))
      .limit(1);
    if (!session) {
      return {
        status: 404,
        body: { ok: false as const, error: "no_session" as const },
      };
    }
    const kindId = parseCoopBossKindId(session.regionId);
    if (!kindId) {
      return {
        status: 400,
        body: { ok: false as const, error: "bad_session" as const },
      };
    }
    if (session.defeatedAt === null || session.hp > 0) {
      return {
        status: 409,
        body: { ok: false as const, error: "not_defeated" as const },
      };
    }

    // === 3. contributor FOR UPDATE — 멱등 가드 ===
    const [contrib] = await tx
      .select()
      .from(coopBossContributors)
      .where(
        and(
          eq(coopBossContributors.sessionId, sessionId),
          eq(coopBossContributors.userId, userId),
        ),
      )
      .for("update");
    if (!contrib || contrib.damage <= 0) {
      return {
        status: 404,
        body: { ok: false as const, error: "no_contribution" as const },
      };
    }
    if (contrib.claimedAt !== null) {
      return {
        status: 200,
        body: {
          ok: true as const,
          alreadyClaimed: true,
          reward: (contrib.claimedRewardSnapshot ?? null) as RewardSnapshot | null,
        },
      };
    }
    const tier = coopTierForRatio(
      contrib.damage / Math.max(1, session.maxHp),
    );
    if (!tier) {
      return {
        status: 409,
        body: { ok: false as const, error: "below_bronze" as const },
      };
    }

    // === 4. 보상 결정 + 적용 (SP 열매뿐 — 전부 본인 세이브) ===
    // 도달한 보상 티어를 독립 굴림 → 통과 수 = 이 보스 등급 열매 개수(BRONZE/SILVER=0, LEGEND≤3).
    const fruitTier = fruitTierForBoss(kindId);
    const fruitDef = fruitTier !== null ? SP_FRUIT[fruitTier] : null;
    const fruitCount = fruitDef ? rollCoopSpFruits(tier, Math.random) : 0;
    const nextMaterials =
      fruitDef && fruitCount > 0
        ? mergeDrops(charSave.materials, { [fruitDef.materialId]: fruitCount })
        : (charSave.materials as Record<string, number> | undefined);

    if (fruitDef && fruitCount > 0) {
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        materials: nextMaterials,
      });
    }

    // 가이드 퀘스트 bossKills 호환 — 격파(기여)한 보스 종류를 멱등 기록(칭호 지급 폐지 대체).
    //   v2QuestContext 가 coopBossKinds 종류 수 + 레거시 칭호 보유분으로 bossKills 산정.
    const logSave = await lockSaveForUpdate<{
      coopBossKinds?: unknown;
      [k: string]: unknown;
    }>(tx, userId, "adventure-log.v2", {});
    const priorKinds = Array.isArray(logSave.coopBossKinds)
      ? (logSave.coopBossKinds.filter((k) => typeof k === "string") as string[])
      : [];
    if (!priorKinds.includes(kindId)) {
      await upsertSave(tx, userId, "adventure-log.v2", {
        ...logSave,
        coopBossKinds: [...priorKinds, kindId],
      });
    }

    // === 5. claim 마킹 + 스냅샷(retry 시 그대로 반환) ===
    const reward: RewardSnapshot = {
      tier,
      spFruitCount: fruitCount,
      spFruitMaterialId: fruitCount > 0 && fruitDef ? fruitDef.materialId : null,
      spFruitName: fruitCount > 0 && fruitDef ? fruitDef.name : null,
    };
    await tx
      .update(coopBossContributors)
      .set({
        claimedAt: new Date(now),
        claimedTier: tier,
        claimedRewardSnapshot: reward,
      })
      .where(
        and(
          eq(coopBossContributors.sessionId, sessionId),
          eq(coopBossContributors.userId, userId),
        ),
      );

    return {
      status: 200,
      body: { ok: true as const, alreadyClaimed: false, reward },
    };
  });

  return Response.json(result.body, { status: result.status });
}
