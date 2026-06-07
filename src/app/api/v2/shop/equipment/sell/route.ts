import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
  removeInstance,
  sellPriceOf,
} from "@/adventure/data/v2/v2Equipment";

// POST /api/v2/shop/equipment/sell — 보유 장비 개체 1개 판매 (개체 모델, iid 기준).
//
// body: { iid: string }
// 가격: 상점 구매가의 5% (floor, sellPriceOf). 비매품(유니크 등) 은 거부.
// 장착 중인 개체는 판매 불가(#426) — 해제 후 판매. 같은 id 스페어(다른 iid)는 판매 가능.

type CharSave = { gold?: number; [k: string]: unknown };

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { iid?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const iid =
    typeof body.iid === "string" && body.iid.length > 0 ? body.iid : null;
  if (!iid) {
    return Response.json({ ok: false, error: "invalid_iid" }, { status: 400 });
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
    const inst = parsed.owned.find((i) => i.iid === iid);
    if (!inst) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_owned" as const },
      };
    }
    const item = V2_EQUIPMENT[inst.id];
    // 장착 중인 개체는 판매 불가(#426) — equipped 가 그 iid 를 가리키면 거부(해제 후 판매).
    if (parsed.equipped[item.slot] === iid) {
      return {
        status: 400,
        body: { ok: false as const, error: "equipped" as const },
      };
    }
    const sellPrice = sellPriceOf(item);
    if (sellPrice == null) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_for_sale" as const },
      };
    }
    const { owned: nextOwned } = removeInstance(parsed.owned, iid);
    // 장착 중이 아니므로 equipped 는 불변.
    const gold = Math.max(0, charSave.gold ?? 0);
    const newGold = gold + sellPrice;
    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped: parsed.equipped,
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
