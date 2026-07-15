import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { lockVillage } from "@/lib/server/v2Settlement";
import {
  lockGuildFacilityDonationProgress,
  setGuildFacilityDonationProgress,
} from "@/lib/server/guildFacilityUpgradeDonations";
import {
  PLACEABLE_SETTLEMENT_BUILDING_IDS,
  SETTLEMENT_DONATION_MATERIAL_IDS,
  SETTLEMENT_MATERIAL_TO_RESOURCE,
  isSettlementBuildingId,
  nextSettlementBuildingUpgrade,
  settlementBuildingLevelOf,
  type SettlementBuildingId,
  type SettlementDonationMaterialId,
  type SettlementResources,
} from "@/adventure/data/v2/settlement";

type Ctx = { params: Promise<{ buildingId: string }> };
type CharacterSave = {
  materials?: Record<string, number>;
  [key: string]: unknown;
};

function guildFacilityOutpostId(
  guildId: number,
  buildingId: SettlementBuildingId,
): string {
  return `guild-facility:${guildId}:${buildingId}`;
}

function isDonationMaterialId(
  value: string,
): value is SettlementDonationMaterialId {
  return SETTLEMENT_DONATION_MATERIAL_IDS.includes(
    value as SettlementDonationMaterialId,
  );
}

// POST /api/v2/guild/facilities/[buildingId]/donate
// body { donations: { [생활 재료 ID]: 수량 } }
// 개방된 Lv.1~4 시설의 다음 단계에 길드원 누구나 개인 생활 재료를 기부한다.
export async function POST(req: Request, { params }: Ctx) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { buildingId: rawBuildingId } = await params;
  if (
    !isSettlementBuildingId(rawBuildingId) ||
    !PLACEABLE_SETTLEMENT_BUILDING_IDS.includes(rawBuildingId)
  ) {
    return Response.json(
      { ok: false, error: "invalid_building" },
      { status: 400 },
    );
  }
  const buildingId = rawBuildingId;

  let rawBody: { donations?: unknown };
  try {
    rawBody = (await req.json()) as typeof rawBody;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (
    typeof rawBody.donations !== "object" ||
    rawBody.donations === null ||
    Array.isArray(rawBody.donations)
  ) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const entries = Object.entries(rawBody.donations);
  if (
    entries.length === 0 ||
    entries.some(
      ([materialId, amount]) =>
        !isDonationMaterialId(materialId) ||
        !Number.isSafeInteger(amount) ||
        Number(amount) <= 0,
    )
  ) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const guildId = await getGuildId(tx, userId);
      if (guildId == null) {
        return { status: 403, body: { ok: false as const, error: "no_guild" } };
      }

      const village = await lockVillage(
        tx,
        guildFacilityOutpostId(guildId, buildingId),
      );
      const building = village?.buildings[0];
      if (!village || building?.id !== buildingId) {
        return {
          status: 409,
          body: { ok: false as const, error: "building_required" },
        };
      }
      const nextUpgrade = nextSettlementBuildingUpgrade(
        buildingId,
        settlementBuildingLevelOf(building),
      );
      if (!nextUpgrade) {
        return { status: 409, body: { ok: false as const, error: "max_level" } };
      }

      const charSave = await lockSaveForUpdate<CharacterSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const inventory = { ...(charSave.materials ?? {}) };
      const progress = await lockGuildFacilityDonationProgress(
        tx,
        guildId,
        buildingId,
        nextUpgrade.level,
      );
      const nextProgress: SettlementResources = { ...progress };

      for (const [rawMaterialId, rawAmount] of entries) {
        const materialId = rawMaterialId as SettlementDonationMaterialId;
        const amount = Number(rawAmount);
        const resourceKey = SETTLEMENT_MATERIAL_TO_RESOURCE[materialId];
        const required = Math.max(0, nextUpgrade.cost[resourceKey] ?? 0);
        const donated = Math.max(0, progress[resourceKey] ?? 0);
        if (required <= 0) {
          return {
            status: 409,
            body: { ok: false as const, error: "material_not_required" },
          };
        }
        if (amount > required - donated) {
          return {
            status: 409,
            body: {
              ok: false as const,
              error: "exceeds_required",
              materialId,
              remaining: Math.max(0, required - donated),
            },
          };
        }
        const owned = Math.max(0, Math.floor(inventory[materialId] ?? 0));
        if (amount > owned) {
          return {
            status: 409,
            body: {
              ok: false as const,
              error: "insufficient_material",
              materialId,
              owned,
            },
          };
        }
        inventory[materialId] = owned - amount;
        nextProgress[resourceKey] = donated + amount;
      }

      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        materials: inventory,
      });
      await setGuildFacilityDonationProgress(
        tx,
        guildId,
        buildingId,
        nextUpgrade.level,
        nextProgress,
      );

      return {
        status: 200,
        body: {
          ok: true as const,
          buildingId,
          targetLevel: nextUpgrade.level,
          progress: nextProgress,
          materials: inventory,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error("[guild.facilities.donate] failed", error);
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
