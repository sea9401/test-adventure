import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostVillages } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import {
  GUILD_WORKSHOP_DELIVERIES,
  claimGuildWorkshopDelivery,
  guildWorkshopDeliveryReward,
  guildWorkshopDeliveryViews,
  isGuildWorkshopDeliveryId,
  parseGuildWorkshopDeliveryState,
  todayDeliveryKey,
} from "@/adventure/data/v2/guildWorkshopDelivery";
import {
  settlementBuildingIdOf,
  settlementBuildingLevelOf,
} from "@/adventure/data/v2/settlement";
import {
  addArtisanXpOnly,
  parseArtisanState,
} from "@/adventure/data/v2/artisan";
import { V2_EQUIPMENT, parseEquipmentSave } from "@/adventure/data/v2/v2Equipment";
import { getGuildIdByUser } from "@/lib/server/v2EnsureSoloGuild";


function guildSmithyLevelFromBuildings(buildings: unknown): number {
  if (buildings == null || typeof buildings !== "object" || Array.isArray(buildings)) {
    return 0;
  }
  let level = 0;
  for (const raw of Object.values(buildings as Record<string, unknown>)) {
    if (settlementBuildingIdOf(raw) === "guild_smithy") {
      level = Math.max(level, settlementBuildingLevelOf(raw));
    }
  }
  return level;
}

async function guildSmithyLevel(guildId: number): Promise<number> {
  const rows = await db
    .select({ buildings: outpostVillages.buildings })
    .from(outpostVillages)
    .where(eq(outpostVillages.guildId, guildId));
  return rows.reduce(
    (max, row) => Math.max(max, guildSmithyLevelFromBuildings(row.buildings)),
    0,
  );
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const guildId = await getGuildIdByUser(userId);
  if (guildId == null) {
    return Response.json({ ok: false, error: "no_guild" }, { status: 403 });
  }
  const smithyLevel = await guildSmithyLevel(guildId);
  const dayKey = todayDeliveryKey();
  const out = await db.transaction(async (tx) => {
    const equipmentRaw = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const craftingRaw = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "crafting.v2",
      {},
    );
    const { owned, equipped } = parseEquipmentSave(equipmentRaw);
    const state = parseGuildWorkshopDeliveryState(
      (craftingRaw.delivery ?? null) as unknown,
      dayKey,
    );
    return {
      dayKey,
      deliveries: guildWorkshopDeliveryViews(
        state,
        owned,
        new Set(Object.values(equipped).filter(Boolean)),
        smithyLevel,
      ),
      smithyLevel,
    };
  });
  return Response.json({ ok: true, ...out });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { deliveryId?: unknown; iid?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!isGuildWorkshopDeliveryId(body.deliveryId) || typeof body.iid !== "string") {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const deliveryId = body.deliveryId;
  const iid = body.iid;
  const guildId = await getGuildIdByUser(userId);
  if (guildId == null) {
    return Response.json({ ok: false, error: "no_guild" }, { status: 403 });
  }
  const smithyLevel = await guildSmithyLevel(guildId);

  const result = await db.transaction(async (tx) => {
    const dayKey = todayDeliveryKey();
    const equipmentRaw = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const craftingRaw = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "crafting.v2",
      {},
    );
    const { owned, equipped } = parseEquipmentSave(equipmentRaw);
    const equippedIids = new Set(Object.values(equipped).filter(Boolean));
    const state = parseGuildWorkshopDeliveryState(craftingRaw.delivery, dayKey);
    if (state.claimed.includes(deliveryId)) {
      return {
        status: 409,
        body: { ok: false as const, error: "already_claimed" },
      };
    }
    const delivery = GUILD_WORKSHOP_DELIVERIES[deliveryId];
    const target = owned.find((inst) => inst.iid === iid);
    if (
      !target ||
      target.locked ||
      equippedIids.has(target.iid) ||
      !delivery.accepts(target)
    ) {
      return {
        status: 409,
        body: { ok: false as const, error: "not_deliverable" },
      };
    }

    const nextOwned = owned.filter((inst) => inst.iid !== target.iid);
    const nextDelivery = claimGuildWorkshopDelivery(state, delivery.id);
    const reward = guildWorkshopDeliveryReward(delivery, target, smithyLevel);
    const nextArtisan = addArtisanXpOnly(
      parseArtisanState(craftingRaw.artisan),
      "blacksmith",
      reward.rewardArtisanXp,
    );
    const guildGold = await lockGuildResources(tx, guildId);
    await upsertGuildResources(tx, guildId, {
      gold: guildGold.gold + reward.rewardGold,
    });
    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped,
    });
    await upsertSave(tx, userId, "crafting.v2", {
      ...craftingRaw,
      artisan: nextArtisan,
      delivery: nextDelivery,
    });
    await logGuildActivity(tx, {
      guildId,
      type: "workshop_delivery",
      actorUserId: userId,
      meta: {
        deliveryTitle: delivery.title,
        itemName: V2_EQUIPMENT[target.id]?.name ?? target.id,
        rewardGold: reward.rewardGold,
        artisanXp: reward.rewardArtisanXp,
      },
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        dayKey,
        smithyLevel,
        rewardGold: reward.rewardGold,
        rewardArtisanXp: reward.rewardArtisanXp,
        deliveries: guildWorkshopDeliveryViews(
          nextDelivery,
          nextOwned,
          equippedIids,
          smithyLevel,
        ),
      },
    };
  });
  return Response.json(result.body, { status: result.status });
}
