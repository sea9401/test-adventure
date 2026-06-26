import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { coopBossContributors, coopBossSessions } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  COOP_BOSSES,
  COOP_TIER_ORDER,
  coopTierForRatio,
  parseCoopBossKindId,
  sumCoopGold,
  type CoopRewardTier,
} from "@/adventure/data/v2/coopBosses";
import {
  V2_EQUIPMENT,
  genEquipIid,
  parseEquipmentSave,
  type EquipmentSave,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { rollItemStats } from "@/adventure/data/v2/v2EquipVariance";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import { SP_FRUIT, fruitTierForBoss } from "@/adventure/data/v2/spFruit";

// SP 열매 드랍 게이트(PR-1 placeholder) — gold 티어 이상 기여 시 1개. 정밀 게이팅은 추후 결정.
const SP_FRUIT_MIN_TIER: CoopRewardTier = "gold";

// POST /api/v2/coop/claim — 처치된 협동 보스의 기여 보상 수령.
//
// 본문: { sessionId }
// 보상 = 도달 티어까지 골드 합산 + 보스 전용 유니크(티어 확률 1회 굴림) + 첫 처치 칭호
// (멱등 — 가이드 퀘스트 bossKills 판정 호환). 전부 본인 세이브만 변형(교차 유저 락 0).
//
// 멱등성(v1 claim 의 audit #9 승계): contributor row FOR UPDATE → 이미 claim 이면
// 저장된 claimedRewardSnapshot 그대로 반환(보상 재적용 없음·응답 손실 retry 안전).
// 락 순서: character.v2 먼저(전 라우트 공통) → equipment → adventure-log → contributor.

type RewardSnapshot = {
  tier: CoopRewardTier;
  gold: number;
  uniqueId: V2EquipmentId | null;
  titleId: string;
  titleNew: boolean;
  // SP 열매 드랍(없으면 null) — 멱등 스냅샷에 포함해 retry 시 그대로 반환.
  spFruit?: { materialId: string; name: string } | null;
};

type CharSave = { gold?: number; materials?: unknown; [k: string]: unknown };

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
    const kind = COOP_BOSSES[kindId];

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

    // === 4. 보상 결정 + 적용 (전부 본인 세이브) ===
    const gold = sumCoopGold(kind, tier);
    const uniqueId: V2EquipmentId | null =
      Math.random() < kind.rewards[tier].uniqueChance &&
      kind.uniqueIds.length > 0
        ? kind.uniqueIds[Math.floor(Math.random() * kind.uniqueIds.length)]
        : null;

    // SP 열매 — gold 티어 이상이면 이 보스 등급의 열매 1개 인벤(materials) 적립(거래·사용 가능).
    const fruitTier = fruitTierForBoss(kindId);
    const awardFruit =
      fruitTier !== null &&
      COOP_TIER_ORDER.indexOf(tier) >=
        COOP_TIER_ORDER.indexOf(SP_FRUIT_MIN_TIER);
    const fruitDef = awardFruit && fruitTier !== null ? SP_FRUIT[fruitTier] : null;
    const nextMaterials = fruitDef
      ? mergeDrops(charSave.materials, { [fruitDef.materialId]: 1 })
      : (charSave.materials as Record<string, number> | undefined);

    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: Math.max(0, (charSave.gold ?? 0) + gold),
      ...(fruitDef ? { materials: nextMaterials } : {}),
    });

    if (uniqueId) {
      const equipmentSave = await lockSaveForUpdate<EquipmentSave>(
        tx,
        userId,
        "equipment.v2",
        {},
      );
      const { owned, equipped } = parseEquipmentSave(equipmentSave);
      await upsertSave(tx, userId, "equipment.v2", {
        owned: [
          ...owned,
          {
            iid: genEquipIid(),
            id: uniqueId,
            roll: rollItemStats(V2_EQUIPMENT[uniqueId], Math.random),
          },
        ],
        equipped,
      });
    }

    // 첫 처치 칭호 — adventure-log.v2 titles 멱등 추가(이미 있으면 titleNew=false).
    const logSave = await lockSaveForUpdate<{
      titles?: Record<string, { obtainedAt: number }>;
      [k: string]: unknown;
    }>(tx, userId, "adventure-log.v2", {});
    const titleNew = !(logSave.titles ?? {})[kind.titleId];
    if (titleNew) {
      await upsertSave(tx, userId, "adventure-log.v2", {
        ...logSave,
        titles: {
          ...(logSave.titles ?? {}),
          [kind.titleId]: { obtainedAt: now },
        },
      });
    }

    // === 5. claim 마킹 + 스냅샷(retry 시 그대로 반환) ===
    const reward: RewardSnapshot = {
      tier,
      gold,
      uniqueId,
      titleId: kind.titleId,
      titleNew,
      spFruit: fruitDef
        ? { materialId: fruitDef.materialId, name: fruitDef.name }
        : null,
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
