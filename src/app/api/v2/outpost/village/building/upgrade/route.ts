import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { isGuildMasterOrVice } from "@/lib/server/guildAdmin";
import {
  guildOwningOutpost,
  lockGuildSettlement,
  lockVillage,
  normalizeVillageOwner,
  upsertGuildSettlement,
  upsertVillage,
} from "@/lib/server/v2Settlement";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import {
  PRODUCTION_KINDS,
  SETTLEMENT_BUILDINGS,
  nextSettlementBuildingUpgrade,
  settlementBuildingIdOf,
  settlementBuildingLevelOf,
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

// POST /api/v2/outpost/village/building/upgrade — body { outpostId, slot }
// 영지 건축물 업그레이드. 비용은 길드 정착지 재화에서 차감한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { outpostId?: unknown; slot?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const outpostId = typeof body.outpostId === "string" ? body.outpostId : "";
  const slot = typeof body.slot === "number" ? body.slot : Number(body.slot);
  if (!outpostId || !Number.isInteger(slot) || slot < 0) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const guildId = await guildOwningOutpost(tx, userId, outpostId);
      if (guildId == null) {
        return { status: 403, body: { ok: false as const, error: "not_owner" } };
      }
      if (!(await isGuildMasterOrVice(tx, guildId, userId))) {
        return {
          status: 403,
          body: { ok: false as const, error: "not_authorized" },
        };
      }

      const loaded = await lockVillage(tx, outpostId);
      if (!loaded || loaded.name == null) {
        return { status: 409, body: { ok: false as const, error: "not_built" } };
      }
      const village = normalizeVillageOwner(loaded, guildId);
      const building = village.buildings[slot];
      const buildingId = settlementBuildingIdOf(building);
      if (!buildingId) {
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
      village.buildings = {
        ...village.buildings,
        [slot]: settlementBuildingSlot(buildingId, nextUpgrade.level),
      };
      await upsertVillage(tx, village);
      await upsertGuildSettlement(tx, guildId, nextResources);
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
          slot,
          building: village.buildings[slot],
          buildings: village.buildings,
          resources: nextResources,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
