import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  guildMembers,
  outpostVillages,
} from "@/db/schema";
import {
  GUILD_FACILITY_UNLOCK_GOLD_COST,
  PLACEABLE_SETTLEMENT_BUILDING_IDS,
  isSettlementBuildingId,
  settlementBuildingIdOf,
  settlementBuildingSlot,
  type SettlementBuildingId,
} from "@/adventure/data/v2/settlement";
import { ensureUser } from "@/lib/server/ensureUser";
import { isGuildAdmin } from "@/lib/server/guildAdmin";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";

type UnlockBody = {
  buildingId?: unknown;
};

function guildFacilityOutpostId(
  guildId: number,
  buildingId: SettlementBuildingId,
): string {
  return `guild-facility:${guildId}:${buildingId}`;
}

function hasBuilding(
  rows: Array<{ buildings: unknown }>,
  buildingId: SettlementBuildingId,
): boolean {
  for (const row of rows) {
    if (typeof row.buildings !== "object" || row.buildings === null) continue;
    for (const rawBuilding of Object.values(row.buildings)) {
      if (settlementBuildingIdOf(rawBuilding) === buildingId) return true;
    }
  }
  return false;
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: UnlockBody;
  try {
    body = (await req.json()) as UnlockBody;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const buildingId = body.buildingId;
  if (
    !isSettlementBuildingId(buildingId) ||
    !PLACEABLE_SETTLEMENT_BUILDING_IDS.includes(buildingId)
  ) {
    return Response.json({ ok: false, error: "invalid_building" }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const member = (
        await tx
          .select({ guildId: guildMembers.guildId })
          .from(guildMembers)
          .where(eq(guildMembers.userId, userId))
          .limit(1)
      )[0];
      if (!member) {
        return {
          status: 403,
          body: { ok: false as const, error: "no_guild" },
        };
      }

      const guildId = member.guildId;
      if (!(await isGuildAdmin(tx, guildId, userId))) {
        return {
          status: 403,
          body: { ok: false as const, error: "not_authorized" },
        };
      }

      const rows = await tx
        .select({ buildings: outpostVillages.buildings })
        .from(outpostVillages)
        .where(eq(outpostVillages.guildId, guildId))
        .for("update");
      if (hasBuilding(rows, buildingId)) {
        return {
          status: 409,
          body: { ok: false as const, error: "already_unlocked" },
        };
      }

      const cost = GUILD_FACILITY_UNLOCK_GOLD_COST[buildingId];
      if (cost == null) {
        return {
          status: 409,
          body: { ok: false as const, error: "building_unavailable" },
        };
      }
      const resources = await lockGuildResources(tx, guildId);
      if (resources.gold < cost) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "insufficient_gold",
            cost,
            gold: resources.gold,
          },
        };
      }

      const outpostId = guildFacilityOutpostId(guildId, buildingId);
      const existingSynthetic = (
        await tx
          .select({ outpostId: outpostVillages.outpostId })
          .from(outpostVillages)
          .where(
            and(
              eq(outpostVillages.guildId, guildId),
              eq(outpostVillages.outpostId, outpostId),
            ),
          )
          .for("update")
          .limit(1)
      )[0];
      if (existingSynthetic) {
        return {
          status: 409,
          body: { ok: false as const, error: "already_unlocked" },
        };
      }

      const remaining = resources.gold - cost;
      await tx.insert(outpostVillages).values({
        outpostId,
        guildId,
        ownerUserId: null,
        tier: "village",
        name: null,
        productionKind: null,
        unlockedSlots: 1,
        slotKinds: {},
        buildings: { 0: settlementBuildingSlot(buildingId, 1) },
        jobs: {},
      });
      await upsertGuildResources(tx, guildId, {
        ...resources,
        gold: remaining,
      });

      return {
        status: 200,
        body: {
          ok: true as const,
          buildingId,
          cost,
          gold: remaining,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch (err) {
    console.error("[guild.facilities.unlock] failed", err);
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
