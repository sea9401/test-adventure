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
  farmingLevelForXp,
  harvestPlot,
  normalizeFarmForDay,
  parseFarmState,
} from "@/adventure/v2/farm";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceFarmingMutation } from "@/lib/server/farmingActivityGuard";
import {
  ACTIVITY_GUARD_KEY,
  parseActivityGuardState,
  recordActivityCompletion,
  recordActivityStrongSignal,
} from "@/lib/server/activityGuard";
import {
  recordActivityVerificationRequiredSoon,
  recordBehaviorActivitySignalSoon,
  recordExtremeActivityAlertSoon,
  recordStrongActivitySignalSoon,
} from "@/lib/server/activityGuardServer";
import { recordLifeGatheringTelemetrySoon } from "@/lib/server/lifeGatheringTelemetry";
import { incrementGuildExplorationProgressForUser } from "@/lib/server/guildExplorationWeekly";
import { consumeGuildDiningEffect } from "@/lib/server/guildDining";
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
  const guarded = await enforceFarmingMutation(req, userId);
  if (guarded) return guarded;

  const body = (await req.json().catch(() => null)) as { plotId?: unknown } | null;
  const plotId = typeof body?.plotId === "string" ? body.plotId : "";
  if (!plotId) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const now = Date.now();
    const { farm, result, farmJobId, masteryGained, masteryAfter, guardUpdate } =
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
        const diningXp = await consumeGuildDiningEffect(
          tx,
          userId,
          "life_xp",
          harvested.result.farmingXpGained,
          new Date(now),
        );
        const farmingXp = harvested.result.farmingXp + diningXp.bonus;
        const farmingXpGained =
          harvested.result.farmingXpGained + diningXp.bonus;
        const harvestedState =
          diningXp.bonus > 0
            ? {
                ...harvested.state,
                stats: { ...harvested.state.stats, farmingXp },
              }
            : harvested.state;
        const harvestResult =
          diningXp.bonus > 0
            ? {
                ...harvested.result,
                farmingXp,
                farmingXpGained,
                farmingLevel: farmingLevelForXp(farmingXp),
              }
            : harvested.result;
        const guardUpdate = recordActivityCompletion(
          parseActivityGuardState(
            await lockSaveForUpdate(tx, userId, ACTIVITY_GUARD_KEY, {}),
          ),
          "farming",
          now,
        );
        await upsertSave(tx, userId, ACTIVITY_GUARD_KEY, guardUpdate.state);
        await upsertSave(tx, userId, FARM_SAVE_KEY, harvestedState);

        let masteryGained = 0;
        let masteryAfter: number | null = null;
        const playerClass = parseV2Class(charSave.class);
        const group = tier1ClassOf(playerClass);
        if (group !== "none" && isFarmingJobId(farmJobId ?? "")) {
          let prof = parseProficiencyForChar(
            await lockSaveForUpdate(tx, userId, "proficiency.v2", {}),
            charSave,
          );
          masteryGained = harvestResult.farmingXpGained;
          prof = addCumLevel(prof, group, masteryGained);
          prof = addJobCumLevel(prof, farmJobId ?? "", masteryGained);
          masteryAfter = prof.jobCumLevel?.[farmJobId ?? ""] ?? 0;
          await upsertSave(tx, userId, "proficiency.v2", prof);
        }

        await incrementGuildExplorationProgressForUser(
          tx,
          userId,
          "farmHarvests",
          1,
          new Date(now),
        );

        return {
          farm: harvestedState,
          result: harvestResult,
          farmJobId,
          masteryGained,
          masteryAfter,
          guardUpdate,
        };
      });
    if (guardUpdate.extremeVolumeAlert) {
      recordExtremeActivityAlertSoon({
        req,
        userId,
        activity: "farming",
        state: guardUpdate.state,
      });
    }
    if (guardUpdate.checkpointNewlyRequired) {
      recordActivityVerificationRequiredSoon({
        req,
        userId,
        activity: "farming",
        state: guardUpdate.state,
      });
    }
    if (guardUpdate.behaviorSignal) {
      recordBehaviorActivitySignalSoon({
        req,
        userId,
        activity: "farming",
        signal: guardUpdate.behaviorSignal,
        state: guardUpdate.state,
      });
    }
    recordLifeGatheringTelemetrySoon({
      userId,
      activity: "farming",
      sourceId: result.cropId,
      sourceName: result.itemName,
      grade: 1,
      success: true,
      failureRate: 0,
      xpGained: result.farmingXpGained,
      drops: [
        {
          materialId: result.itemId,
          materialName: result.itemName,
          quantity: result.quantity,
          primary: true,
        },
        ...(result.rareItemId && result.rareQuantity > 0
          ? [{
              materialId: result.rareItemId,
              materialName: result.rareItemName ?? result.rareItemId,
              quantity: result.rareQuantity,
              primary: false,
            }]
          : []),
      ],
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
      if (e.code === "not_ready") {
        const now = Date.now();
        const guardUpdate = await db.transaction(async (tx) => {
          const update = recordActivityStrongSignal(
            parseActivityGuardState(
              await lockSaveForUpdate(tx, userId, ACTIVITY_GUARD_KEY, {}),
            ),
            "farming",
            now,
          );
          await upsertSave(tx, userId, ACTIVITY_GUARD_KEY, update.state);
          return update;
        });
        recordStrongActivitySignalSoon({
          req,
          userId,
          activity: "farming",
          signal: "early_harvest",
          state: guardUpdate.state,
        });
        if (guardUpdate.checkpointNewlyRequired) {
          recordActivityVerificationRequiredSoon({
            req,
            userId,
            activity: "farming",
            state: guardUpdate.state,
          });
        }
      }
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
