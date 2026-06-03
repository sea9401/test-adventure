import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
  type EquipmentSave,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";

// POST /api/v2/me/equipment/equip — 한 슬롯의 장착 변경 (개체 모델, iid 기준).
//
// 본문: { slot: 6슬롯 중 하나, iid: string | null }
// iid = null → 해제. 비-null → 그 개체 보유 검증 + 개체의 카탈로그 슬롯 일치 검증.

const VALID_SLOTS = new Set<V2EquipSlot>([
  "weapon",
  "armor",
  "gloves",
  "boots",
  "ring",
  "necklace",
]);

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { slot?: unknown; iid?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (
    typeof body.slot !== "string" ||
    !VALID_SLOTS.has(body.slot as V2EquipSlot)
  ) {
    return Response.json({ ok: false, error: "bad_slot" }, { status: 400 });
  }
  const slot = body.slot as V2EquipSlot;
  // iid = null(해제) | string(장착). 그 외는 거부.
  const iid =
    body.iid === null
      ? null
      : typeof body.iid === "string" && body.iid.length > 0
        ? body.iid
        : undefined;
  if (iid === undefined) {
    return Response.json({ ok: false, error: "bad_iid" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const save = await lockSaveForUpdate<EquipmentSave>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const { owned, equipped } = parseEquipmentSave(save);
    const nextEquipped = { ...equipped };
    if (iid === null) {
      delete nextEquipped[slot];
    } else {
      const inst = owned.find((i) => i.iid === iid);
      if (!inst) {
        return {
          status: 400,
          body: { ok: false as const, error: "not_owned" as const },
        };
      }
      const item = V2_EQUIPMENT[inst.id];
      if (item.slot !== slot) {
        return {
          status: 400,
          body: {
            ok: false as const,
            error: "slot_mismatch" as const,
            expected: item.slot,
          },
        };
      }
      nextEquipped[slot] = iid;
    }
    await upsertSave(tx, userId, "equipment.v2", {
      owned,
      equipped: nextEquipped,
    });
    return {
      status: 200,
      body: { ok: true as const, equipped: nextEquipped },
    };
  });

  return Response.json(result.body, { status: result.status });
}
