import { db } from "@/db";
import {
  FARM_CROP_LIST,
  FARM_SAVE_KEY,
  FarmError,
  emptyFarmState,
  getFarmDeliveryRequests,
  getFarmShopItems,
  getFarmSpecialDeliveryRequests,
  getFarmWeeklyDeliveryRequests,
  harvestPlot,
  normalizeFarmForDay,
  parseFarmState,
} from "@/adventure/v2/farm";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import {
  addCumLevel,
  addJobCumLevel,
  parseProficiencyForChar,
} from "@/adventure/data/v2/proficiency";
import {
  V2_JOB_CATALOG,
  isFarmingJobId,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  emptyV2SkillsState,
  equippedFarmBonuses,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";

// POST /api/v2/farm/harvest — 다 자란 밭을 수확한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { plotId?: unknown } | null;
  const plotId = typeof body?.plotId === "string" ? body.plotId : "";
  if (!plotId) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const now = Date.now();
    const { farm, result, farmJobId, masteryGained, masteryAfter } =
      await db.transaction(async (tx) => {
        const charSave = await lockSaveForUpdate<Record<string, unknown>>(
          tx,
          userId,
          "character.v2",
          {},
        );
        const farmJobId = currentJobIdFromChar(charSave);
        const skills = parseV2SkillsState(
          await lockSaveForUpdate(tx, userId, "skills.v2", emptyV2SkillsState()),
        );
        const farmBonuses = equippedFarmBonuses(skills.equipped);
        const farm = normalizeFarmForDay(
          parseFarmState(
            await lockSaveForUpdate(
              tx,
              userId,
              FARM_SAVE_KEY,
              emptyFarmState(now),
            ),
          ),
          now,
        );
        const harvested = harvestPlot(
          farm,
          plotId,
          now,
          Math.random,
          farmBonuses,
        );
        await upsertSave(tx, userId, FARM_SAVE_KEY, harvested.state);

        let masteryGained = 0;
        let masteryAfter: number | null = null;
        const playerClass = parseV2Class(charSave.class);
        const group = tier1ClassOf(playerClass);
        if (group !== "none" && isFarmingJobId(farmJobId ?? "")) {
          let prof = parseProficiencyForChar(
            await lockSaveForUpdate(tx, userId, "proficiency.v2", {}),
            charSave,
          );
          masteryGained = harvested.result.farmingXpGained;
          prof = addCumLevel(prof, group, masteryGained);
          prof = addJobCumLevel(prof, farmJobId ?? "", masteryGained);
          masteryAfter = prof.jobCumLevel?.[farmJobId ?? ""] ?? 0;
          await upsertSave(tx, userId, "proficiency.v2", prof);
        }

        return {
          farm: harvested.state,
          result: harvested.result,
          farmJobId,
          masteryGained,
          masteryAfter,
        };
      });
    return Response.json({
      ok: true,
      now,
      farm,
      farmJobId,
      farmJobName: farmJobId
        ? V2_JOB_CATALOG[farmJobId]?.name ?? farmJobId
        : null,
      masteryGained,
      masteryAfter,
      crops: FARM_CROP_LIST,
      deliveries: getFarmDeliveryRequests(),
      specialDeliveries: getFarmSpecialDeliveryRequests(),
      weeklyDeliveries: getFarmWeeklyDeliveryRequests(),
      shopItems: getFarmShopItems(),
      result,
    });
  } catch (e) {
    if (e instanceof FarmError) {
      return Response.json({ ok: false, error: e.code }, { status: 409 });
    }
    throw e;
  }
}

function currentJobIdFromChar(charSave: Record<string, unknown>): string | null {
  const cls = parseV2Class(charSave.class);
  return jobIdFromLegacy(
    cls,
    typeof charSave.specChoice === "string" ? charSave.specChoice : null,
  );
}
