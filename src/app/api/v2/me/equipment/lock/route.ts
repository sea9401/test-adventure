import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  MAX_BULK_LOCK_COUNT,
  parseEquipmentSave,
  setInstancesLock,
  type EquipmentSave,
} from "@/adventure/data/v2/v2Equipment";

// POST /api/v2/me/equipment/lock — 보유 개체 즐겨찾기 잠금 토글 (개체 모델, iid 기준).
//
// 본문: { iid: string, locked: boolean } 또는 { iids: string[], locked: boolean }
// locked=true → 일괄/실수 판매에서 보호. equipped 는 불변. 굴림·장착엔 영향 없음.
// iids(선택 잠금·유니크 전부 잠금, 건의 #859)는 그사이 사라진 개체를 건너뛰고 남은 개체만
// 바꾼다. 잠금은 되돌릴 수 있어 판매처럼 전체를 거절하지 않는다. 응답의 changedCount 는
// 잠금 상태가 실제로 바뀐 개체 수다.

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { iid?: unknown; iids?: unknown; locked?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  let iids: string[];
  if (body.iids !== undefined) {
    if (
      !Array.isArray(body.iids) ||
      body.iids.length === 0 ||
      !body.iids.every((iid) => typeof iid === "string" && iid.length > 0)
    ) {
      return Response.json({ ok: false, error: "invalid_iids" }, { status: 400 });
    }
    if (body.iids.length > MAX_BULK_LOCK_COUNT) {
      return Response.json({ ok: false, error: "too_many_iids" }, { status: 400 });
    }
    iids = body.iids as string[];
  } else {
    if (typeof body.iid !== "string" || body.iid.length === 0) {
      return Response.json({ ok: false, error: "invalid_iid" }, { status: 400 });
    }
    iids = [body.iid];
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
    const next = setInstancesLock(owned, iids, locked);
    if (next.matchedCount === 0) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_owned" as const },
      };
    }
    await upsertSave(tx, userId, "equipment.v2", {
      owned: next.owned,
      equipped,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        owned: next.owned,
        equipped,
        changedCount: next.changedCount,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
