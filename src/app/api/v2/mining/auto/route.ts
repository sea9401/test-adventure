import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
  upsertSaves,
} from "@/lib/server/savesKv";
import {
  ACTIVITY_GUARD_KEY,
  parseActivityGuardState,
} from "@/lib/server/activityGuard";
import { activityVerificationGateResponse } from "@/lib/server/activityGuardServer";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import {
  MINING_MATERIALS,
  MINING_NODES,
  MINING_SPOTS,
  isMiningSpotId,
  rollMiningByproducts,
} from "@/adventure/data/v2/miningSpots";
import {
  MINING_LOG_KEY,
  isMiningNodeId,
  miningMaterialBalances,
  parseMiningLog,
  parseMiningLogWithLevelMigration,
  pickMiningNodeId,
} from "@/adventure/v2/miningSession";
import {
  miningDurationWithPassive,
  miningFailureRate,
  miningProgressionView,
  miningXpForLevel,
} from "@/adventure/v2/miningProgression";
import { applyLifeXpGain } from "@/adventure/v2/lifeLevelProgression";
import { miningPost50Bonuses } from "@/adventure/v2/lifeLevelBonuses";
import {
  MINING_AUTO_KEY,
  autoGatheringCompletedAttempts,
  beginAutoGathering,
  cancelAutoGathering,
  createAutoGatheringSession,
  isAutoGatheringPlanId,
  settleAutoGathering,
} from "@/adventure/v2/autoGathering";
import {
  activeAutoGatheringActivity,
  lockActiveManualLifeActivity,
  lockAutoGatheringStatesForUpdate,
} from "@/lib/server/lifeActivityLock";
import {
  equippedMiningBonuses,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { consumeGuildDiningEffect } from "@/lib/server/guildDining";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import {
  addCumLevel,
  addJobCumLevel,
  parseProficiencyForChar,
} from "@/adventure/data/v2/proficiency";
import { recordCodexMasteryGameplayBatch } from "@/lib/server/codexMasteryGameplay";
import {
  V2_JOB_CATALOG,
  isMiningJobId,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";
import { recordLifeGatheringTelemetrySoon } from "@/lib/server/lifeGatheringTelemetry";
import { MINING_SETTLE_MS } from "@/adventure/v2/miningAnimation";
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
    action: "v2:mining:auto",
    userLimit: 10,
    ipLimit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as
    | { action?: unknown; spotId?: unknown; planId?: unknown }
    | null;
  if (body?.action === "start") {
    if (typeof body.spotId !== "string" || !isMiningSpotId(body.spotId)) {
      return Response.json({ ok: false, error: "bad_spot" }, { status: 400 });
    }
    if (body.planId !== undefined && !isAutoGatheringPlanId(body.planId)) {
      return Response.json({ ok: false, error: "bad_plan" }, { status: 400 });
    }
    const now = Date.now();
    const [logRaw, skillsRaw, guardRaw, workshopRaw, lifeFeatures] = await Promise.all([
      readSave(db, userId, MINING_LOG_KEY, {}),
      readSave(db, userId, "skills.v2", {}),
      readSave(db, userId, ACTIVITY_GUARD_KEY, {}),
      readSave(db, userId, LIFE_WORKSHOP_SAVE_KEY, {}),
      readLifeFieldFeatureSettings(),
    ]);
    const verificationRequired = activityVerificationGateResponse(
      parseActivityGuardState(guardRaw),
      "mining",
    );
    if (verificationRequired) return verificationRequired;

    const nodeId = pickMiningNodeId(body.spotId);
    const node = MINING_NODES[nodeId];
    const parsedLog = parseMiningLog(logRaw);
    const progression = miningProgressionView(parsedLog.successes, parsedLog.xp);
    const levelBonuses = miningPost50Bonuses(progression.level);
    const bonuses = equippedMiningBonuses(parseV2SkillsState(skillsRaw).equipped);
    const workshop = parseLifeWorkshopState(workshopRaw);
    const toolTier = workshop.tools.mining;
    const activeAid = workshop.crafting.activeAids.mining;
    const aidSpec = activeAid?.enabled ? lifeAidSpec(activeAid.itemId) : null;
    const aidApplies = Boolean(aidSpec && node.grade >= aidSpec.gradeMin && node.grade <= aidSpec.gradeMax);
    const durationReductionPct =
      bonuses.durationReductionPct + LIFE_TOOL_DURATION_REDUCTION_PCT[toolTier];
    const bonusMaterialRate = Math.min(
      1,
      (bonuses.bonusOreChancePct +
        LIFE_TOOL_BONUS_MATERIAL_PCT[toolTier] +
        lifeGatheringBonusPct("mining", workshop, progression.level) +
        levelBonuses.bonusOreChancePct) /
        100,
    );
    const baseCycleDurationMs = miningDurationWithPassive(
      node.durationMs,
      progression.level,
      durationReductionPct,
    );
    const lifeEnvironment = lifeFeatures.environmentEnabled
      ? lifeFieldEnvironmentSnapshot("mining", body.spotId, now)
      : null;
    const cycleDurationMs = applyLifeFieldDurationReduction(
      node.durationMs,
      baseCycleDurationMs,
      lifeEnvironment?.environment.effect.durationReductionPct ?? 0,
    );
    const failureRate =
      miningFailureRate(node.baseFailureRate, progression.level) *
      (1 - bonuses.failureReductionPct / 100);
    const successRate = 1 - failureRate * (1 - bonuses.failureRecoveryPct / 100);
    const session = createAutoGatheringSession({
      sessionId: randomUUID(),
      sourceId: nodeId,
      sourceName: node.name,
      materialId: node.materialId,
      planId: body.planId,
      now,
      cycleDurationMs: cycleDurationMs + MINING_SETTLE_MS,
      successRate,
      bonusMaterialRate,
      baseXp: node.xp,
      aidItemId: aidApplies ? activeAid?.itemId : undefined,
      aidBonusMaterialRate: aidApplies ? (aidSpec?.bonusPct ?? 0) / 100 : 0,
      aidByproductMultiplier: aidApplies ? aidSpec?.byproductMultiplier ?? 1 : 1,
      spotId: body.spotId,
      lifeEnvironmentId: lifeEnvironment?.environment.id,
      lifeEnvironmentDayKey: lifeEnvironment?.dayKey,
      environmentPrimaryBonusChance:
        lifeEnvironment?.environment.effect.primaryBonusChance,
      environmentXpBonusPct: lifeEnvironment?.environment.effect.xpBonusPct,
      environmentByproductMultiplier:
        lifeEnvironment?.environment.effect.byproductMultiplier,
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
        MINING_AUTO_KEY,
        beginAutoGathering(autoStates.mining, session),
      );
      return { session };
    });
    if ("error" in startResult) {
      return Response.json({ ok: false, ...startResult }, { status: 409 });
    }
    return Response.json({
      ok: true,
      serverNow: Date.now(),
      autoSession: startResult.session,
      materialName: MINING_MATERIALS[node.materialId].name,
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
    const autoState = autoStates.mining;
    const session = autoState.session;
    if (!session) return { error: "no_session" as const };
    if (!canceling && now < session.readyAt) {
      return { error: "not_ready" as const, retryAfterMs: session.readyAt - now };
    }
    if (!isMiningNodeId(session.sourceId)) {
      await upsertSave(
        tx,
        userId,
        MINING_AUTO_KEY,
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
            environmentByproductMultiplier: 1,
          },
        };
    const settlement = settleAutoGathering(
      effectiveAutoState,
      canceling
        ? autoGatheringCompletedAttempts(session, now)
        : session.attempts,
    );
    if (!settlement) return { error: "no_session" as const };
    const node = MINING_NODES[session.sourceId];
    const spotId = session.spotId ?? Object.values(MINING_SPOTS).find(
      (spot) => spot.nodeId === session.sourceId,
    )?.id;
    const lifeEnvironmentId =
      session.lifeEnvironmentId ??
      (spotId
        ? lifeFieldEnvironmentSnapshot("mining", spotId, now).environment.id
        : "mining_exposed_vein");
    const lifeField = spotId
      ? await recordLifeFieldSuccessInTx(tx, userId, {
          activity: "mining",
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
    const parsedLog = parseMiningLogWithLevelMigration(
      await lockSaveForUpdate(tx, userId, MINING_LOG_KEY, {}),
    );
    const currentLog = parsedLog.log;
    const dirtySaves: Record<string, unknown> = {};
    const levelBonuses = miningPost50Bonuses(
      miningProgressionView(currentLog.successes, currentLog.xp).level,
    );
    let workshop = parseLifeWorkshopState(await lockSaveForUpdate(tx, userId, LIFE_WORKSHOP_SAVE_KEY, {}));
    let crafting = workshop.crafting;
    let aidSuccesses = 0;
    if (session.aidItemId) {
      const aidConsumption = consumeLifeAidUses(crafting, "mining", session.aidItemId, settlement.successes);
      aidSuccesses = aidConsumption.consumed;
      settlement.materialsGained += Math.floor(
        aidSuccesses * (session.aidBonusMaterialRate ?? 0),
      );
      crafting = aidConsumption.state;
    }
    const blueprint = rollHiddenBlueprint(crafting, "mining", settlement.successes);
    workshop = { ...workshop, crafting: blueprint.state };
    dirtySaves[LIFE_WORKSHOP_SAVE_KEY] = workshop;
    const byproductDrops: Record<string, number> = {};
    for (let index = 0; index < settlement.successes; index += 1) {
      for (const [materialId, amount] of Object.entries(
        rollMiningByproducts(
          node,
          Math.random,
          (index < aidSuccesses ? session.aidByproductMultiplier ?? 1 : 1) *
            (lifeFeatures.environmentEnabled
              ? session.environmentByproductMultiplier ?? 1
              : 1),
          levelBonuses,
        ),
      )) {
        byproductDrops[materialId] =
          (byproductDrops[materialId] ?? 0) + (amount ?? 0);
      }
    }
    const byproductTotal = Object.values(byproductDrops).reduce(
      (sum, amount) => sum + amount,
      0,
    );
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materials = mergeDrops(charSave.materials, {
      [node.materialId]: settlement.materialsGained,
      ...byproductDrops,
    });
    dirtySaves["character.v2"] = { ...charSave, materials };

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
    const appliedXp = applyLifeXpGain({
      xp: currentLog.xp,
      gainedXp: xpGained,
      legacyThreshold: miningXpForLevel,
    });
    const log = {
      ...currentLog,
      successes: currentLog.successes + settlement.successes,
      xp: appliedXp.xp,
      oreEarned: currentLog.oreEarned + settlement.materialsGained,
      byproductsEarned: currentLog.byproductsEarned + byproductTotal,
      nodes: {
        ...currentLog.nodes,
        [node.id]: (currentLog.nodes[node.id] ?? 0) + settlement.successes,
      },
    };
    dirtySaves[MINING_LOG_KEY] = log;

    const playerClass = parseV2Class(charSave.class);
    const group = tier1ClassOf(playerClass);
    const jobId = jobIdFromLegacy(
      playerClass,
      typeof charSave.specChoice === "string" ? charSave.specChoice : null,
    );
    let masteryGained = 0;
    let masteryAfter: number | null = null;
    if (group !== "none" && isMiningJobId(jobId)) {
      let proficiency = parseProficiencyForChar(
        await lockSaveForUpdate(tx, userId, "proficiency.v2", {}),
        charSave,
      );
      proficiency = addCumLevel(proficiency, group, settlement.masteryGained);
      proficiency = addJobCumLevel(proficiency, jobId, settlement.masteryGained);
      masteryGained = settlement.masteryGained;
      masteryAfter = proficiency.jobCumLevel?.[jobId] ?? 0;
      dirtySaves["proficiency.v2"] = proficiency;
      if (masteryGained > 0) {
        await recordCodexMasteryGameplayBatch(
          tx,
          userId,
          [{
            category: "job",
            entryId: jobId,
            amount: masteryGained,
            source: "job.activity",
          }],
          new Date(now),
        );
      }
    }
    dirtySaves[MINING_AUTO_KEY] = settlement.state;
    await upsertSaves(tx, userId, dirtySaves);
    return {
      settlement,
      node,
      materialName: MINING_MATERIALS[node.materialId].name,
      xpGained,
      environmentXpGained,
      masteryGained,
      masteryAfter,
      jobName: isMiningJobId(jobId) ? V2_JOB_CATALOG[jobId]?.name ?? jobId : null,
      materials: miningMaterialBalances(materials),
      byproducts: Object.entries(byproductDrops).map(([materialId, amount]) => ({
        materialId,
        name:
          MINING_MATERIALS[materialId as keyof typeof MINING_MATERIALS]?.name ??
          materialId,
        amount,
      })),
      log,
      canceled: canceling,
      activeAutoActivity: autoStates.woodcutting.session
        ? "woodcutting" as const
        : null,
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
      levelCurveMigrated: parsedLog.levelCurveMigrated,
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
      activity: "mining",
      sourceId: result.node.id,
      sourceName: result.node.name,
      grade: result.node.grade,
      success: true,
      failureRate: 1 - result.settlement.successes / result.settlement.attempts,
      xpGained: result.xpGained,
      drops: [
        {
          materialId: result.node.materialId,
          quantity: result.settlement.materialsGained,
          primary: true,
        },
        ...result.byproducts.map((drop) => ({
          materialId: drop.materialId,
          quantity: drop.amount,
          primary: false,
        })),
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
    byproducts: result.byproducts,
    xpGained: result.xpGained,
    environmentXpGained: result.environmentXpGained,
    discoveryRewardGained: result.discoveryRewardGained,
    discoveryRewardXp: result.discoveryRewardXp,
    lifeField: result.lifeField,
    masteryGained: result.masteryGained,
    masteryAfter: result.masteryAfter,
    jobName: result.jobName,
    materials: result.materials,
    log: result.log,
    autoSession: null,
    activeAutoActivity: result.activeAutoActivity,
    ...(result.levelCurveMigrated ? { levelCurveMigrated: true } : {}),
  });
}
