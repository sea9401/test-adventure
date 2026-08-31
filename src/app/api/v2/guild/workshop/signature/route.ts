import { db } from "@/db";
import {
  BLACKSMITH_SIGNATURE_LEVEL,
  blacksmithSpecialtyForSlot,
  parseBlacksmithProgressionState,
} from "@/adventure/data/v2/blacksmithSpecialization";
import { artisanLevel, parseArtisanState } from "@/adventure/data/v2/artisan";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
} from "@/adventure/data/v2/v2Equipment";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSavesForUpdate, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

export async function PATCH(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:guild-workshop:signature",
    userLimit: 20,
    ipLimit: 100,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as { iid?: unknown } | null;
  if (typeof body?.iid !== "string" || body.iid.length === 0) {
    return Response.json(
      { ok: false, error: "invalid_equipment" },
      { status: 400 },
    );
  }
  const iid = body.iid;

  const result = await db.transaction(async (tx) => {
    const saves = await lockSavesForUpdate(tx, userId, {
      "crafting.v2": {} as Record<string, unknown>,
      "equipment.v2": {} as Record<string, unknown>,
    });
    const craftingRaw = saves["crafting.v2"];
    const level = artisanLevel(
      parseArtisanState(craftingRaw.artisan).blacksmith,
    );
    if (level < BLACKSMITH_SIGNATURE_LEVEL) {
      return {
        status: 403,
        body: {
          ok: false as const,
          error: "signature_level_locked" as const,
          requiredLevel: BLACKSMITH_SIGNATURE_LEVEL,
        },
      };
    }
    const progression = parseBlacksmithProgressionState(
      craftingRaw.blacksmithProgression,
    );
    const owned = parseEquipmentSave(saves["equipment.v2"]).owned;
    const equipment = owned.find((entry) => entry.iid === iid);
    if (!equipment) {
      return {
        status: 409,
        body: { ok: false as const, error: "signature_not_owned" as const },
      };
    }
    if (equipment.craftedBy?.userId !== userId) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "signature_not_self_crafted" as const,
        },
      };
    }
    if (
      !progression.specialty ||
      blacksmithSpecialtyForSlot(V2_EQUIPMENT[equipment.id].slot) !==
        progression.specialty
    ) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "signature_specialty_mismatch" as const,
        },
      };
    }
    const next = { ...progression, signatureIid: iid };
    await upsertSave(tx, userId, "crafting.v2", {
      ...craftingRaw,
      blacksmithProgression: next,
    });
    return {
      status: 200,
      body: { ok: true as const, blacksmithProgression: next },
    };
  });
  return Response.json(result.body, { status: result.status });
}
