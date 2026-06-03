import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
  genEquipIid,
  shopPriceOf,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";

// POST /api/v2/shop/equipment — 마을 상점에서 T1~T5 장비 구매.
//
// body: { id: V2EquipmentId }
// 검증: id 유효, shopPrice 존재, 골드 충분. 중복 구매 허용 (owned 카운트 +1).
// 응답: { ok: true, gold, owned: V2EquipmentId[] } | { ok: false, error }

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
  const price = shopPriceOf(item);
  if (price == null) {
    return Response.json({ ok: false, error: "not_for_sale" }, { status: 400 });
  }

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
    const gold = Math.max(0, charSave.gold ?? 0);
    if (gold < price) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_gold" as const,
          required: price,
          have: gold,
        },
      };
    }
    // 상점 구매는 굴림 없음(정가 고정) — roll 없는 개체.
    const nextOwned = [...parsed.owned, { iid: genEquipIid(), id }];
    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped: parsed.equipped,
    });
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: gold - price,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        gold: gold - price,
        owned: nextOwned,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
