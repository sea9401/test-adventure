import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import {
  V2_RECIPES,
  consumeIngredients,
  craftShortfall,
} from "@/adventure/data/v2/v2Recipes";
import { rollItemStats } from "@/adventure/data/v2/v2EquipVariance";

// POST /api/v2/me/craft — 재료 직접 제작 (재료 + 골드 → 완성 장비).
//
// body: { id: V2EquipmentId }
// character.v2.materials + character.v2.gold 를 차감하고 equipment.v2.owned 에 +1
// (중복 허용 — 구매와 동일 카운트 모델). 레시피는 전부 자동 보유라 별도 해금 검사 없음.
// 재료/골드 부족이면 무변경 + 부족 내역 반환.
//
// read-modify-write 는 character.v2 / equipment.v2 두 키를 FOR UPDATE 로 잠근 한 트랜잭션
// 안에서 — 동시 사냥/구매와의 race(materials/gold/owned 덮어쓰기) 예방. shop/equipment(구매)
// + shop/material/sell(차감) 패턴을 합친 형태.
//
// 응답: { ok:true, crafted, gold, materials, owned } | { ok:false, error, ... }

type CharSave = {
  gold?: number;
  materials?: Record<string, unknown>;
  [k: string]: unknown;
};

// 보유 재료 정규화 — 양의 정수만. shop/material/sell 과 동일 규칙.
function parseMaterials(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        out[k] = Math.floor(v);
      }
    }
  }
  return out;
}

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
  // 유니크 등 레시피 없는 장비는 제작 불가(레시피 부재 = 제작 불가 신호).
  const recipe = V2_RECIPES[id];
  if (!recipe) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
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

    const materials = parseMaterials(charSave.materials);
    // 손상(NaN/비숫자) 골드는 0 으로 안전화 — NaN 전파 방지.
    const gold =
      typeof charSave.gold === "number" && Number.isFinite(charSave.gold)
        ? Math.max(0, Math.floor(charSave.gold))
        : 0;

    const shortfall = craftShortfall(recipe, materials, gold);
    if (!shortfall.ok) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient" as const,
          missingMaterials: shortfall.missingMaterials,
          goldShort: shortfall.goldShort,
        },
      };
    }

    const nextMaterials = consumeIngredients(materials, recipe);
    const nextGold = gold - recipe.gold;
    const parsed = parseEquipmentSave(equipSave);
    const nextOwned = [...parsed.owned, id];
    // 개체 굴림 — 처음 획득이면 굴려 저장(keep-first). 이미 보유 굴림 있으면 유지(같은 id 공유).
    const nextStatRolls = { ...parsed.statRolls };
    if (!nextStatRolls[id]) {
      nextStatRolls[id] = rollItemStats(V2_EQUIPMENT[id], Math.random);
    }

    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      materials: nextMaterials,
      gold: nextGold,
    });
    await upsertSave(tx, userId, "equipment.v2", {
      ...equipSave,
      owned: nextOwned,
      statRolls: nextStatRolls,
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        crafted: id,
        gold: nextGold,
        materials: nextMaterials,
        owned: nextOwned,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
