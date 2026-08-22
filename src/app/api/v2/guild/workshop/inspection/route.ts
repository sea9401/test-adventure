import { db } from "@/db";
import { EQUIPMENT_CODEX_KEY } from "@/adventure/data/v2/equipmentCodex";
import { parseBlacksmithProgressionState } from "@/adventure/data/v2/blacksmithSpecialization";
import {
  V2_EQUIPMENT,
  isUnique,
  parseEquipmentSave,
} from "@/adventure/data/v2/v2Equipment";
import { mintEquipInstance } from "@/adventure/data/v2/v2EquipMint";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  lockSavesForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { recordUniqueEquipmentAcquisitions } from "@/lib/server/uniqueEquipmentAchievement";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:guild-workshop:inspection",
    userLimit: 20,
    ipLimit: 100,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as {
    inspectionId?: unknown;
    candidateIndex?: unknown;
  } | null;
  if (
    typeof body?.inspectionId !== "string" ||
    body.inspectionId.length === 0 ||
    (body.candidateIndex !== 0 && body.candidateIndex !== 1)
  ) {
    return Response.json(
      { ok: false, error: "invalid_inspection_choice" },
      { status: 400 },
    );
  }
  const inspectionId = body.inspectionId;
  const candidateIndex = body.candidateIndex;

  const result = await db.transaction(async (tx) => {
    const saves = await lockSavesForUpdate(tx, userId, {
      "crafting.v2": {} as Record<string, unknown>,
      "equipment.v2": {} as Record<string, unknown>,
    });
    const craftingRaw = saves["crafting.v2"];
    const progression = parseBlacksmithProgressionState(
      craftingRaw.blacksmithProgression,
    );
    const resolved = progression.lastInspectionResolution;
    if (resolved?.inspectionId === inspectionId) {
      if (resolved.candidateIndex !== candidateIndex) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "inspection_already_resolved" as const,
            candidateIndex: resolved.candidateIndex,
            iid: resolved.iid,
          },
        };
      }
      return {
        status: 200,
        body: {
          ok: true as const,
          inspectionId,
          candidateIndex,
          iid: resolved.iid,
          idempotent: true,
          blacksmithProgression: progression,
        },
      };
    }
    const pending = progression.pendingInspection;
    if (!pending || pending.inspectionId !== inspectionId) {
      return {
        status: 409,
        body: { ok: false as const, error: "inspection_not_found" as const },
      };
    }
    const parsedEquipment = parseEquipmentSave(saves["equipment.v2"]);
    const item = {
      ...mintEquipInstance(
        pending.equipmentId,
        pending.candidates[candidateIndex],
      ),
      craftQuality: pending.craftQuality,
      craftedBy: pending.craftedBy,
    };
    const nextOwned = [...parsedEquipment.owned, item];
    const { pendingInspection: _pendingInspection, ...progressionWithoutPending } =
      progression;
    const lastInspectionResolution = {
      inspectionId,
      candidateIndex,
      iid: item.iid,
    } as const;
    const nextProgression = {
      ...progressionWithoutPending,
      lastInspectionResolution,
    };
    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped: parsedEquipment.equipped,
    });
    await upsertSave(tx, userId, "crafting.v2", {
      ...craftingRaw,
      blacksmithProgression: nextProgression,
    });
    if (isUnique(V2_EQUIPMENT[pending.equipmentId])) {
      await recordUniqueEquipmentAcquisitions({
        executor: tx,
        userId,
        evidence: {
          equipmentOwnedAfter: nextOwned,
          equipmentCodexRaw: await readSave(
            tx,
            userId,
            EQUIPMENT_CODEX_KEY,
            {},
          ),
          acquiredIds: [pending.equipmentId],
        },
      });
    }
    return {
      status: 200,
      body: {
        ok: true as const,
        inspectionId,
        candidateIndex,
        iid: item.iid,
        equipmentId: pending.equipmentId,
        item,
        blacksmithProgression: nextProgression,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
