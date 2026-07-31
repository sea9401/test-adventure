import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
  type EquipmentSave,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  equipmentProgressionLock,
  normalizeEquipmentFrontierDepth,
} from "@/adventure/data/v2/equipmentProgression";

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
    // 공용 잠금 순서 character→equipment 유지. 진행도는 전투 승리로만 증가하므로 장착 판정과
    // equipment 저장을 같은 트랜잭션에서 묶으면 우회·경합 없이 서버가 최종 권위를 가진다.
    const charSave = await lockSaveForUpdate<
      Record<string, unknown> & { frontierDepth?: unknown }
    >(
      tx,
      userId,
      "character.v2",
      {},
    );
    const save = await lockSaveForUpdate<EquipmentSave>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const { owned, equipped } = parseEquipmentSave(save);
    const nextEquipped = { ...equipped };
    let manuallyEquipped = false;
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
      const progressionLock = equipmentProgressionLock(
        item,
        charSave.frontierDepth,
      );
      if (progressionLock) {
        return {
          status: 400,
          body: {
            ok: false as const,
            error: "progression_locked" as const,
            currentFrontierDepth: normalizeEquipmentFrontierDepth(
              charSave.frontierDepth,
            ),
            requiredFrontierDepth: progressionLock.minFrontierDepth,
            requirementLabel: progressionLock.label,
          },
        };
      }
      manuallyEquipped = nextEquipped[slot] !== iid;
      nextEquipped[slot] = iid;
    }
    if (manuallyEquipped && charSave.hasManuallyEquippedGear !== true) {
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        hasManuallyEquippedGear: true,
      });
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
