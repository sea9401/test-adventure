import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
  shopPriceOf,
  type V2EquipmentId,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";

// POST /api/v2/shop/equipment/sell — 보유 장비 1개 판매.
//
// body: { id: V2EquipmentId }
// 가격: 상점 구매가의 5% (floor). 비매품(T 외) 은 거부.
// 보유 카운트 -1 (배열 내 첫 등장 1개 제거). 카운트 0 되면 그 슬롯 장착 해제.

export const SELL_PRICE_RATIO = 0.05;

type CharSave = { gold?: number; [k: string]: unknown };

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { id?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? (body.id as V2EquipmentId) : null;
  if (!id || !(id in V2_EQUIPMENT)) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  const item = V2_EQUIPMENT[id];
  const buyPrice = shopPriceOf(item);
  if (buyPrice == null) {
    return Response.json({ ok: false, error: "not_for_sale" }, { status: 400 });
  }
  const sellPrice = Math.max(1, Math.floor(buyPrice * SELL_PRICE_RATIO));

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const equipSave = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const parsed = parseEquipmentSave(equipSave);
    const idx = parsed.owned.indexOf(id);
    if (idx < 0) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_owned" as const },
      };
    }
    // 첫 등장 1개 제거.
    const nextOwned = [...parsed.owned.slice(0, idx), ...parsed.owned.slice(idx + 1)];
    const remaining = nextOwned.filter((x) => x === id).length;
    // 카운트 0 되면 그 슬롯 장착 해제 (다른 슬롯에 같은 id 가 들어갈 일은 없음 — slot fix).
    const nextEquipped: Partial<Record<V2EquipSlot, V2EquipmentId>> = {
      ...parsed.equipped,
    };
    if (remaining === 0 && nextEquipped[item.slot] === id) {
      delete nextEquipped[item.slot];
    }
    const gold = Math.max(0, charSave.gold ?? 0);
    const newGold = gold + sellPrice;
    await upsertSave(tx, userId, "equipment.v2", {
      ...equipSave,
      owned: nextOwned,
      equipped: nextEquipped,
    });
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: newGold,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        gold: newGold,
        owned: nextOwned,
        equipped: nextEquipped,
        sellPrice,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
