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
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave } from "@/lib/server/savesKv";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { LIFE_WORKSHOP_SAVE_KEY, parseLifeWorkshopState } from "@/adventure/v2/lifeWorkshop";

// GET /api/v2/farm — 모험가 농장 상태.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const [farmRaw, skillsRaw, workshopRaw] = await Promise.all([
    readSave(db, userId, FARM_SAVE_KEY, emptyFarmState(now)),
    readSave(db, userId, "skills.v2", emptyV2SkillsState()),
    readSave(db, userId, LIFE_WORKSHOP_SAVE_KEY, {}),
  ]);
  const farm = normalizeFarmForDay(parseFarmState(farmRaw), now);
  const skills = parseV2SkillsState(skillsRaw);
  const workshop = parseLifeWorkshopState(workshopRaw);
  return Response.json({
    ok: true,
    now,
    farm,
    learnedSkillIds: skills.learned,
    crops: FARM_CROP_LIST,
    deliveries: getFarmDeliveryRequests(),
    specialDeliveries: getFarmSpecialDeliveryRequests(),
    weeklyDeliveries: getFarmWeeklyDeliveryRequests(),
    shopItems: getFarmShopItems(),
    fertilizerBalance: workshop.crafting.balances.organic_fertilizer ?? 0,
  });
}
