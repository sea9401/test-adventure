import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  ACTIVITY_GUARD_KEY,
  activityGuardView,
  parseActivityGuardState,
  recordActivityCompletion,
  recordActivityEarlyAttempt,
} from "@/lib/server/activityGuard";
import {
  recordActivityVerificationRequiredSoon,
  recordBehaviorActivitySignalSoon,
  recordExtremeActivityAlertSoon,
  recordStrongActivitySignalSoon,
} from "@/lib/server/activityGuardServer";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import { SETTLEMENT_MATERIAL_ID } from "@/adventure/data/v2/settlementMaterials";
import { WOODCUTTING_MATERIALS } from "@/adventure/data/v2/woodcuttingSpots";
import { incrementGuildExplorationProgressForUser } from "@/lib/server/guildExplorationWeekly";
import {
  WOODCUTTING_LOG_KEY,
  WOODCUTTING_SESSION_KEY,
  WOODCUTTING_MATERIAL_REWARD,
  WOODCUTTING_TREES,
  parseWoodcuttingLogWithLevelMigration,
  parseWoodcuttingSession,
  recordWoodcuttingSuccess,
  woodcuttingAttemptSucceeds,
  woodcuttingMaterialBalances,
} from "@/adventure/v2/woodcuttingSession";
import {
  woodcuttingFailureRate,
  woodcuttingProgressionView,
} from "@/adventure/v2/woodcuttingProgression";
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
import { recordLifeGatheringTelemetrySoon } from "@/lib/server/lifeGatheringTelemetry";
import {
  activeAutoGatheringActivity,
  lockAutoGatheringStatesForUpdate,
} from "@/lib/server/lifeActivityLock";
import { consumeGuildDiningEffect } from "@/lib/server/guildDining";
import {
  FARM_SAVE_KEY,
  emptyFarmState,
  grantFarmSeeds,
  parseFarmState,
} from "@/adventure/v2/farm";
import { rollWoodcuttingSeedDrop } from "@/adventure/v2/woodcuttingSeedDrops";
import { woodcuttingPost50Bonuses } from "@/adventure/v2/lifeLevelBonuses";
import { LIFE_WORKSHOP_SAVE_KEY, parseLifeWorkshopState } from "@/adventure/v2/lifeWorkshop";
import { consumeLifeAidUses, rollHiddenBlueprint } from "@/adventure/v2/lifeCrafting";
import { insertFeedEntry } from "@/lib/server/serverFeed";
import {
  LIFE_FIELD_DISCOVERIES,
  lifeFieldDiscoveryReward,
} from "@/adventure/v2/lifeFieldRecords";
import {
  LIFE_FIELD_ENVIRONMENTS,
  lifeFieldEnvironmentSnapshot,
  lifeFieldXpBonus,
} from "@/adventure/data/v2/lifeFieldEnvironment";
import {
  lifeFieldSessionRoll,
  recordLifeFieldSuccessInTx,
} from "@/lib/server/lifeFieldProgress";
import { readLifeFieldFeatureSettings } from "@/lib/server/opsSettings";
import { referralLifeTaskIds } from "@/adventure/data/v2/referralTutorial";
import { rewardReferralTutorialTasks } from "@/lib/server/referrals";

