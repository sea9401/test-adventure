import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_MATERIALS,
  V2_MATERIAL_SELL_PRICE,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";

// POST /api/v2/shop/material/sell — 보유 재료 판매 (드랍 환금).
//
// body: { id: V2MaterialId, amount?: number }
// amount 미지정 또는 보유 초과면 보유 전량 판매. 가격 = V2_MATERIAL_SELL_PRICE[id] × 수량.
// 재료는 character.v2.materials (Record<id, count>) 에 저장 — 사냥 드랍 누적처와 동일.
// (구매는 미지원 — 재료는 현재 소비처가 없어 환금 전용.)

type CharSave = {
  gold?: number;
  materials?: Record<string, unknown>;
  [k: string]: unknown;
};

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

  let body: { id?: unknown; amount?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? (body.id as V2MaterialId) : null;
  if (!id || !(id in V2_MATERIALS)) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  const unitPrice = V2_MATERIAL_SELL_PRICE[id];
  // 요청 수량 — 양의 정수만. 미지정이면 전량 (아래에서 보유량으로 clamp).
  const reqAmount =
    typeof body.amount === "number" && Number.isFinite(body.amount)
      ? Math.floor(body.amount)
      : null;
  if (reqAmount != null && reqAmount <= 0) {
    return Response.json(
      { ok: false, error: "invalid_amount" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materials = parseMaterials(charSave.materials);
    const owned = materials[id] ?? 0;
    if (owned <= 0) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_owned" as const },
      };
    }
    const sellCount = reqAmount == null ? owned : Math.min(reqAmount, owned);
    const gain = sellCount * unitPrice;
    const nextMaterials = { ...materials };
    const remaining = owned - sellCount;
    if (remaining > 0) nextMaterials[id] = remaining;
    else delete nextMaterials[id];
    // 저장값이 손상(NaN/비숫자)이어도 0 으로 안전화 — NaN 전파 방지.
    const gold =
      typeof charSave.gold === "number" && Number.isFinite(charSave.gold)
        ? Math.max(0, charSave.gold)
        : 0;
    const newGold = gold + gain;
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      materials: nextMaterials,
      gold: newGold,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        gold: newGold,
        materials: nextMaterials,
        sold: { id, count: sellCount, gold: gain },
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
