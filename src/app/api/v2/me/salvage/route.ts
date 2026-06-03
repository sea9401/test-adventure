import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  parseEquipmentSave,
  removeInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { V2_RECIPES, salvageYield } from "@/adventure/data/v2/v2Recipes";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";

// POST /api/v2/me/salvage — 보유 장비 개체 1개를 분해해 재료로 환수 (개체 모델, iid 기준).
//
// body: { iid: string }
// 환수 = salvageYield(레시피) (재료의 ~50%, 골드 없음). 레시피 없는 장비(유니크)는 분해 불가.
// 그 개체를 owned 에서 제거, 장착 중이던 개체면 슬롯 해제 (판매 라우트와 동일 처리).
// 판매(골드)와 다른 통화(재료)라 공존 — 재료 회수용 밸브.
//
// read-modify-write 는 character.v2 + equipment.v2 두 키를 FOR UPDATE 로 잠근 한 트랜잭션
// 안에서 (구매/제작/사냥/판매와의 race 예방). 락 순서 character→equipment (스택 일관).

type CharSave = {
  gold?: number;
  materials?: Record<string, unknown>;
  [k: string]: unknown;
};

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
    // 레시피 없는 장비(유니크)는 분해 불가 — 환수할 재료 정의가 없고, 드랍 전용 트로피 보호.
    const recipe = V2_RECIPES[inst.id];
    if (!recipe) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_salvageable" as const },
      };
    }
    const gained = salvageYield(recipe);
    const { owned: nextOwned } = removeInstance(parsed.owned, iid);
    // 장착 중이던 개체면 해당 슬롯 해제.
    const nextEquipped: Partial<Record<V2EquipSlot, string>> = {
      ...parsed.equipped,
    };
    for (const [slot, eqIid] of Object.entries(nextEquipped) as [
      V2EquipSlot,
      string,
    ][]) {
      if (eqIid === iid) delete nextEquipped[slot];
    }
    const nextMaterials = mergeDrops(charSave.materials, gained);
    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped: nextEquipped,
    });
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      materials: nextMaterials,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        salvaged: inst.id,
        gained,
        materials: nextMaterials,
        owned: nextOwned,
        equipped: nextEquipped,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
