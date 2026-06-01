import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
  type EquipmentSave,
  type V2EquipmentId,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";

// POST /api/v2/me/equipment/equip — 한 슬롯의 장착 변경.
//
// 본문: { slot: 6슬롯 중 하나, equipmentId: V2EquipmentId | null }
// equipmentId = null → 해제. 비-null → 보유 검증 + slot 일치 검증.

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

  let body: { slot?: unknown; equipmentId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.slot !== "string" || !VALID_SLOTS.has(body.slot as V2EquipSlot)) {
    return Response.json({ ok: false, error: "bad_slot" }, { status: 400 });
  }
  const slot = body.slot as V2EquipSlot;

  if (body.equipmentId !== null) {
    if (
      typeof body.equipmentId !== "string" ||
      !(body.equipmentId in V2_EQUIPMENT)
    ) {
      return Response.json(
        { ok: false, error: "bad_equipment_id" },
        { status: 400 },
      );
    }
    const item = V2_EQUIPMENT[body.equipmentId as V2EquipmentId];
    if (item.slot !== slot) {
      return Response.json(
        { ok: false, error: "slot_mismatch", expected: item.slot },
        { status: 400 },
      );
    }
  }
  const equipmentId = (body.equipmentId ?? null) as V2EquipmentId | null;

  const result = await db.transaction(async (tx) => {
    const save = await lockSaveForUpdate<EquipmentSave>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const { owned, equipped } = parseEquipmentSave(save);
    if (equipmentId !== null && !owned.includes(equipmentId)) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_owned" as const },
      };
    }
    const nextEquipped = { ...equipped };
    if (equipmentId === null) {
      delete nextEquipped[slot];
    } else {
      nextEquipped[slot] = equipmentId;
    }
    await upsertSave(tx, userId, "equipment.v2", {
      ...save,
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
