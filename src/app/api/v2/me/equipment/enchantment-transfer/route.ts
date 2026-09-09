import { db } from "@/db";
import { V2_EQUIPMENT_LIBERATION } from "@/adventure/data/v2/coreLoopConfig";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  applyEquipmentEnchantmentTransfer,
  type EnchantmentTransferResponse,
} from "@/lib/server/equipmentEnchantmentTransfer";
import { insertEquipmentLiberationReceipt, readEquipmentLiberationReceipt } from "@/lib/server/equipmentLiberationReceipts";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
}

export async function POST(req: Request) {
  if (!V2_EQUIPMENT_LIBERATION) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, {
    userId, action: "v2:me:equipment-enchantment-transfer", userLimit: 30, ipLimit: 120, windowMs: 60_000,
  });
  if (limited) return limited;

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;
  const sourceIid = typeof body.sourceIid === "string" ? body.sourceIid.trim() : "";
  const targetIid = typeof body.targetIid === "string" ? body.targetIid.trim() : "";
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  const { expectedSourceRevision, expectedTargetRevision } = body;
  if (!sourceIid || !targetIid || sourceIid.length > 200 || targetIid.length > 200 ||
    !UUID_PATTERN.test(requestId) || !isRevision(expectedSourceRevision) || !isRevision(expectedTargetRevision)) {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }

  // 기존 영수증의 iid 칸에 작업 종류와 두 장비의 의도를 함께 저장한다.
  // UUID는 재마법부여와 공유하므로 다른 작업에 재사용해도 충돌로 거절한다.
  const intentKey = `enchantment-transfer:${JSON.stringify([sourceIid, targetIid, expectedTargetRevision])}`;
  const result = await db.transaction(async (tx) => {
    const character = await lockSaveForUpdate<Record<string, unknown>>(tx, userId, "character.v2", {});
    const existing = await readEquipmentLiberationReceipt<EnchantmentTransferResponse>(tx, userId, requestId);
    if (existing) {
      if (existing.iid !== intentKey || existing.expectedRevision !== expectedSourceRevision) {
        return { status: 409, body: { ok: false, error: "request_id_conflict" } };
      }
      return { status: 200, body: { ...existing.response, replayed: true } };
    }
    const equipment = await lockSaveForUpdate<unknown>(tx, userId, "equipment.v2", {});
    const applied = applyEquipmentEnchantmentTransfer({
      character, equipment, sourceIid, targetIid, expectedSourceRevision, expectedTargetRevision,
    });
    if (!applied.ok) return { status: applied.error === "not_owned" ? 404 : 409, body: applied };
    const response: EnchantmentTransferResponse = {
      ok: true, source: applied.source, target: applied.target,
      gold: applied.character.gold, bankedGold: applied.character.bankedGold, spentGold: applied.spentGold,
    };
    await upsertSave(tx, userId, "equipment.v2", applied.equipment);
    await upsertSave(tx, userId, "character.v2", applied.character);
    await insertEquipmentLiberationReceipt(tx, {
      userId, requestId, iid: intentKey, expectedRevision: expectedSourceRevision, response,
    });
    return { status: 200, body: { ...response, replayed: false } };
  });
  return Response.json(result.body, { status: result.status });
}
