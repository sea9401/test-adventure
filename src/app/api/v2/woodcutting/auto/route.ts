import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import {
  ACTIVITY_GUARD_KEY,
  parseActivityGuardState,
} from "@/lib/server/activityGuard";
import { activityVerificationGateResponse } from "@/lib/server/activityGuardServer";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import {
  WOODCUTTING_MATERIALS,
  WOODCUTTING_SPOTS,
  WOODCUTTING_TREES,
  isWoodcuttingSpotId,
} from "@/adventure/data/v2/woodcuttingSpots";
import {
  WOODCUTTING_LOG_KEY,
  isWoodcuttingTreeId,
  parseWoodcuttingLog,
  pickWoodcuttingTreeId,
  woodcuttingMaterialBalances,
} from "@/adventure/v2/woodcuttingSession";
import {
  woodcuttingDurationWithPassive,
  woodcuttingFailureRate,
  woodcuttingProgressionView,
} from "@/adventure/v2/woodcuttingProgression";
import {
  autoGatheringCompletedAttempts,
  beginAutoGathering,
  cancelAutoGathering,
  createAutoGatheringSession,
  isAutoGatheringPlanId,
  settleAutoGathering,
  WOODCUTTING_AUTO_KEY,
} from "@/adventure/v2/autoGathering";
import {
  activeAutoGatheringActivity,
  lockActiveManualLifeActivity,
  lockAutoGatheringStatesForUpdate,
} from "@/lib/server/lifeActivityLock";
import {
  equippedWoodcuttingBonuses,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { consumeGuildDiningEffect } from "@/lib/server/guildDining";
import {
  FARM_SAVE_KEY,
  emptyFarmState,
  grantFarmSeeds,
  parseFarmState,
} from "@/adventure/v2/farm";
import { rollWoodcuttingSeedDrop } from "@/adventure/v2/woodcuttingSeedDrops";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import {
  addCumLevel,
  addJobCumLevel,
  parseProficiencyForChar,
} from "@/adventure/data/v2/proficiency";
import {
  V2_JOB_CATALOG,
  isWoodcuttingJobId,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";
import { incrementGuildExplorationProgressForUser } from "@/lib/server/guildExplorationWeekly";
import { recordLifeGatheringTelemetrySoon } from "@/lib/server/lifeGatheringTelemetry";
import { WOODCUTTING_TREE_FALL_MS } from "@/adventure/v2/woodcuttingAnimation";
import {
  LIFE_TOOL_BONUS_MATERIAL_PCT,
  LIFE_TOOL_DURATION_REDUCTION_PCT,
  LIFE_WORKSHOP_SAVE_KEY,
  lifeGatheringBonusPct,
  parseLifeWorkshopState,
} from "@/adventure/v2/lifeWorkshop";
import { consumeLifeAidUses, lifeAidSpec, rollHiddenBlueprint } from "@/adventure/v2/lifeCrafting";
import { insertFeedEntry } from "@/lib/server/serverFeed";
import {
  applyLifeFieldDurationReduction,
  lifeFieldEnvironmentSnapshot,
} from "@/adventure/data/v2/lifeFieldEnvironment";
import {
  LIFE_FIELD_DISCOVERIES,
  lifeFieldDiscoveryReward,
} from "@/adventure/v2/lifeFieldRecords";
import { recordLifeFieldSuccessInTx } from "@/lib/server/lifeFieldProgress";
import { readLifeFieldFeatureSettings } from "@/lib/server/opsSettings";

type CharSave = {
  class?: unknown;
  specChoice?: unknown;
  materials?: unknown;
  [key: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:woodcutting:auto",
    userLimit: 10,
    ipLimit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as
    | { action?: unknown; spotId?: unknown; planId?: unknown }
    | null;
  if (body?.action === "start") {
    if (typeof body.spotId !== "string" || !isWoodcuttingSpotId(body.spotId)) {
      return Response.json({ ok: false, error: "bad_spot" }, { status: 400 });
    }
    if (body.planId !== undefined && !isAutoGatheringPlanId(body.planId)) {
      return Response.json({ ok: false, error: "bad_plan" }, { status: 400 });
    }
    const now = Date.now();
    const [logRaw, skillsRaw, guardRaw, workshopRaw, lifeFeatures] = await Promise.all([
      readSave(db, userId, WOODCUTTING_LOG_KEY, {}),
      readSave(db, userId, "skills.v2", {}),
      readSave(db, userId, ACTIVITY_GUARD_KEY, {}),
      readSave(db, userId, LIFE_WORKSHOP_SAVE_KEY, {}),
      readLifeFieldFeatureSettings(),
    ]);
    const verificationRequired = activityVerificationGateResponse(
      parseActivityGuardState(guardRaw),
      "woodcutting",
    );
    if (verificationRequired) return verificationRequired;

    const spotId = body.spotId;
    const treeId = pickWoodcuttingTreeId(spotId);
    const tree = WOODCUTTING_TREES[treeId];
    const progression = woodcuttingProgressionView(
      parseWoodcuttingLog(logRaw).cuts,
      parseWoodcuttingLog(logRaw).xp,
    );
    const bonuses = equippedWoodcuttingBonuses(
      parseV2SkillsState(skillsRaw).equipped,
    );
    const workshop = parseLifeWorkshopState(workshopRaw);
    const toolTier = workshop.tools.woodcutting;
    const activeAid = workshop.crafting.activeAids.woodcutting;
    const aidSpec = activeAid?.enabled ? lifeAidSpec(activeAid.itemId) : null;
    const aidApplies = Boolean(aidSpec && tree.grade >= aidSpec.gradeMin && tree.grade <= aidSpec.gradeMax);
    const durationReductionPct =
      bonuses.durationReductionPct + LIFE_TOOL_DURATION_REDUCTION_PCT[toolTier];
    const bonusMaterialRate = Math.min(
      1,
      (bonuses.bonusLogChancePct +
        LIFE_TOOL_BONUS_MATERIAL_PCT[toolTier] +
        lifeGatheringBonusPct("woodcutting", workshop, progression.level)) /
        100,
    );
    const baseCycleDurationMs = woodcuttingDurationWithPassive(
      tree.durationMs,
      progression.level,
      durationReductionPct,
    );
    const lifeEnvironment = lifeFeatures.environmentEnabled
      ? lifeFieldEnvironmentSnapshot("woodcutting", spotId, now)
      : null;
    const cycleDurationMs = applyLifeFieldDurationReduction(
      tree.durationMs,
      baseCycleDurationMs,
      lifeEnvironment?.environment.effect.durationReductionPct ?? 0,
    );
    const failureRate =
      woodcuttingFailureRate(tree.baseFailureRate, progression.level) *
      (1 - bonuses.failureReductionPct / 100);
    const successRate = 1 - failureRate * (1 - bonuses.failureRecoveryPct / 100);
    const session = createAutoGatheringSession({
      sessionId: randomUUID(),
      sourceId: treeId,
      sourceName: tree.name,
      materialId: tree.materialId,
      planId: body.planId,
      now,
      cycleDurationMs: cycleDurationMs + WOODCUTTING_TREE_FALL_MS,
      successRate,
      bonusMaterialRate,
      baseXp: tree.xp,
      aidItemId: aidApplies ? activeAid?.itemId : undefined,
      aidBonusMaterialRate: aidApplies ? (aidSpec?.bonusPct ?? 0) / 100 : 0,
      spotId,
      lifeEnvironmentId: lifeEnvironment?.environment.id,
      lifeEnvironmentDayKey: lifeEnvironment?.dayKey,
      environmentPrimaryBonusChance:
        lifeEnvironment?.environment.effect.primaryBonusChance,
      environmentXpBonusPct: lifeEnvironment?.environment.effect.xpBonusPct,
    });
    const startResult = await db.transaction(async (tx) => {
      const autoStates = await lockAutoGatheringStatesForUpdate(tx, userId);
      const activeAutoActivity = activeAutoGatheringActivity(autoStates);
      if (activeAutoActivity) {
        return { error: "auto_active" as const, activeAutoActivity };
      }
      const activeManualActivity = await lockActiveManualLifeActivity(
        tx,
        userId,
        now,
      );
      if (activeManualActivity) {
        return { error: "manual_active" as const, activeManualActivity };
      }
      await upsertSave(
        tx,
        userId,
        WOODCUTTING_AUTO_KEY,
        beginAutoGathering(autoStates.woodcutting, session),
      );
      return { session };
    });
    if ("error" in startResult) {
      return Response.json({ ok: false, ...startResult }, { status: 409 });
    }
    return Response.json({
      ok: true,
      autoSession: startResult.session,
      materialName: WOODCUTTING_MATERIALS[tree.materialId].name,
      lifeEnvironment,
    });
  }

  const canceling = body?.action === "cancel";
  if (!canceling && body?.action !== "claim") {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const now = Date.now();
  const result = await db.transaction(async (tx) => {
    const autoStates = await lockAutoGatheringStatesForUpdate(tx, userId);
    const autoState = autoStates.woodcutting;
    const session = autoState.session;
    if (!session) return { error: "no_session" as const };
    if (!canceling && now < session.readyAt) {
      return { error: "not_ready" as const, retryAfterMs: session.readyAt - now };
    }
    if (!isWoodcuttingTreeId(session.sourceId)) {
      await upsertSave(
        tx,
        userId,
        WOODCUTTING_AUTO_KEY,
        cancelAutoGathering(autoState),
      );
      return { error: "invalid_session" as const };
    }
    const lifeFeatures = await readLifeFieldFeatureSettings(tx);
    const effectiveAutoState = lifeFeatures.environmentEnabled
      ? autoState
      : {
          ...autoState,
          session: {
            ...session,
            environmentPrimaryBonusChance: 0,
            environmentXpBonusPct: 0,
          },
        };
    const settlement = settleAutoGathering(
      effectiveAutoState,
      canceling
        ? autoGatheringCompletedAttempts(session, now)
        : session.attempts,
    );
    if (!settlement) return { error: "no_session" as const };
    const tree = WOODCUTTING_TREES[session.sourceId];
    const spotId = session.spotId ?? Object.values(WOODCUTTING_SPOTS).find(
      (spot) => spot.treeId === session.sourceId,
    )?.id;
    const lifeEnvironmentId =
      session.lifeEnvironmentId ??
      (spotId
        ? lifeFieldEnvironmentSnapshot("woodcutting", spotId, now).environment.id
        : "woodcutting_dense_growth");
    const lifeField = spotId
      ? await recordLifeFieldSuccessInTx(tx, userId, {
          activity: "woodcutting",
          sourceId: spotId,
          environmentId: lifeEnvironmentId,
          sessionId: session.sessionId,
          successes: settlement.successes,
          now,
          features: lifeFeatures,
        })
      : null;
    const completedDiscovery = lifeField?.completedTrace
      ? LIFE_FIELD_DISCOVERIES[lifeField.completedTrace.discoveryId]
      : null;
    const discoveryReward =
      completedDiscovery && lifeFeatures.discoveryRewardsEnabled
        ? lifeFieldDiscoveryReward(completedDiscovery.rare)
        : null;
    const discoveryRewardGained = discoveryReward?.resource ?? 0;
    const discoveryRewardXp = discoveryReward?.xp ?? 0;
    settlement.materialsGained += discoveryRewardGained;
    settlement.xpGained += discoveryRewardXp;
    let workshop = parseLifeWorkshopState(await lockSaveForUpdate(tx, userId, LIFE_WORKSHOP_SAVE_KEY, {}));
    let crafting = workshop.crafting;
    let aidSuccesses = 0;
    if (session.aidItemId) {
      const aidConsumption = consumeLifeAidUses(crafting, "woodcutting", session.aidItemId, settlement.successes);
      aidSuccesses = aidConsumption.consumed;
      settlement.materialsGained += Math.floor(aidSuccesses * (session.aidBonusMaterialRate ?? 0) * session.materialEfficiency);
      crafting = aidConsumption.state;
    }
    const blueprint = rollHiddenBlueprint(crafting, "woodcutting", settlement.successes);
    workshop = { ...workshop, crafting: blueprint.state };
    await upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, workshop);
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materials = mergeDrops(charSave.materials, {
      [tree.materialId]: settlement.materialsGained,
    });
    await upsertSave(tx, userId, "character.v2", { ...charSave, materials });

    const environmentXpGained = lifeFeatures.environmentEnabled
      ? Math.floor(
          settlement.successes *
            session.baseXp *
            session.xpEfficiency *
            ((session.environmentXpBonusPct ?? 0) / 100),
        )
      : 0;
    const diningXp = await consumeGuildDiningEffect(
      tx,
      userId,
      "life_xp",
      Math.max(
        0,
        settlement.xpGained - environmentXpGained - discoveryRewardXp,
      ),
      new Date(now),
    );
    const xpGained = settlement.xpGained + diningXp.bonus;
    const currentLog = parseWoodcuttingLog(
      await lockSaveForUpdate(tx, userId, WOODCUTTING_LOG_KEY, {}),
    );
    const log = {
      ...currentLog,
      cuts: currentLog.cuts + settlement.successes,
      xp: currentLog.xp + xpGained,
      timberEarned: currentLog.timberEarned + settlement.materialsGained,
      trees: {
        ...currentLog.trees,
        [tree.id]: (currentLog.trees[tree.id] ?? 0) + settlement.successes,
      },
    };
    await upsertSave(tx, userId, WOODCUTTING_LOG_KEY, log);

    const seedDrops: Record<string, number> = {};
    const seedRolls = Math.floor(
      settlement.successes * session.materialEfficiency + 1e-9,
    );
    for (let index = 0; index < seedRolls; index += 1) {
      const drop = rollWoodcuttingSeedDrop();
      if (drop) seedDrops[drop.cropId] = (seedDrops[drop.cropId] ?? 0) + drop.quantity;
    }
    if (Object.keys(seedDrops).length > 0) {
      const farm = parseFarmState(
        await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now)),
      );
      await upsertSave(tx, userId, FARM_SAVE_KEY, grantFarmSeeds(farm, seedDrops));
    }

    const playerClass = parseV2Class(charSave.class);
    const group = tier1ClassOf(playerClass);
    const jobId = jobIdFromLegacy(
      playerClass,
      typeof charSave.specChoice === "string" ? charSave.specChoice : null,
    );
    let masteryGained = 0;
    let masteryAfter: number | null = null;
    if (group !== "none" && isWoodcuttingJobId(jobId)) {
      let proficiency = parseProficiencyForChar(
        await lockSaveForUpdate(tx, userId, "proficiency.v2", {}),
        charSave,
      );
      proficiency = addCumLevel(proficiency, group, settlement.masteryGained);
      proficiency = addJobCumLevel(proficiency, jobId, settlement.masteryGained);
      masteryGained = settlement.masteryGained;
      masteryAfter = proficiency.jobCumLevel?.[jobId] ?? 0;
      await upsertSave(tx, userId, "proficiency.v2", proficiency);
    }
    await incrementGuildExplorationProgressForUser(
      tx,
      userId,
      "woodcuttingSuccesses",
      settlement.masteryGained,
      new Date(now),
    );
    await upsertSave(tx, userId, WOODCUTTING_AUTO_KEY, settlement.state);
    return {
      settlement,
      tree,
      materialName: WOODCUTTING_MATERIALS[tree.materialId].name,
      xpGained,
      environmentXpGained,
      masteryGained,
      masteryAfter,
      jobName: isWoodcuttingJobId(jobId)
        ? V2_JOB_CATALOG[jobId]?.name ?? jobId
        : null,
      seedDrops,
      materials: woodcuttingMaterialBalances(materials),
      log,
      canceled: canceling,
      activeAutoActivity: autoStates.mining.session ? "mining" as const : null,
      blueprintRecipeId: blueprint.recipe?.id ?? null,
      discoveryRewardGained,
      discoveryRewardXp,
      lifeField: lifeField
        ? {
            newRecordIds: lifeField.newRecordIds,
            foundTrace: lifeField.foundTrace,
            completedTrace: lifeField.completedTrace,
          }
        : null,
      lifeFieldFeedEnabled: lifeFeatures.feedEnabled,
    };
  });

  if ("error" in result) {
    const status = result.error === "not_ready" ? 409 : 404;
    return Response.json({ ok: false, ...result }, { status });
  }
  if (result.blueprintRecipeId) await insertFeedEntry(userId, "life_blueprint", { recipeId: result.blueprintRecipeId });
  if (
    result.lifeFieldFeedEnabled &&
    result.lifeField?.completedTrace &&
    LIFE_FIELD_DISCOVERIES[result.lifeField.completedTrace.discoveryId].rare
  ) {
    await insertFeedEntry(userId, "life_discovery", {
      discoveryId: result.lifeField.completedTrace.discoveryId,
    });
  }
  if (result.settlement.attempts > 0) {
    recordLifeGatheringTelemetrySoon({
      userId,
      activity: "woodcutting",
      sourceId: result.tree.id,
      sourceName: result.tree.name,
      grade: result.tree.grade,
      success: true,
      failureRate: 1 - result.settlement.successes / result.settlement.attempts,
      xpGained: result.xpGained,
      drops: [
        {
          materialId: result.tree.materialId,
          quantity: result.settlement.materialsGained,
          primary: true,
        },
      ],
    });
  }
  return Response.json({
    ok: true,
    canceled: result.canceled,
    attempts: result.settlement.attempts,
    successes: result.settlement.successes,
    materialName: result.materialName,
    materialsGained: result.settlement.materialsGained,
    xpGained: result.xpGained,
    environmentXpGained: result.environmentXpGained,
    discoveryRewardGained: result.discoveryRewardGained,
    discoveryRewardXp: result.discoveryRewardXp,
    lifeField: result.lifeField,
    masteryGained: result.masteryGained,
    masteryAfter: result.masteryAfter,
    jobName: result.jobName,
    seedDrops: result.seedDrops,
    materials: result.materials,
    log: result.log,
    autoSession: null,
    activeAutoActivity: result.activeAutoActivity,
  });
}
