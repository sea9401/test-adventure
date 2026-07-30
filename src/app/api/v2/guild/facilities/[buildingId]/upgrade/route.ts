import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { isGuildAdmin } from "@/lib/server/guildAdmin";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import { lockGuildFame, spendGuildFame } from "@/lib/server/v2GuildFame";
import {
  lockGuildSettlementBuilding,
  rememberGuildSettlementBuildingLevel,
  upsertVillage,
} from "@/lib/server/v2Settlement";
import {
  clearGuildFacilityDonationProgress,
  lockGuildFacilityDonationProgress,
} from "@/lib/server/guildFacilityUpgradeDonations";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import {
  PLACEABLE_SETTLEMENT_BUILDING_IDS,
  SETTLEMENT_BUILDINGS,
  isSettlementBuildingId,
  nextSettlementBuildingUpgrade,
  settlementBuildingLevelOf,
  settlementBuildingMaterialsComplete,
  settlementBuildingSlot,
} from "@/adventure/data/v2/settlement";

type Ctx = { params: Promise<{ buildingId: string }> };

// POST /api/v2/guild/facilities/[buildingId]/upgrade
// 모든 기부 재료가 모인 공용 시설을 관리자가 다음 레벨로 완료한다.
export async function POST(_req: Request, { params }: Ctx) {
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

  try {
    const result = await db.transaction(async (tx) => {
      const guildId = await getGuildId(tx, userId);
      if (guildId == null) {
        return { status: 403, body: { ok: false as const, error: "no_guild" } };
      }
      if (!(await isGuildAdmin(tx, guildId, userId))) {
        return {
          status: 403,
          body: { ok: false as const, error: "not_authorized" },
        };
      }

      const location = await lockGuildSettlementBuilding(
        tx,
        guildId,
        buildingId,
      );
      if (!location) {
        return {
          status: 409,
          body: { ok: false as const, error: "building_required" },
        };
      }
      const { village, slot } = location;
      const building = village.buildings[slot];

      const nextUpgrade = nextSettlementBuildingUpgrade(
        buildingId,
        settlementBuildingLevelOf(building),
      );
      if (!nextUpgrade) {
        return { status: 409, body: { ok: false as const, error: "max_level" } };
      }

      const donated = await lockGuildFacilityDonationProgress(
        tx,
        guildId,
        buildingId,
        nextUpgrade.level,
      );
      if (!settlementBuildingMaterialsComplete(donated, nextUpgrade.cost)) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "insufficient_resources",
            progress: donated,
          },
        };
      }

      const goldCost = Math.max(0, Math.floor(nextUpgrade.cost.gold ?? 0));
      const guildGold = await lockGuildResources(tx, guildId);
      if (goldCost > 0 && guildGold.gold < goldCost) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "insufficient_gold",
            gold: guildGold.gold,
            required: goldCost,
          },
        };
      }

      const fameCost = Math.max(0, Math.floor(nextUpgrade.cost.fame ?? 0));
      const guildFame = await lockGuildFame(tx, guildId);
      if (!guildFame) {
        return {
          status: 404,
          body: { ok: false as const, error: "guild_not_found" },
        };
      }
      if (fameCost > 0 && guildFame.fameAvailable < fameCost) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "insufficient_fame",
            fameAvailable: guildFame.fameAvailable,
            required: fameCost,
          },
        };
      }

      const nextGold = guildGold.gold - goldCost;
      const nextFameAvailable = guildFame.fameAvailable - fameCost;
      const nextBuilding = settlementBuildingSlot(buildingId, nextUpgrade.level);
      village.buildings = { ...village.buildings, [slot]: nextBuilding };

      await upsertVillage(tx, village);
      await rememberGuildSettlementBuildingLevel(
        tx,
        guildId,
        buildingId,
        nextUpgrade.level,
      );
      await clearGuildFacilityDonationProgress(tx, guildId, buildingId);
      if (goldCost > 0) {
        await upsertGuildResources(tx, guildId, { gold: nextGold });
      }
      if (fameCost > 0) {
        await spendGuildFame(tx, guildId, fameCost);
      }
      await logGuildActivity(tx, {
        guildId,
        type:
          buildingId === "guild_smithy" ? "smithy_upgrade" : "building_upgrade",
        actorUserId: userId,
        meta:
          buildingId === "guild_smithy"
            ? { smithyLevel: nextUpgrade.level }
            : {
                buildingName: SETTLEMENT_BUILDINGS[buildingId].name,
                buildingLevel: nextUpgrade.level,
              },
      });

      return {
        status: 200,
        body: {
          ok: true as const,
          buildingId,
          buildingLevel: nextUpgrade.level,
          building: nextBuilding,
          progress: {},
          gold: nextGold,
          fameAvailable: nextFameAvailable,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch (err) {
    console.error("[guild.facilities.upgrade] failed", err);
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
