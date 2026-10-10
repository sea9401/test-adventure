// POST /api/v2/life-major/catalyst — { quantity } 단련 촉매 제작.
// 채광 주전공 명장 3단계 이상만. 촉매 1개 = 명장 합금 2 + 명장 목재 1. 재료·결과 모두 character.v2 재료.

import { db } from "@/db";
import {
  LIFE_MAJOR_SAVE_KEY,
  lifeMajorCanCraft,
  lifeMajorView,
  parseLifeMajorState,
  TEMPERING_CATALYST,
} from "@/adventure/v2/lifeMajor";
import { ensureUser } from "@/lib/server/ensureUser";
import { readLifeLevels } from "@/lib/server/lifeMajor";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

const MAX_QUANTITY = 20;

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:life-major:catalyst",
    userLimit: 30,
    ipLimit: 200,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { quantity?: unknown } | null;
  const quantity = body?.quantity;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return Response.json({ ok: false, error: "invalid_quantity" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const character = await lockSaveForUpdate<Record<string, unknown>>(tx, userId, "character.v2", {});
    const state = parseLifeMajorState(await readSave(tx, userId, LIFE_MAJOR_SAVE_KEY, {}));
    if (!lifeMajorCanCraft(state, "mining")) {
      return { status: 409, body: { ok: false as const, error: "catalyst_locked" } };
    }
    const materials = { ...((character.materials ?? {}) as Record<string, number>) };
    const held = (id: string) => Math.max(0, Math.floor(Number(materials[id]) || 0));
    const costs = Object.entries(TEMPERING_CATALYST.recipe);
    if (costs.some(([id, amount]) => held(id) < amount * quantity)) {
      return { status: 409, body: { ok: false as const, error: "not_enough_master_product" } };
    }
    for (const [id, amount] of costs) {
      const left = held(id) - amount * quantity;
      if (left > 0) materials[id] = left;
      else delete materials[id];
    }
    materials[TEMPERING_CATALYST.id] = held(TEMPERING_CATALYST.id) + quantity;
    await upsertSave(tx, userId, "character.v2", { ...character, materials });
    const levels = await readLifeLevels(tx, userId);
    return { status: 200, body: { ok: true as const, crafted: quantity, view: lifeMajorView(state, levels, materials) } };
  });
  return Response.json(result.body, { status: result.status });
}
