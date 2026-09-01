import { V2_UNEXPLORED } from "@/adventure/data/v2/coreLoopConfig";
import { EQUIPMENT_CODEX_KEY } from "@/adventure/data/v2/equipmentCodex";
import { unexploredBossEquipmentCraftRecipe } from "@/adventure/data/v2/unexploredBosses";
import { db } from "@/db";
import { appendEquipInstances } from "@/lib/server/equipGrant";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  readSave,
  lockSaveForUpdate,
  upsertSave,
} from "@/lib/server/savesKv";
import {
  applyUnexploredBossEquipmentCraft,
  type UnexploredBossEquipmentCraftCharacter,
} from "@/lib/server/unexploredBossEquipmentCraft";
import { recordUniqueEquipmentAcquisitions } from "@/lib/server/uniqueEquipmentAchievement";
import { recordCodexMasteryGameplayBatch } from "@/lib/server/codexMasteryGameplay";

function unavailable() {
  return Response.json({ ok: false, error: "not_found" }, { status: 404 });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!V2_UNEXPLORED) return unavailable();

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const recipe = unexploredBossEquipmentCraftRecipe(body?.equipmentId);
  const requestId = typeof body?.requestId === "string"
    ? body.requestId.trim()
    : "";
  if (!recipe || !requestId || requestId.length > 128) {
    return Response.json(
      { ok: false, error: "invalid_request" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const character =
      await lockSaveForUpdate<UnexploredBossEquipmentCraftCharacter>(
        tx,
        userId,
        "character.v2",
        {},
      );
    const crafted = applyUnexploredBossEquipmentCraft(
      character,
      recipe.equipmentId,
      requestId,
      Date.now(),
    );
    if (!crafted.ok) {
      return {
        status: crafted.error === "not_craftable" ? 400 : 409,
        body: { ok: false as const, error: crafted.error },
      };
    }

    if (!crafted.idempotent && crafted.equipment) {
      const equipmentOwnedAfter = await appendEquipInstances(
        tx,
        userId,
        [crafted.equipment],
      );
      await upsertSave(
        tx,
        userId,
        "character.v2",
        crafted.character,
      );
      await recordUniqueEquipmentAcquisitions({
        executor: tx,
        userId,
        evidence: {
          equipmentOwnedAfter,
          equipmentCodexRaw: await readSave(
            tx,
            userId,
            EQUIPMENT_CODEX_KEY,
            {},
          ),
          acquiredIds: [recipe.equipmentId],
        },
      });
      await recordCodexMasteryGameplayBatch(
        tx,
        userId,
        [{
          category: "equipment",
          entryId: recipe.equipmentId,
          amount: 1,
          source: "equipment.craft",
        }],
        new Date(),
      );
    }

    return {
      status: 200,
      body: {
        ok: true as const,
        idempotent: crafted.idempotent,
        equipmentId: crafted.receipt.equipmentId,
        equipmentIid: crafted.receipt.equipmentIid,
        materials: crafted.character.materials,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
