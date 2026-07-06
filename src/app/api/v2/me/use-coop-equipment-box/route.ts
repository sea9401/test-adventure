import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  COOP_EQUIPMENT_BOX,
  parseCoopEquipmentBoxId,
  rollCoopEquipmentBoxItem,
} from "@/adventure/data/v2/coopRewards";
import {
  V2_EQUIPMENT,
  genEquipIid,
  parseEquipmentSave,
  type EquipmentSave,
} from "@/adventure/data/v2/v2Equipment";
import { rollItemStats } from "@/adventure/data/v2/v2EquipVariance";

type CharSave = { materials?: unknown; [k: string]: unknown };

function parseMaterials(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const n = Math.floor(Number(v));
      if (Number.isFinite(n) && n > 0) out[k] = n;
    }
  }
  return out;
}

// POST /api/v2/me/use-coop-equipment-box — 협동 보스 장비 상자 1개 사용 → 정규 장비 1개 획득.
// body { boxId } — character.v2.materials 의 상자 수량 검증/소모 후 equipment.v2 에 인스턴스 추가.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let boxId: unknown;
  try {
    boxId = ((await req.json()) as { boxId?: unknown })?.boxId;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const boss = parseCoopEquipmentBoxId(boxId);
  if (!boss) {
    return Response.json({ ok: false, error: "bad_box" }, { status: 400 });
  }
  const box = COOP_EQUIPMENT_BOX[boss];

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materials = parseMaterials(charSave.materials);
    const held = materials[box.id] ?? 0;
    if (held <= 0) {
      return { status: 400, body: { ok: false as const, error: "no_box" } };
    }

    const equipmentId = rollCoopEquipmentBoxItem(boss, Math.random);
    if (!equipmentId) {
      return {
        status: 500,
        body: { ok: false as const, error: "empty_box_pool" },
      };
    }

    const nextMaterials = { ...materials };
    if (held - 1 <= 0) delete nextMaterials[box.id];
    else nextMaterials[box.id] = held - 1;

    const equipmentSave = await lockSaveForUpdate<EquipmentSave>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const { owned, equipped } = parseEquipmentSave(equipmentSave);
    const item = V2_EQUIPMENT[equipmentId];
    const inst = {
      iid: genEquipIid(),
      id: equipmentId,
      roll: rollItemStats(item, Math.random),
    };

    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      materials: nextMaterials,
    });
    await upsertSave(tx, userId, "equipment.v2", {
      owned: [...owned, inst],
      equipped,
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        boxId: box.id,
        boxName: box.name,
        remaining: nextMaterials[box.id] ?? 0,
        equipment: {
          iid: inst.iid,
          id: equipmentId,
          name: item.name,
          tier: item.tier,
          slot: item.slot,
        },
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
