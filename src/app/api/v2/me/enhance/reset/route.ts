import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  enhancementResetError,
  parseEquipmentSave,
  resetInstanceEnhancement,
  type EquipmentSave,
  type EnhancementResetError,
} from "@/adventure/data/v2/v2Equipment";

function resetFailure(status: number, error: EnhancementResetError | "not_owned") {
  return { status, body: { ok: false as const, error } };
}

// POST /api/v2/me/enhance/reset — 투자 재화 환급 없이 장비의 강화 상태만 제거한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:me:enhance-reset",
    userLimit: 30,
    ipLimit: 150,
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
    return Response.json({ ok: false, error: "invalid_iid" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const save = await lockSaveForUpdate<EquipmentSave>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const { owned, equipped } = parseEquipmentSave(save);
    const inst = owned.find((entry) => entry.iid === iid);
    if (!inst) return resetFailure(404, "not_owned");

    const error = enhancementResetError(inst, equipped);
    if (error) {
      return resetFailure(error === "not_enhanced" ? 400 : 409, error);
    }

    await upsertSave(tx, userId, "equipment.v2", {
      owned: resetInstanceEnhancement(owned, iid),
      equipped,
    });
    return { status: 200, body: { ok: true as const, iid } };
  });

  return Response.json(result.body, { status: result.status });
}
