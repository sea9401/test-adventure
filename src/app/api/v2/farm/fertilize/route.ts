import { db } from "@/db";
import {
  FARM_CROP_LIST,
  FARM_SAVE_KEY,
  emptyFarmState,
  getFarmDeliveryRequests,
  getFarmShopItems,
  getFarmSpecialDeliveryRequests,
  getFarmWeeklyDeliveryRequests,
  normalizeFarmForDay,
  parseFarmState,
} from "@/adventure/v2/farm";
import { LIFE_WORKSHOP_SAVE_KEY, parseLifeWorkshopState } from "@/adventure/v2/lifeWorkshop";
import { consumeFinishedItem } from "@/adventure/v2/lifeCrafting";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as { plotId?: unknown } | null;
  const plotId = typeof body?.plotId === "string" ? body.plotId : "";
  if (!plotId) return Response.json({ ok: false, error: "plot_not_found" }, { status: 400 });
  const now = Date.now();
  const result = await db.transaction(async (tx) => {
    const farm = normalizeFarmForDay(parseFarmState(await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now))), now);
    const workshop = parseLifeWorkshopState(await lockSaveForUpdate(tx, userId, LIFE_WORKSHOP_SAVE_KEY, {}));
    const plot = farm.plots.find((entry) => entry.id === plotId);
    if (!plot) return { error: "plot_not_found" as const };
    if (!plot.cropId || !plot.readyAt) return { error: "plot_empty" as const };
    if (plot.readyAt <= now) return { error: "already_ready" as const };
    if (plot.fertilized) return { error: "already_fertilized" as const };
    const crafting = consumeFinishedItem(workshop.crafting, "organic_fertilizer", 1);
    if (!crafting) return { error: "no_fertilizer" as const };
    const remaining = plot.readyAt - now;
    const reducedMs = Math.min(2 * 60 * 60 * 1000, Math.floor(remaining * 0.2));
    const nextFarm = { ...farm, plots: farm.plots.map((entry) => entry.id === plotId ? { ...entry, readyAt: entry.readyAt! - reducedMs, fertilized: true } : entry) };
    const nextWorkshop = { ...workshop, crafting: { ...crafting, aidsUsed: crafting.aidsUsed + 1 } };
    await upsertSave(tx, userId, FARM_SAVE_KEY, nextFarm);
    await upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, nextWorkshop);
    return { ok: true as const, farm: nextFarm, fertilizerBalance: nextWorkshop.crafting.balances.organic_fertilizer ?? 0, fertilizerResult: { plotId, reducedMs } };
  });
  if (!("ok" in result)) return Response.json({ ok: false, error: result.error }, { status: result.error === "no_fertilizer" ? 409 : 400 });
  return Response.json({ ok: true, now, ...result, crops: FARM_CROP_LIST, deliveries: getFarmDeliveryRequests(), specialDeliveries: getFarmSpecialDeliveryRequests(), weeklyDeliveries: getFarmWeeklyDeliveryRequests(), shopItems: getFarmShopItems() });
}
