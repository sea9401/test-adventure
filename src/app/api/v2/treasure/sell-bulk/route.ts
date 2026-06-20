import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  ANTIQUE_TIER_ORDER,
  type AntiqueTier,
} from "@/adventure/data/v2/antique";
import {
  TREASURE_COLLECTION_KEY,
  bulkSellGold,
  isBulkSellableTier,
  parseTreasureCollection,
  selectInstancesUpToTier,
} from "@/adventure/v2/treasureCollection";

// POST /api/v2/treasure/sell-bulk — body { maxTier }. maxTier 이하 등급 유물을 감정사에게 일괄 판매(골드).
//   🔒 고가품 실수 판매 방지: 서버가 등급 캡(흔함·보통)을 강제 — 희귀 이상 maxTier 는 거부.
//   락 순서: treasure-collection → character.v2 (단건 /sell 과 동일 — 데드락 없음).

type CharSave = { gold?: number; [k: string]: unknown };

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { maxTier?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const maxTier = body.maxTier;
  if (
    typeof maxTier !== "string" ||
    !ANTIQUE_TIER_ORDER.includes(maxTier as AntiqueTier)
  ) {
    return Response.json({ ok: false, error: "bad_tier" }, { status: 400 });
  }
  if (!isBulkSellableTier(maxTier as AntiqueTier)) {
    // 희귀 이상은 일괄 판매 불가(개별 판매만) — 고가품 보호.
    return Response.json(
      { ok: false, error: "tier_not_bulk_sellable" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const collection = parseTreasureCollection(
      await lockSaveForUpdate(tx, userId, TREASURE_COLLECTION_KEY, {}),
    );
    const toSell = selectInstancesUpToTier(
      collection.instances,
      maxTier as AntiqueTier,
    );
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const baseGold = Math.max(0, Math.floor(charSave.gold ?? 0));
    if (toSell.length === 0) {
      return {
        soldCount: 0,
        goldGained: 0,
        gold: baseGold,
        instances: collection.instances,
      };
    }
    const goldGained = bulkSellGold(toSell);
    const sellSet = new Set(toSell.map((i) => i.instanceId));
    const remaining = collection.instances.filter(
      (i) => !sellSet.has(i.instanceId),
    );
    await upsertSave(tx, userId, TREASURE_COLLECTION_KEY, {
      instances: remaining,
    });
    const gold = baseGold + goldGained;
    await upsertSave(tx, userId, "character.v2", { ...charSave, gold });
    return {
      soldCount: toSell.length,
      goldGained,
      gold,
      instances: remaining,
    };
  });

  return Response.json({ ok: true, ...result });
}
