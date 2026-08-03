import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  STAMINA_SHARD_COMBINE_COST,
  STAMINA_SHARD_MATERIAL_ID,
} from "@/adventure/data/v2/staminaPotionCrafting";
import {
  STAMINA_POTIONS_KEY,
  staminaPotionCount,
} from "@/adventure/v2/staminaPotions";
import { V2_CORE_LOOP_V2, spendGold } from "@/adventure/data/v2/coreLoopConfig";
import { COMBINE_GOLD_COST } from "@/adventure/data/v2/v2EquipVariance";

type CharSave = {
  materials?: Record<string, number>;
  gold?: number;
  bankedGold?: number;
  [k: string]: unknown;
};

// POST /api/v2/me/stamina-potion-combine — 활력의 파편 6개 → 스태미나 회복약 1개.
// 락 순서: character.v2 → stamina-potions.v1(use-stamina-potion과 동일). 조합비는 은행 우선 차감한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:me:stamina-potion-combine",
    userLimit: 60,
    ipLimit: 360,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materials = { ...(charSave.materials ?? {}) };
    const heldShards = Math.max(
      0,
      Math.floor(Number(materials[STAMINA_SHARD_MATERIAL_ID]) || 0),
    );
    if (heldShards < STAMINA_SHARD_COMBINE_COST) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_material" as const,
          need: STAMINA_SHARD_COMBINE_COST,
        },
      };
    }

    const gold = Math.max(0, Math.floor(Number(charSave.gold) || 0));
    const bankedGold = Math.max(
      0,
      Math.floor(Number(charSave.bankedGold) || 0),
    );
    const spend = spendGold(gold, bankedGold, COMBINE_GOLD_COST);
    if (!spend.ok) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_gold" as const,
          goldCost: COMBINE_GOLD_COST,
        },
      };
    }

    const potionCount = staminaPotionCount(
      await lockSaveForUpdate(tx, userId, STAMINA_POTIONS_KEY, { count: 0 }),
    );
    const shardsLeft = heldShards - STAMINA_SHARD_COMBINE_COST;
    if (shardsLeft > 0) materials[STAMINA_SHARD_MATERIAL_ID] = shardsLeft;
    else delete materials[STAMINA_SHARD_MATERIAL_ID];

    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: spend.gold,
      bankedGold: spend.bankedGold,
      materials,
    });
    await upsertSave(tx, userId, STAMINA_POTIONS_KEY, {
      count: potionCount + 1,
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        shardsLeft,
        staminaPotions: potionCount + 1,
        goldCost: COMBINE_GOLD_COST,
        gold: spend.gold,
        ...(V2_CORE_LOOP_V2 ? { bankedGold: spend.bankedGold } : {}),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
