import { db } from "@/db";
import { V2_EQUIPMENT_LIBERATION } from "@/adventure/data/v2/coreLoopConfig";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  applyEquipmentLiberation,
  type EquipmentLiberationFailure,
} from "@/lib/server/equipmentLiberationService";
import {
  insertEquipmentLiberationReceipt,
  readEquipmentLiberationReceipt,
  type EquipmentLiberationReceiptResponse,
} from "@/lib/server/equipmentLiberationReceipts";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failureStatus(error: EquipmentLiberationFailure["error"]): number {
  return error === "not_owned" ? 404 : 409;
}

export async function POST(req: Request) {
  if (!V2_EQUIPMENT_LIBERATION) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:me:equipment-liberate",
    userLimit: 60,
    ipLimit: 240,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: {
    iid?: unknown;
    requestId?: unknown;
    expectedRevision?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const iid = typeof body.iid === "string" ? body.iid.trim() : "";
  const requestId =
    typeof body.requestId === "string" ? body.requestId.trim() : "";
  const expectedRevision = Number(body.expectedRevision);
  if (
    !iid ||
    !UUID_PATTERN.test(requestId) ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0
  ) {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const character = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const existing = await readEquipmentLiberationReceipt(
      tx,
      userId,
      requestId,
    );
    if (existing) {
      if (
        existing.iid !== iid ||
        existing.expectedRevision !== expectedRevision
      ) {
        return {
          status: 409,
          body: { ok: false as const, error: "request_id_conflict" as const },
        };
      }
      return {
        status: 200,
        body: { ...existing.response, replayed: true },
      };
    }

    const equipment = await lockSaveForUpdate<unknown>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const applied = applyEquipmentLiberation({
      character,
      equipment,
      iid,
      expectedRevision,
      rng: Math.random,
    });
    if (!applied.ok) {
      return {
        status: failureStatus(applied.error),
        body: applied,
      };
    }

    const response: EquipmentLiberationReceiptResponse = {
      ok: true,
      item: applied.item,
      gold: Number(applied.character.gold),
      bankedGold: Number(applied.character.bankedGold),
      spentGold: applied.spentGold,
    };
    await upsertSave(
      tx,
      userId,
      "equipment.v2",
      applied.equipment,
    );
    await upsertSave(
      tx,
      userId,
      "character.v2",
      applied.character,
    );
    await insertEquipmentLiberationReceipt(tx, {
      userId,
      requestId,
      iid,
      expectedRevision,
      response,
    });

    return {
      status: 200,
      body: { ...response, replayed: false },
    };
  });

  return Response.json(result.body, { status: result.status });
}
