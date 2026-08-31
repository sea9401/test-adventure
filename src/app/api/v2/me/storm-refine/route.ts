import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  parseEquipmentSave,
  V2_EQUIPMENT,
} from "@/adventure/data/v2/v2Equipment";
import {
  canStormRefine,
  STORM_REFINEMENT_GOLD_COST,
  STORM_REFINEMENT_MATERIAL_COST,
  stormRefinedRoll,
} from "@/adventure/data/v2/stormEquipmentRefinement";
import { spendGold, V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

type CharSave = {
  gold?: number;
  bankedGold?: number;
  materials?: Record<string, number>;
  [key: string]: unknown;
};

// POST /api/v2/me/storm-refine — 6T 이전 비세트 특화 유니크를 6T 위력대로 확정 개량한다.
// 옵션 굴림·강화·제작 품질·잠금·장착 상태는 유지하고 위력 굴림의 상대 품질만 옮긴다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:me:storm-refine",
    userLimit: 20,
    ipLimit: 100,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { iid?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const iid =
    typeof body.iid === "string" && body.iid.length > 0 ? body.iid : null;
  if (!iid) {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    // 골드/재료 → 장비 순서로 잠가 강화·재련 라우트와 교착 순서를 맞춘다.
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const equipmentSave = await lockSaveForUpdate<unknown>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const { owned, equipped } = parseEquipmentSave(equipmentSave);
    const instance = owned.find((candidate) => candidate.iid === iid);
    if (!instance) {
      return {
        status: 404,
        body: { ok: false as const, error: "not_owned" as const },
      };
    }
    const item = V2_EQUIPMENT[instance.id];
    if (instance.stormRefined) {
      return {
        status: 400,
        body: { ok: false as const, error: "already_refined" as const },
      };
    }
    if (!canStormRefine(item, instance)) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_refineable" as const },
      };
    }

    const materials = { ...(charSave.materials ?? {}) };
    const missingMaterialId = Object.entries(STORM_REFINEMENT_MATERIAL_COST).find(
      ([materialId, required]) =>
        Math.max(0, Math.floor(Number(materials[materialId]) || 0)) < required,
    )?.[0];
    if (missingMaterialId) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_material" as const,
          materialId: missingMaterialId,
        },
      };
    }

    const gold = Math.max(0, Math.floor(Number(charSave.gold) || 0));
    const bankedGold = Math.max(
      0,
      Math.floor(Number(charSave.bankedGold) || 0),
    );
    const spend = spendGold(gold, bankedGold, STORM_REFINEMENT_GOLD_COST);
    if (!spend.ok) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_gold" as const,
          goldCost: STORM_REFINEMENT_GOLD_COST,
        },
      };
    }

    for (const [materialId, required] of Object.entries(
      STORM_REFINEMENT_MATERIAL_COST,
    )) {
      const left = Math.max(
        0,
        Math.floor(Number(materials[materialId]) || 0) - required,
      );
      if (left > 0) materials[materialId] = left;
      else delete materials[materialId];
    }

    const oldPower = instance.roll?.power ?? item.power;
    const nextRoll = stormRefinedRoll(item, instance);
    const nextOwned = owned.map((candidate) =>
      candidate.iid === iid
        ? { ...candidate, roll: nextRoll, stormRefined: true as const }
        : candidate,
    );
    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped,
    });
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: spend.gold,
      bankedGold: spend.bankedGold,
      materials,
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        itemId: instance.id,
        oldPower,
        newPower: nextRoll.power,
        goldCost: STORM_REFINEMENT_GOLD_COST,
        gold: spend.gold,
        ...(V2_CORE_LOOP_V2 ? { bankedGold: spend.bankedGold } : {}),
        materials,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
