import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { isGuildMasterOrVice } from "@/lib/server/guildAdmin";
import {
  lockGuildFacilitiesVillage,
  readGuildSmithyLevel,
} from "@/lib/server/guildFacilities";
import {
  lockGuildSettlement,
  upsertGuildSettlement,
  upsertVillage,
} from "@/lib/server/v2Settlement";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import {
  GUILD_SMITHY_UPGRADES,
  PRODUCTION_KINDS,
  nextGuildSmithyUpgrade,
  settlementBuildingSlot,
  type SettlementResources,
} from "@/adventure/data/v2/settlement";

function canAfford(
  resources: SettlementResources,
  cost: SettlementResources,
): boolean {
  return PRODUCTION_KINDS.every(
    (kind) => Math.max(0, resources[kind] ?? 0) >= Math.max(0, cost[kind] ?? 0),
  );
}

function spendCost(
  resources: SettlementResources,
  cost: SettlementResources,
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
// 현재 길드의 전역 대장간을 개방(Lv1)하거나 다음 레벨로 업그레이드한다.
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
      if (!(await isGuildMasterOrVice(tx, guildId, userId))) {
        return {
          status: 403,
          body: { ok: false as const, error: "not_authorized" },
        };
      }

      const facilities = await lockGuildFacilitiesVillage(tx, guildId);
      const currentLevel = await readGuildSmithyLevel(tx, guildId);
      const nextUpgrade =
        currentLevel <= 0
          ? GUILD_SMITHY_UPGRADES[0]
          : nextGuildSmithyUpgrade(currentLevel);
      if (!nextUpgrade) {
        return { status: 409, body: { ok: false as const, error: "max_level" } };
      }

      const resources = await lockGuildSettlement(tx, guildId);
      if (!canAfford(resources, nextUpgrade.cost)) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "insufficient_resources",
            resources,
          },
        };
      }

      const nextResources = spendCost(resources, nextUpgrade.cost);
      const nextBuilding = settlementBuildingSlot(
        "guild_smithy",
        nextUpgrade.level,
      );
      const nextFacilities = {
        ...facilities,
        unlockedSlots: Math.max(1, facilities.unlockedSlots),
        buildings: {
          ...facilities.buildings,
          0: nextBuilding,
        },
      };
      await upsertVillage(tx, nextFacilities);
      await upsertGuildSettlement(tx, guildId, nextResources);
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
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
