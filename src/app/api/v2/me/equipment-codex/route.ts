import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import {
  parseEquipmentSave,
  V2_EQUIPMENT,
  type EquipmentSave,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import {
  EQUIPMENT_CODEX_KEY,
  equipmentCodexSummary,
  withRegisteredEquipmentId,
} from "@/adventure/data/v2/equipmentCodex";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const codexRaw = await readSave(db, userId, EQUIPMENT_CODEX_KEY, {});
  return Response.json({ ok: true, ...equipmentCodexSummary(codexRaw) });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

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
    const equipmentRaw = await lockSaveForUpdate<EquipmentSave>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const codexRaw = await lockSaveForUpdate(tx, userId, EQUIPMENT_CODEX_KEY, {});
    const { owned, equipped } = parseEquipmentSave(equipmentRaw);
    const inst = owned.find((item) => item.iid === iid);
    if (!inst) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_owned" as const },
      };
    }
    if (inst.locked) {
      return {
        status: 400,
        body: { ok: false as const, error: "locked" as const },
      };
    }
    if (Object.values(equipped).includes(iid)) {
      return {
        status: 400,
        body: { ok: false as const, error: "equipped" as const },
      };
    }
    if (!V2_EQUIPMENT[inst.id]) {
      return {
        status: 400,
        body: { ok: false as const, error: "invalid_item" as const },
      };
    }

    const { codex, added } = withRegisteredEquipmentId(
      codexRaw,
      inst.id as V2EquipmentId,
    );
    if (!added) {
      return {
        status: 400,
        body: { ok: false as const, error: "already_registered" as const },
      };
    }

    const nextOwned = owned.filter((item) => item.iid !== iid);
    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped,
    });
    await upsertSave(tx, userId, EQUIPMENT_CODEX_KEY, codex);

    return {
      status: 200,
      body: {
        ok: true as const,
        ...equipmentCodexSummary(codex),
        consumedItemId: inst.id,
        owned: nextOwned,
        equipped,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
