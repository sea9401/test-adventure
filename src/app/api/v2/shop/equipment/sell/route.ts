import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
  shopPriceOf,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";

// POST /api/v2/shop/equipment/sell — 보유 장비 1개 판매.
//
// body: { id: V2EquipmentId }
// 가격: 상점 구매가의 5% (floor). 비매품(T 외) 은 거부.
// 보유 카운트 -1 (배열 내 첫 등장 1개 제거).
// 장착 중인 장비는 판매 불가 — 장착분은 항상 1개 보유 유지(스페어가 있으면 여분만 판매).

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
    // 장착 중인 장비는 판매 불가 — 장착분은 항상 1개 보유 유지.
    // (같은 id 스페어가 더 있으면 여분은 판매 가능 → ownedCount > 1 일 때만 통과.)
    const ownedCount = parsed.owned.filter((x) => x === id).length;
    if (parsed.equipped[item.slot] === id && ownedCount <= 1) {
      return {
        status: 400,
        body: { ok: false as const, error: "equipped" as const },
      };
    }
    // 첫 등장 1개 제거.
    const nextOwned = [...parsed.owned.slice(0, idx), ...parsed.owned.slice(idx + 1)];
    const remaining = nextOwned.filter((x) => x === id).length;
    // 장착분은 위에서 차단되므로 equipped 맵은 손대지 않는다.
    // 마지막 개체 처분 → 개체 굴림 폐기(재획득 시 재굴림).
    const nextStatRolls = { ...parsed.statRolls };
    if (remaining === 0) delete nextStatRolls[id];
    const gold = Math.max(0, charSave.gold ?? 0);
    const newGold = gold + sellPrice;
    await upsertSave(tx, userId, "equipment.v2", {
      ...equipSave,
      owned: nextOwned,
      equipped: parsed.equipped,
      statRolls: nextStatRolls,
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
        equipped: parsed.equipped,
        sellPrice,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
