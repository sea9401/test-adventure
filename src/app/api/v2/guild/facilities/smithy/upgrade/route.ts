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
  lockGuildSettlement,
  lockVillage,
  rememberGuildSettlementBuildingLevel,
  upsertGuildSettlement,
  upsertVillage,
} from "@/lib/server/v2Settlement";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import {
  PRODUCTION_KINDS,
  nextGuildSmithyUpgrade,
  settlementBuildingLevelOf,
  settlementBuildingSlot,
  type SettlementBuildingUpgradeCost,
  type SettlementResources,
} from "@/adventure/data/v2/settlement";

function guildFacilityOutpostId(guildId: number): string {
  return `guild-facility:${guildId}:guild_smithy`;
}

function canAffordMaterials(
  resources: SettlementResources,
  cost: SettlementBuildingUpgradeCost,
): boolean {
  return PRODUCTION_KINDS.every(
    (kind) => Math.max(0, resources[kind] ?? 0) >= Math.max(0, cost[kind] ?? 0),
  );
}

function spendCost(
  resources: SettlementResources,
  cost: SettlementBuildingUpgradeCost,
): SettlementResources {
  const next: SettlementResources = { ...resources };
  for (const kind of PRODUCTION_KINDS) {
    const amount = Math.max(0, cost[kind] ?? 0);
    if (amount > 0) {
      next[kind] = Math.max(0, Math.floor((next[kind] ?? 0) - amount));
    }
  }
  return next;
}

// POST /api/v2/guild/facilities/smithy/upgrade
// 현재 길드의 전역 대장간 시설을 다음 레벨로 업그레이드한다.
export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

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

      const village = await lockVillage(tx, guildFacilityOutpostId(guildId));
      const building = village?.buildings[0];
      if (!village || building?.id !== "guild_smithy") {
        return {
          status: 409,
          body: { ok: false as const, error: "smithy_required" },
        };
      }

      const nextUpgrade = nextGuildSmithyUpgrade(
        settlementBuildingLevelOf(building),
      );
      if (!nextUpgrade) {
        return { status: 409, body: { ok: false as const, error: "max_level" } };
      }

      const resources = await lockGuildSettlement(tx, guildId);
      if (!canAffordMaterials(resources, nextUpgrade.cost)) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "insufficient_resources",
            resources,
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

      const nextResources = spendCost(resources, nextUpgrade.cost);
      const nextGold = guildGold.gold - goldCost;
      const nextFameAvailable = guildFame.fameAvailable - fameCost;
      const nextBuilding = settlementBuildingSlot(
        "guild_smithy",
        nextUpgrade.level,
      );
      village.buildings = { ...village.buildings, 0: nextBuilding };

      await upsertVillage(tx, village);
      await rememberGuildSettlementBuildingLevel(
        tx,
        guildId,
        "guild_smithy",
        nextUpgrade.level,
      );
      await upsertGuildSettlement(tx, guildId, nextResources);
      if (goldCost > 0) {
        await upsertGuildResources(tx, guildId, { gold: nextGold });
      }
      if (fameCost > 0) {
        await spendGuildFame(tx, guildId, fameCost);
      }
      await logGuildActivity(tx, {
        guildId,
        type: "smithy_upgrade",
        actorUserId: userId,
        meta: { smithyLevel: nextUpgrade.level },
      });

      return {
        status: 200,
        body: {
          ok: true as const,
          smithyLevel: nextUpgrade.level,
          building: nextBuilding,
          resources: nextResources,
          gold: nextGold,
          fameAvailable: nextFameAvailable,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch (err) {
    console.error("[guild.facilities.smithy.upgrade] failed", err);
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