type CharSave = {
  class?: unknown;
  level?: unknown;
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
    action: "v2:woodcutting:chop",
    userLimit: 20,
    ipLimit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const sessionId = (body as { sessionId?: unknown } | null)?.sessionId;
  if (typeof sessionId !== "string") {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const now = Date.now();
  const result = await db.transaction(async (tx) => {
    const autoStates = await lockAutoGatheringStatesForUpdate(tx, userId);
    const activeAutoActivity = activeAutoGatheringActivity(autoStates);
    if (activeAutoActivity) {
      return {
        success: false as const,
        reason: "auto_active" as const,
        activeAutoActivity,
      };
    }
    const session = parseWoodcuttingSession(
      await lockSaveForUpdate(tx, userId, WOODCUTTING_SESSION_KEY, {}),
    );
    if (!session) return { success: false as const, reason: "no_session" as const };
    if (session.sessionId !== sessionId) {
      return { success: false as const, reason: "stale" as const };
    }
    if (now < session.readyAt) {
      const retryAfterMs = session.readyAt - now;
      if (retryAfterMs >= 250) {
        const guardUpdate = recordActivityEarlyAttempt(
          parseActivityGuardState(
            await lockSaveForUpdate(tx, userId, ACTIVITY_GUARD_KEY, {}),
          ),
          "woodcutting",
          now,
        );
        await upsertSave(tx, userId, ACTIVITY_GUARD_KEY, guardUpdate.state);
        return {
          success: false as const,
          reason: "not_ready" as const,
          retryAfterMs,
          guardStrongSignal: guardUpdate.strongSignalPromoted
            ? "repeated_early_finish" as const
            : null,
          guardState: guardUpdate.state,
          guardCheckpointNewlyRequired: guardUpdate.checkpointNewlyRequired,
        };
      }
      return {
        success: false as const,
        reason: "not_ready" as const,
        retryAfterMs,
      };
    }
    if (now > session.expiresAt) {
      await upsertSave(tx, userId, WOODCUTTING_SESSION_KEY, {});
      return { success: false as const, reason: "expired" as const };
    }

    await upsertSave(tx, userId, WOODCUTTING_SESSION_KEY, {});
    const guardUpdate = recordActivityCompletion(
      parseActivityGuardState(
        await lockSaveForUpdate(tx, userId, ACTIVITY_GUARD_KEY, {}),
      ),
      "woodcutting",
      now,
    );
    await upsertSave(tx, userId, ACTIVITY_GUARD_KEY, guardUpdate.state);
    const nextActionAt = activityGuardView(
      guardUpdate.state,
      "woodcutting",
    ).nextActionAt;
    const tree = WOODCUTTING_TREES[session.treeId];
    const logRaw = await lockSaveForUpdate(tx, userId, WOODCUTTING_LOG_KEY, {});
    const parsedLog = parseWoodcuttingLogWithLevelMigration(logRaw);
    const currentLog = parsedLog.log;
    const progression = woodcuttingProgressionView(currentLog.cuts, currentLog.xp);
    const levelBonuses = woodcuttingPost50Bonuses(progression.level);
    const failureRate =
      session.failureRate ??
      woodcuttingFailureRate(tree.baseFailureRate, progression.level);
    const initiallySucceeded = woodcuttingAttemptSucceeds(failureRate);
    const recovered =
      !initiallySucceeded &&
      (session.failureRecoveryRate ?? 0) > 0 &&
      Math.random() < (session.failureRecoveryRate ?? 0);
    if (!initiallySucceeded && !recovered) {
      return {
        success: false as const,
        reason: "failed" as const,
        tree,
        failureRate,
        guardState: guardUpdate.state,
        guardExtremeVolumeAlert: guardUpdate.extremeVolumeAlert,
        guardCheckpointNewlyRequired: guardUpdate.checkpointNewlyRequired,
        guardBehaviorSignal: guardUpdate.behaviorSignal,
        nextActionAt,
      };
    }

    const lifeFeatures = await readLifeFieldFeatureSettings(tx);
    const lifeEnvironmentId =
      session.lifeEnvironmentId ??
      lifeFieldEnvironmentSnapshot("woodcutting", session.spotId, now)
        .environment.id;
    const lifeEnvironment = LIFE_FIELD_ENVIRONMENTS[lifeEnvironmentId];
    const lifeField = await recordLifeFieldSuccessInTx(tx, userId, {
      activity: "woodcutting",
      sourceId: session.spotId,
      environmentId: lifeEnvironmentId,
      sessionId: session.sessionId,
      now,
      features: lifeFeatures,
    });

    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materialId = tree.materialId;
    const bonusMaterialGained =
      (session.bonusLogRate ?? 0) > 0 &&
      Math.random() < (session.bonusLogRate ?? 0)
        ? 1
        : 0;
    const environmentMaterialGained =
      lifeFeatures.environmentEnabled &&
      (lifeEnvironment.effect.primaryBonusChance ?? 0) > 0 &&
      lifeFieldSessionRoll(session.sessionId, "primary-bonus") <
        (lifeEnvironment.effect.primaryBonusChance ?? 0)
        ? 1
        : 0;
    const completedDiscovery = lifeField.completedTrace
      ? LIFE_FIELD_DISCOVERIES[lifeField.completedTrace.discoveryId]
      : null;
    const discoveryReward =
      completedDiscovery && lifeFeatures.discoveryRewardsEnabled
        ? lifeFieldDiscoveryReward(completedDiscovery.rare)
        : null;
    const discoveryRewardGained = discoveryReward?.resource ?? 0;
    const discoveryRewardXp = discoveryReward?.xp ?? 0;
    const materialGained =
      WOODCUTTING_MATERIAL_REWARD +
      bonusMaterialGained +
      environmentMaterialGained +
      discoveryRewardGained;
    const materials = mergeDrops(charSave.materials, {
      [materialId]: materialGained,
    });
    await upsertSave(tx, userId, "character.v2", { ...charSave, materials });
    const seedDrop = rollWoodcuttingSeedDrop(
      Math.random,
      levelBonuses.seedChancePct,
    );
    if (seedDrop) {
      const farm = parseFarmState(
        await lockSaveForUpdate(
          tx,
          userId,
          FARM_SAVE_KEY,
          emptyFarmState(now),
        ),
      );
      await upsertSave(
        tx,
        userId,
        FARM_SAVE_KEY,
        grantFarmSeeds(farm, { [seedDrop.cropId]: seedDrop.quantity }),
      );
    }
    let workshop = parseLifeWorkshopState(await lockSaveForUpdate(tx, userId, LIFE_WORKSHOP_SAVE_KEY, {}));
    let crafting = workshop.crafting;
    crafting = consumeLifeAidUses(crafting, "woodcutting", session.aidItemId, 1).state;
    const blueprint = rollHiddenBlueprint(
      crafting,
      "woodcutting",
      1,
      Math.random,
      levelBonuses.rareResultChancePct,
    );
    workshop = { ...workshop, crafting: blueprint.state };
    await upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, workshop);

    const diningXp = await consumeGuildDiningEffect(
      tx,
      userId,
      "life_xp",
      tree.xp,
      new Date(now),
    );
    const environmentXpGained = lifeFeatures.environmentEnabled
      ? lifeFieldXpBonus(
          tree.xp,
          lifeEnvironment.effect.xpBonusPct ?? 0,
          lifeFieldSessionRoll(session.sessionId, "xp-bonus"),
        )
      : 0;
    const xpGained =
      tree.xp + diningXp.bonus + environmentXpGained + discoveryRewardXp;
    const log = recordWoodcuttingSuccess(currentLog, {
      treeId: session.treeId,
      timber: materialGained,
      xp: xpGained,
    });
    await upsertSave(tx, userId, WOODCUTTING_LOG_KEY, log);
    await rewardReferralTutorialTasks(
      tx,
      userId,
      "새 모험가",
      referralLifeTaskIds(woodcuttingProgressionView(log.cuts, log.xp).level),
    );

    const playerClass = parseV2Class(charSave.class);
    const group = tier1ClassOf(playerClass);
    const jobId = jobIdFromLegacy(
      playerClass,
      typeof charSave.specChoice === "string" ? charSave.specChoice : null,
    );
    let masteryGained = 0;
    let masteryAfter: number | null = null;
    if (group !== "none" && isWoodcuttingJobId(jobId)) {
      let prof = parseProficiencyForChar(
        await lockSaveForUpdate(tx, userId, "proficiency.v2", {}),
        charSave,
      );
      prof = addCumLevel(prof, group, 1);
      prof = addJobCumLevel(prof, jobId, 1);
      masteryGained = 1;
      masteryAfter = prof.jobCumLevel?.[jobId] ?? 0;
      await upsertSave(tx, userId, "proficiency.v2", prof);
    }

    await incrementGuildExplorationProgressForUser(
      tx,
      userId,
      "woodcuttingSuccesses",
      1,
      new Date(now),
    );
    return {
      success: true as const,
      tree,
      materialId,
      materialName: WOODCUTTING_MATERIALS[materialId].name,
      materialGained,
      bonusMaterialGained,
      environmentMaterialGained,
      discoveryRewardGained,
      discoveryRewardXp,
      nextActionAt,
      recovered,
      failureRate,
      xpGained,
      environmentXpGained,
      jobId: isWoodcuttingJobId(jobId) ? jobId : null,
      jobName: isWoodcuttingJobId(jobId)
        ? V2_JOB_CATALOG[jobId]?.name ?? jobId
        : null,
      masteryGained,
      masteryAfter,
      seedDrop,
      materials: woodcuttingMaterialBalances(materials),
      // 구버전 클라이언트가 배포 중 응답을 받아도 깨지지 않도록 한동안 유지한다.
      timberGained: materialGained,
      ...(parsedLog.levelCurveMigrated
        ? { levelCurveMigrated: true as const }
        : {}),
      timber: materials[SETTLEMENT_MATERIAL_ID.timber] ?? 0,
      log,
      blueprintRecipeId: blueprint.recipe?.id ?? null,
      lifeEnvironment: lifeFeatures.environmentEnabled ? lifeEnvironment : null,
      lifeField: {
        newRecordIds: lifeField.newRecordIds,
        foundTrace: lifeField.foundTrace,
        completedTrace: lifeField.completedTrace,
      },
      lifeFieldFeedEnabled: lifeFeatures.feedEnabled,
      guardState: guardUpdate.state,
      guardExtremeVolumeAlert: guardUpdate.extremeVolumeAlert,
      guardCheckpointNewlyRequired: guardUpdate.checkpointNewlyRequired,
      guardBehaviorSignal: guardUpdate.behaviorSignal,
    };
  });

  if (result.success && result.blueprintRecipeId) await insertFeedEntry(userId, "life_blueprint", { recipeId: result.blueprintRecipeId });
  if (
    result.success &&
    result.lifeFieldFeedEnabled &&
    result.lifeField.completedTrace &&
    LIFE_FIELD_DISCOVERIES[result.lifeField.completedTrace.discoveryId].rare
  ) {
    await insertFeedEntry(userId, "life_discovery", {
      discoveryId: result.lifeField.completedTrace.discoveryId,
    });
  }

  if (!result.success && result.reason === "auto_active") {
    return Response.json(
      {
        ok: false,
        error: "auto_active",
        activeAutoActivity: result.activeAutoActivity,
      },
      { status: 409 },
    );
  }

  if ("guardStrongSignal" in result && result.guardStrongSignal && "guardState" in result) {
    recordStrongActivitySignalSoon({
      req,
      userId,
      activity: "woodcutting",
      signal: result.guardStrongSignal,
      state: result.guardState,
    });
  }
  if (
    "guardExtremeVolumeAlert" in result &&
    result.guardExtremeVolumeAlert &&
    "guardState" in result
  ) {
    recordExtremeActivityAlertSoon({
      req,
      userId,
      activity: "woodcutting",
      state: result.guardState,
    });
  }
  if (
    "guardCheckpointNewlyRequired" in result &&
    result.guardCheckpointNewlyRequired &&
    "guardState" in result
  ) {
    recordActivityVerificationRequiredSoon({
      req,
      userId,
      activity: "woodcutting",
      state: result.guardState,
    });
  }
  if (
    "guardBehaviorSignal" in result &&
    result.guardBehaviorSignal &&
    "guardState" in result
  ) {
    recordBehaviorActivitySignalSoon({
      req,
      userId,
      activity: "woodcutting",
      signal: result.guardBehaviorSignal,
      state: result.guardState,
    });
  }

  if (!result.success && result.reason === "failed" && "tree" in result) {
    recordLifeGatheringTelemetrySoon({
      userId,
      activity: "woodcutting",
      sourceId: result.tree.id,
      sourceName: result.tree.name,
      grade: result.tree.grade,
      success: false,
      failureRate: result.failureRate,
      xpGained: 0,
      drops: [],
    });
  }
  if (result.success) {
    recordLifeGatheringTelemetrySoon({
      userId,
      activity: "woodcutting",
      sourceId: result.tree.id,
      sourceName: result.tree.name,
      grade: result.tree.grade,
      success: true,
      failureRate: result.failureRate,
      xpGained: result.xpGained,
      drops: [
        {
          materialId: result.materialId,
          quantity: result.materialGained,
          primary: true,
        },
        ...(result.seedDrop
          ? [
              {
                materialId: result.seedDrop.cropId,
                materialName: result.seedDrop.seedName,
                quantity: result.seedDrop.quantity,
                primary: false,
                itemKind: "farm_seed",
              },
            ]
          : []),
      ],
    });
  }

  if (!result.success) {
    return Response.json({
      ok: true,
      success: false,
      reason: result.reason,
      retryAfterMs: "retryAfterMs" in result ? result.retryAfterMs : undefined,
      failureRate: "failureRate" in result ? result.failureRate : undefined,
      nextActionAt: "nextActionAt" in result ? result.nextActionAt : undefined,
    });
  }

  return Response.json({ ok: true, ...result });
}
