import { db } from "@/db";
import { lifeMajorBonusPct, lifeXpOverflow } from "@/adventure/v2/lifeMajor";
import {
  applyLifeMajorProgress,
  lifeMajorResponse,
  readLifeMajorState,
  withMasterProduct,
} from "@/lib/server/lifeMajor";
import { lifeFestivalBonus, lifeFestivalBonusXp } from "@/adventure/v2/lifeFestival";
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
  farmingLevelXpThreshold,
  harvestPlot,
  normalizeFarmForDay,
  parseFarmStateWithLevelMigration,
} from "@/adventure/v2/farm";
import { applyLifeXpGain } from "@/adventure/v2/lifeLevelProgression";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceFarmingRateLimit } from "@/lib/server/farmingRateLimit";
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
import { LIFE_WORKSHOP_SAVE_KEY, parseLifeWorkshopState } from "@/adventure/v2/lifeWorkshop";
import { rollHiddenBlueprint } from "@/adventure/v2/lifeCrafting";
import { insertFeedEntry } from "@/lib/server/serverFeed";
import { rolloverRepeatQuestsBeforeProgress } from "@/lib/server/v2QuestContext";
import { referralLifeTaskIds } from "@/adventure/data/v2/referralTutorial";
import { rewardReferralTutorialTasks } from "@/lib/server/referrals";
import { settleRanch } from "@/adventure/v2/ranch";
import { recordCodexMasteryGameplayBatch } from "@/lib/server/codexMasteryGameplay";

// POST /api/v2/farm/harvest — 다 자란 밭을 수확한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const guarded = enforceFarmingRateLimit(req, userId);
  if (guarded) return guarded;

  const body = (await req.json().catch(() => null)) as { plotId?: unknown } | null;
  const plotId = typeof body?.plotId === "string" ? body.plotId : "";
  if (!plotId) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const now = Date.now();
    const { lifeMajor, farm, result, farmJobId, masteryGained, masteryAfter, blueprintRecipeId, fertilizerBalance, levelCurveMigrated } =
      await db.transaction(async (tx) => {
        // 자정/주간 경계 뒤 첫 수확도 반복 퀘스트에 포함되도록, 농장 누적치를
        // 변경하기 전에 새 주기의 baseline 을 확정한다.
        await rolloverRepeatQuestsBeforeProgress(tx, userId, new Date(now));

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
        const parsedFarmResult = parseFarmStateWithLevelMigration(
          await lockSaveForUpdate(
            tx,
            userId,
            FARM_SAVE_KEY,
            emptyFarmState(now),
          ),
          now,
        );
        const parsedFarm = normalizeFarmForDay(
          parsedFarmResult.state,
          now,
        );
        const farm = {
          ...parsedFarm,
          ranch: settleRanch(parsedFarm.ranch, now),
        };
        const festival = lifeFestivalBonus("farming", new Date(now));
        const majorBonusPct = lifeMajorBonusPct(
          await readLifeMajorState(tx, userId),
          "farming",
        );
        const harvested = harvestPlot(farm, plotId, now, Math.random, {
          ...farmBonuses,
          yieldBonusPct: farmBonuses.yieldBonusPct + festival.chancePct + majorBonusPct,
        });
        const festivalXp = lifeFestivalBonusXp(
          harvested.result.farmingXpGained,
          festival.xpPct,
        );
        const diningXp = await consumeGuildDiningEffect(
          tx,
          userId,
          "life_xp",
          harvested.result.farmingXpGained,
          new Date(now),
        );
        const farmingXp = applyLifeXpGain({
          xp: harvested.result.farmingXp,
          gainedXp: diningXp.bonus + festivalXp,
          legacyThreshold: farmingLevelXpThreshold,
        }).xp;
        const farmingXpGained =
          harvested.result.farmingXpGained + diningXp.bonus + festivalXp;
        const harvestedState =
          diningXp.bonus + festivalXp > 0
            ? {
                ...harvested.state,
                stats: { ...harvested.state.stats, farmingXp },
              }
            : harvested.state;
        const harvestResult =
          diningXp.bonus + festivalXp > 0
            ? {
                ...harvested.result,
                farmingXp,
                farmingXpGained,
                farmingLevel: farmingLevelForXp(farmingXp),
              }
            : harvested.result;
        await upsertSave(tx, userId, FARM_SAVE_KEY, harvestedState);
        await rewardReferralTutorialTasks(
          tx,
          userId,
          "새 모험가",
          referralLifeTaskIds(harvestResult.farmingLevel),
        );

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
          if (masteryGained > 0) {
            await recordCodexMasteryGameplayBatch(
              tx,
              userId,
              [{
                category: "job",
                entryId: farmJobId ?? "",
                amount: masteryGained,
                source: "job.activity",
              }],
              new Date(now),
            );
          }
        }

        await incrementGuildExplorationProgressForUser(
          tx,
          userId,
          "farmHarvests",
          1,
          new Date(now),
        );
        let workshop = parseLifeWorkshopState(await lockSaveForUpdate(tx, userId, LIFE_WORKSHOP_SAVE_KEY, {}));
        const blueprint = rollHiddenBlueprint(workshop.crafting, "farming");
        workshop = { ...workshop, crafting: blueprint.state };
        await upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, workshop);

        // 생활 전공 — 다른 세이브 잠금 뒤에 life-major.v1 을 잠근다. 이 라우트는
        // character.v2 를 잠그기만 하므로 산물이 있을 때만 그 사본에 합쳐 저장한다.
        const lifeMajorProgress = await applyLifeMajorProgress(tx, userId, "farming", {
          overflowXp: lifeXpOverflow({
            gained: harvestResult.farmingXpGained,
            before: farm.stats.farmingXp,
            after: harvestedState.stats.farmingXp,
          }),
          successes: 1,
          rng: Math.random,
        });
        if (lifeMajorProgress.productCount > 0) {
          await upsertSave(tx, userId, "character.v2", {
            ...charSave,
            materials: withMasterProduct(charSave.materials, lifeMajorProgress),
          });
        }

        return {
          lifeMajor: lifeMajorResponse(lifeMajorProgress),
          farm: harvestedState,
          result: harvestResult,
          farmJobId,
          masteryGained,
          masteryAfter,
          blueprintRecipeId: blueprint.recipe?.id ?? null,
          fertilizerBalance: workshop.crafting.balances.organic_fertilizer ?? 0,
          levelCurveMigrated: parsedFarmResult.levelCurveMigrated,
        };
      });
    if (blueprintRecipeId) await insertFeedEntry(userId, "life_blueprint", { recipeId: blueprintRecipeId });
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
      lifeMajor,
      fertilizerBalance,
      ...(levelCurveMigrated ? { levelCurveMigrated: true } : {}),
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
