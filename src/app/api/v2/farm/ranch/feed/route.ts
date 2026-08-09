import { db } from "@/db";
import {
  FARM_CROP_LIST,
  FARM_CROP_REQUIRED_SKILL_ID,
  FARM_SAVE_KEY,
  FarmError,
  emptyFarmState,
  feedFarmRanch,
  getFarmDeliveryRequests,
  getFarmShopItems,
  getFarmSpecialDeliveryRequests,
  getFarmWeeklyDeliveryRequests,
  normalizeFarmForDay,
  parseFarmState,
} from "@/adventure/v2/farm";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  RANCH_PEN_DEFINITIONS,
  RanchError,
  type RanchPenId,
} from "@/adventure/v2/ranch";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceFarmingRateLimit } from "@/lib/server/farmingRateLimit";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const guarded = enforceFarmingRateLimit(req, userId);
  if (guarded) return guarded;
  const body = await req.json().catch(() => null) as { penId?: unknown; amount?: unknown } | null;
  const penId = typeof body?.penId === "string" ? body.penId as RanchPenId : "" as RanchPenId;
  const amount = Math.floor(Number(body?.amount));
  if (!RANCH_PEN_DEFINITIONS.some((entry) => entry.id === penId) || !Number.isFinite(amount) || amount < 1) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const now = Date.now();
    const result = await db.transaction(async (tx) => {
      const skills = parseV2SkillsState(await lockSaveForUpdate(tx, userId, "skills.v2", emptyV2SkillsState()));
      if (!skills.learned.includes(FARM_CROP_REQUIRED_SKILL_ID)) return { ok: false as const, error: "ranch_locked" as const };
      const farm = normalizeFarmForDay(parseFarmState(await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now)), now), now);
      const next = feedFarmRanch(farm, penId, amount, now);
      await upsertSave(tx, userId, FARM_SAVE_KEY, next);
      return { ok: true as const, farm: next, learnedSkillIds: skills.learned };
    });
    if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: 400 });
    return Response.json({ now, ...result, crops: FARM_CROP_LIST, deliveries: getFarmDeliveryRequests(), specialDeliveries: getFarmSpecialDeliveryRequests(), weeklyDeliveries: getFarmWeeklyDeliveryRequests(), shopItems: getFarmShopItems(), ranchFeedResult: { penId, amount, feedRemaining: result.farm.ranch.pens[penId].feed } });
  } catch (error) {
    if (error instanceof FarmError || error instanceof RanchError) {
      return Response.json({ ok: false, error: error instanceof FarmError ? error.code : error.message }, { status: 409 });
    }
    throw error;
  }
}
