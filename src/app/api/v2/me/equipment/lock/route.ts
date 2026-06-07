import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  parseEquipmentSave,
  setInstanceLock,
  type EquipmentSave,
} from "@/adventure/data/v2/v2Equipment";

// POST /api/v2/me/equipment/lock — 보유 개체 즐겨찾기 잠금 토글 (개체 모델, iid 기준).
//
// 본문: { iid: string, locked: boolean }
// locked=true → 일괄/실수 판매에서 보호. equipped 는 불변. 굴림·장착엔 영향 없음.

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { iid?: unknown; locked?: unknown };
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
  if (typeof body.locked !== "boolean") {
    return Response.json(
      { ok: false, error: "invalid_locked" },
      { status: 400 },
    );
  }
  const locked = body.locked;

  const result = await db.transaction(async (tx) => {
    const save = await lockSaveForUpdate<EquipmentSave>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const { owned, equipped } = parseEquipmentSave(save);
    if (!owned.some((i) => i.iid === iid)) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_owned" as const },
      };
    }
    const nextOwned = setInstanceLock(owned, iid, locked);
    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped,
    });
    return {
      status: 200,
      body: { ok: true as const, owned: nextOwned, equipped },
    };
  });

  return Response.json(result.body, { status: result.status });
}
