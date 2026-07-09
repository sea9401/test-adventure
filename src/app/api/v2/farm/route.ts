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
import { parseV2Class } from "@/adventure/data/v2/classes";
import { V2_JOB_CATALOG, jobIdFromLegacy } from "@/adventure/data/v2/v2JobCatalog";

// GET /api/v2/farm — 모험가 농장 상태.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const [farmRaw, charSave] = await Promise.all([
    readSave(db, userId, FARM_SAVE_KEY, emptyFarmState(now)),
    readSave<Record<string, unknown>>(db, userId, "character.v2", {}),
  ]);
  const farm = normalizeFarmForDay(parseFarmState(farmRaw), now);
  const farmJobId = currentJobIdFromChar(charSave);
  return Response.json({
    ok: true,
    now,
    farm,
    farmJobId,
    farmJobName: farmJobId ? V2_JOB_CATALOG[farmJobId]?.name ?? farmJobId : null,
    crops: FARM_CROP_LIST,
    deliveries: getFarmDeliveryRequests(),
    specialDeliveries: getFarmSpecialDeliveryRequests(),
    weeklyDeliveries: getFarmWeeklyDeliveryRequests(),
    shopItems: getFarmShopItems(),
  });
}

function currentJobIdFromChar(charSave: Record<string, unknown>): string | null {
  const cls = parseV2Class(charSave.class);
  return jobIdFromLegacy(
    cls,
    typeof charSave.specChoice === "string" ? charSave.specChoice : null,
  );
}
