import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
  type EquipmentSave,
  type V2EquipmentId,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  EQUIPMENT_CODEX_KEY,
  parseEquipmentCodex,
  serializeEquipmentCodex,
} from "@/adventure/v2/equipmentCodex";

const VALID_IDS = new Set(Object.keys(V2_EQUIPMENT));
const VALID_SLOTS = new Set<V2EquipSlot>([
  "weapon",
  "armor",
  "gloves",
  "boots",
  "ring",
  "necklace",
]);

function ownedIdSet(save: EquipmentSave): Set<V2EquipmentId> {
  return new Set(parseEquipmentSave(save).owned.map((inst) => inst.id));
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.userId, userId),
        inArray(savesKv.key, ["equipment.v2", EQUIPMENT_CODEX_KEY]),
      ),
    );

  let equipmentSave: EquipmentSave = {};
  let codexSave: unknown = {};
  for (const row of rows) {
    if (row.key === "equipment.v2") equipmentSave = row.value as EquipmentSave;
    if (row.key === EQUIPMENT_CODEX_KEY) codexSave = row.value;
  }

  return Response.json({
    ok: true,
    ownedIds: [...ownedIdSet(equipmentSave)],
    registeredIds: [...parseEquipmentCodex(codexSave)],
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { id?: unknown; allOwned?: unknown; slot?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const id =
    typeof body.id === "string" && VALID_IDS.has(body.id)
      ? (body.id as V2EquipmentId)
      : undefined;
  const allOwned = body.allOwned === true;
  const slot =
    typeof body.slot === "string" && VALID_SLOTS.has(body.slot as V2EquipSlot)
      ? (body.slot as V2EquipSlot)
      : undefined;

  if (!id && !allOwned) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (body.slot != null && !slot) {
    return Response.json({ ok: false, error: "bad_slot" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const equipmentSave = await lockSaveForUpdate<EquipmentSave>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const codexSave = await lockSaveForUpdate(
      tx,
      userId,
      EQUIPMENT_CODEX_KEY,
      {},
    );
    const ownedIds = ownedIdSet(equipmentSave);
    const registered = parseEquipmentCodex(codexSave);
    const before = registered.size;

    if (id) {
      if (!ownedIds.has(id)) {
        return {
          status: 400,
          body: { ok: false as const, error: "not_owned" as const },
        };
      }
      registered.add(id);
    }

    if (allOwned) {
      for (const ownedId of ownedIds) {
        if (!slot || V2_EQUIPMENT[ownedId].slot === slot) registered.add(ownedId);
      }
    }

    await upsertSave(
      tx,
      userId,
      EQUIPMENT_CODEX_KEY,
      serializeEquipmentCodex(registered),
    );

    return {
      status: 200,
      body: {
        ok: true as const,
        addedCount: registered.size - before,
        ownedIds: [...ownedIds],
        registeredIds: [...registered],
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
