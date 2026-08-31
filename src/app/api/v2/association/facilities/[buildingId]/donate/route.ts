import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  associationFacilityMaterialsComplete,
  isAdventurerAssociationFacilityId,
  nextAssociationFacilityUpgrade,
} from "@/adventure/data/v2/adventurerAssociation";
import {
  SETTLEMENT_DONATION_MATERIAL_IDS,
  SETTLEMENT_MATERIAL_TO_RESOURCE,
  type SettlementDonationMaterialId,
  type SettlementResources,
} from "@/adventure/data/v2/settlement";
import {
  canUseAdventurerAssociation,
  lockAssociationFacility,
  saveAssociationFacility,
} from "@/lib/server/adventurerAssociation";
import { spendGold } from "@/adventure/data/v2/coreLoopConfig";

type Ctx = { params: Promise<{ buildingId: string }> };
type CharacterSave = Record<string, unknown> & {
  materials?: Record<string, number>;
  gold?: number;
  bankedGold?: number;
};

function isDonationMaterialId(value: string): value is SettlementDonationMaterialId {
  return SETTLEMENT_DONATION_MATERIAL_IDS.includes(
    value as SettlementDonationMaterialId,
  );
}

export async function POST(req: Request, { params }: Ctx) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!(await canUseAdventurerAssociation(db, userId))) {
    return Response.json(
      { ok: false, error: "association_for_solo_only" },
      { status: 403 },
    );
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:association:facility-donate",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { buildingId: rawBuildingId } = await params;
  if (!isAdventurerAssociationFacilityId(rawBuildingId)) {
    return Response.json({ ok: false, error: "invalid_building" }, { status: 400 });
  }
  let body: { donations?: unknown; gold?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const rawDonations =
    body.donations && typeof body.donations === "object" && !Array.isArray(body.donations)
      ? Object.entries(body.donations)
      : [];
  const gold = Math.floor(Number(body.gold) || 0);
  if (
    (rawDonations.length === 0 && gold <= 0) ||
    !Number.isSafeInteger(gold) ||
    gold < 0 ||
    rawDonations.some(
      ([id, amount]) =>
        !isDonationMaterialId(id) ||
        !Number.isSafeInteger(amount) ||
        Number(amount) <= 0,
    )
  ) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const progress = await lockAssociationFacility(tx, rawBuildingId);
    const next = nextAssociationFacilityUpgrade(rawBuildingId, progress.level);
    if (!next) {
      return { status: 409, body: { ok: false as const, error: "max_level" } };
    }
    const char = await lockSaveForUpdate<CharacterSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const inventory = { ...(char.materials ?? {}) };
    const nextMaterials: SettlementResources = { ...progress.materials };
    for (const [rawId, rawAmount] of rawDonations) {
      const materialId = rawId as SettlementDonationMaterialId;
      const amount = Number(rawAmount);
      const key = SETTLEMENT_MATERIAL_TO_RESOURCE[materialId];
      const required = Math.max(0, next.associationCost[key] ?? 0);
      const donated = Math.max(0, nextMaterials[key] ?? 0);
      if (required <= 0) {
        return { status: 409, body: { ok: false as const, error: "material_not_required" } };
      }
      if (amount > required - donated) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "exceeds_required",
            materialId,
            remaining: required - donated,
          },
        };
      }
      const owned = Math.max(0, Math.floor(inventory[materialId] ?? 0));
      if (amount > owned) {
        return {
          status: 409,
          body: { ok: false as const, error: "insufficient_material", materialId, owned },
        };
      }
      inventory[materialId] = owned - amount;
      nextMaterials[key] = donated + amount;
    }

    const requiredGold = Math.max(0, next.associationCost.gold ?? 0);
    if (gold > requiredGold - progress.gold) {
      return {
        status: 409,
        body: { ok: false as const, error: "exceeds_required", remainingGold: requiredGold - progress.gold },
      };
    }
    const payment = spendGold(
      Math.max(0, Math.floor(Number(char.gold) || 0)),
      Math.max(0, Math.floor(Number(char.bankedGold) || 0)),
      gold,
    );
    if (!payment.ok) {
      return { status: 409, body: { ok: false as const, error: "insufficient_gold" } };
    }

    const completed =
      associationFacilityMaterialsComplete(nextMaterials, next.associationCost) &&
      progress.gold + gold >= requiredGold;
    const nextLevel = completed ? next.level : progress.level;
    const following = nextAssociationFacilityUpgrade(rawBuildingId, nextLevel);
    const saved = {
      buildingId: rawBuildingId,
      level: nextLevel,
      targetLevel: following?.level ?? null,
      materials: completed ? {} : nextMaterials,
      gold: completed ? 0 : progress.gold + gold,
    };
    await upsertSave(tx, userId, "character.v2", {
      ...char,
      materials: inventory,
      gold: payment.gold,
      bankedGold: payment.bankedGold,
    });
    await saveAssociationFacility(tx, saved);
    return {
      status: 200,
      body: {
        ok: true as const,
        facility: saved,
        upgraded: completed,
        donatedGold: gold,
        materials: inventory,
        gold: payment.gold,
        bankedGold: payment.bankedGold,
        nextUpgrade: following,
      },
    };
  });
  return Response.json(result.body, { status: result.status });
}
