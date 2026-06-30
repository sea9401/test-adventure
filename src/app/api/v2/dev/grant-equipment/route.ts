import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
  genEquipIid,
  type EquipmentSave,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { rollItemStats } from "@/adventure/data/v2/v2EquipVariance";

// POST /api/v2/dev/grant-equipment — 테스트용 보유 추가.
//
// 본문: { equipmentId: V2EquipmentId }
// 매 호출마다 굴림이 붙은 새 개체를 지급한다. 정식 드랍 시스템 전 dev 단계에서 장착 UI 검증용.
// 라이브 prod 에선 IS_STAGING 게이트 — staging 외에서 호출 시 404.

export async function POST(req: Request) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.IS_STAGING !== "true"
  ) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { equipmentId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (
    typeof body.equipmentId !== "string" ||
    !(body.equipmentId in V2_EQUIPMENT)
  ) {
    return Response.json(
      { ok: false, error: "bad_equipment_id" },
      { status: 400 },
    );
  }
  const equipmentId = body.equipmentId as V2EquipmentId;

  const result = await db.transaction(async (tx) => {
    const save = await lockSaveForUpdate<EquipmentSave>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const { owned, equipped } = parseEquipmentSave(save);
    const nextOwned = [
      ...owned,
      {
        iid: genEquipIid(),
        id: equipmentId,
        roll: rollItemStats(V2_EQUIPMENT[equipmentId], Math.random),
      },
    ];
    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped,
    });
    return { status: 200, body: { ok: true as const, owned: nextOwned } };
  });

  return Response.json(result.body, { status: result.status });
}
