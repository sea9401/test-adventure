import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
  type V2EquipmentId,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { V2_RECIPES, salvageYield } from "@/adventure/data/v2/v2Recipes";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";

// POST /api/v2/me/salvage — 보유 장비 1개를 분해해 재료로 환수.
//
// body: { id: V2EquipmentId }
// 환수 = salvageYield(레시피) (재료의 ~50%, 골드 없음). 레시피 없는 장비(유니크)는 분해 불가.
// 보유 카운트 -1 (첫 등장 제거), 카운트 0 되면 그 슬롯 장착 해제 (판매 라우트와 동일 처리).
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
  // 레시피 없는 장비(유니크)는 분해 불가 — 환수할 재료 정의가 없고, 드랍 전용 트로피 보호.
  const recipe = V2_RECIPES[id];
  if (!recipe) {
    return Response.json(
      { ok: false, error: "not_salvageable" },
      { status: 400 },
    );
  }
  const gained = salvageYield(recipe);

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
    const idx = parsed.owned.indexOf(id);
    if (idx < 0) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_owned" as const },
      };
    }
    // 첫 등장 1개 제거 (판매 라우트와 동일).
    const nextOwned = [
      ...parsed.owned.slice(0, idx),
      ...parsed.owned.slice(idx + 1),
    ];
    const remaining = nextOwned.filter((x) => x === id).length;
    const nextEquipped: Partial<Record<V2EquipSlot, V2EquipmentId>> = {
      ...parsed.equipped,
    };
    if (remaining === 0 && nextEquipped[item.slot] === id) {
      delete nextEquipped[item.slot];
    }
    const nextMaterials = mergeDrops(charSave.materials, gained);
    await upsertSave(tx, userId, "equipment.v2", {
      ...equipSave,
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
        salvaged: id,
        gained,
        materials: nextMaterials,
        owned: nextOwned,
        equipped: nextEquipped,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
