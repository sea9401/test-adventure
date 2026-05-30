import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  MAX_DURABILITY,
  durabilityOf,
  parseEquipmentSave,
  repairCostFor,
  type EquipmentSave,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";

// POST /api/v2/me/equipment/repair — 장비 수리(내구도 → MAX). 골드 싱크(PR-4b).
//
// body: { equipmentId: V2EquipmentId } (한 개) | { all: true } (손상된 보유 장비 전부)
// 응답: { ok, gold, repaired: V2EquipmentId[], spent, durability } | { ok:false, error }
//
// 비용 = repairCostFor(상점가 × 비율 × 소모분/MAX). 이미 풀충이면 0(대상 제외).
// lock 순서: character.v2 → equipment.v2 (shop 라우트와 통일 — 데드락 방지).

type CharSave = { gold?: number; [k: string]: unknown };

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { equipmentId?: unknown; all?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const all = body.all === true;
  const single =
    typeof body.equipmentId === "string"
      ? (body.equipmentId as V2EquipmentId)
      : null;
  if (!all && !single) {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const equipSave = await lockSaveForUpdate<EquipmentSave>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const { owned, durability } = parseEquipmentSave(equipSave);
    const ownedSet = new Set<V2EquipmentId>(owned);

    // 수리 대상 결정.
    let targets: V2EquipmentId[];
    if (single) {
      if (!ownedSet.has(single)) {
        return {
          status: 400,
          body: { ok: false as const, error: "not_owned" as const },
        };
      }
      targets = [single];
    } else {
      // all — durability 맵에서 MAX 미만인 보유 id 전부.
      targets = (Object.keys(durability) as V2EquipmentId[]).filter(
        (id) =>
          ownedSet.has(id) && durabilityOf(durability, id) < MAX_DURABILITY,
      );
    }

    // 비용 합산 (이미 풀충은 0 → 제외).
    let spent = 0;
    const nextDurability = { ...durability };
    const repaired: V2EquipmentId[] = [];
    for (const id of targets) {
      const cost = repairCostFor(id, durabilityOf(durability, id));
      if (cost <= 0) continue;
      spent += cost;
      nextDurability[id] = MAX_DURABILITY;
      repaired.push(id);
    }

    const gold = Math.max(0, charSave.gold ?? 0);
    if (repaired.length === 0) {
      return {
        status: 200,
        body: {
          ok: true as const,
          gold,
          repaired: [] as V2EquipmentId[],
          spent: 0,
          durability,
        },
      };
    }
    if (gold < spent) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_gold" as const,
          required: spent,
          have: gold,
        },
      };
    }

    await upsertSave(tx, userId, "equipment.v2", {
      ...equipSave,
      durability: nextDurability,
    });
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: gold - spent,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        gold: gold - spent,
        repaired,
        spent,
        durability: nextDurability,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
