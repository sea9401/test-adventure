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
  WOODCUTTING_TREES,
  isWoodcuttingSpotId,
} from "@/adventure/data/v2/woodcuttingSpots";
import {
  WOODCUTTING_LOG_KEY,
  WOODCUTTING_SESSION_KEY,
  isWoodcuttingTreeId,
  parseWoodcuttingLog,
  parseWoodcuttingSession,
  pickWoodcuttingTreeId,
  woodcuttingMaterialBalances,
} from "@/adventure/v2/woodcuttingSession";
import {
  woodcuttingDurationWithPassive,
  woodcuttingFailureRate,
  woodcuttingProgressionView,
} from "@/adventure/v2/woodcuttingProgression";
import {
  AUTO_GATHERING_MATERIAL_EFFICIENCY,
  beginAutoGathering,
  createAutoGatheringSession,
  parseAutoGatheringState,
  settleAutoGathering,
  WOODCUTTING_AUTO_KEY,
} from "@/adventure/v2/autoGathering";
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
    | { action?: unknown; spotId?: unknown }
    | null;
  if (body?.action === "start") {
    if (typeof body.spotId !== "string" || !isWoodcuttingSpotId(body.spotId)) {
      return Response.json({ ok: false, error: "bad_spot" }, { status: 400 });
    }
    const [logRaw, skillsRaw, guardRaw] = await Promise.all([
      readSave(db, userId, WOODCUTTING_LOG_KEY, {}),
      readSave(db, userId, "skills.v2", {}),
      readSave(db, userId, ACTIVITY_GUARD_KEY, {}),
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
    const cycleDurationMs = woodcuttingDurationWithPassive(
      tree.durationMs,
      progression.level,
      bonuses.durationReductionPct,
    );
    const failureRate =
      woodcuttingFailureRate(tree.baseFailureRate, progression.level) *
      (1 - bonuses.failureReductionPct / 100);
    const successRate = 1 - failureRate * (1 - bonuses.failureRecoveryPct / 100);
    const now = Date.now();
    const session = createAutoGatheringSession({
      sessionId: randomUUID(),
      sourceId: treeId,
      sourceName: tree.name,
      materialId: tree.materialId,
      now,
      cycleDurationMs: cycleDurationMs + WOODCUTTING_TREE_FALL_MS,
      successRate,
      bonusMaterialRate: bonuses.bonusLogChancePct / 100,
      baseXp: tree.xp,
    });
    const startResult = await db.transaction(async (tx) => {
      const autoState = parseAutoGatheringState(
        await lockSaveForUpdate(tx, userId, WOODCUTTING_AUTO_KEY, {}),
      );
      if (autoState.session) return { error: "auto_active" as const };
      const manualSession = parseWoodcuttingSession(
        await lockSaveForUpdate(tx, userId, WOODCUTTING_SESSION_KEY, {}),
      );
      if (manualSession && now <= manualSession.expiresAt) {
        return { error: "manual_active" as const };
      }
      await upsertSave(
        tx,
        userId,
        WOODCUTTING_AUTO_KEY,
        beginAutoGathering(autoState, session),
      );
      return { session };
    });
    if ("error" in startResult) {
      return Response.json({ ok: false, error: startResult.error }, { status: 409 });
    }
    return Response.json({
      ok: true,
      autoSession: startResult.session,
      materialName: WOODCUTTING_MATERIALS[tree.materialId].name,
    });
  }

  if (body?.action !== "claim") {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const now = Date.now();
  const result = await db.transaction(async (tx) => {
    const autoState = parseAutoGatheringState(
      await lockSaveForUpdate(tx, userId, WOODCUTTING_AUTO_KEY, {}),
    );
    const session = autoState.session;
    if (!session) return { error: "no_session" as const };
    if (now < session.readyAt) {
      return { error: "not_ready" as const, retryAfterMs: session.readyAt - now };
    }
    if (!isWoodcuttingTreeId(session.sourceId)) {
      await upsertSave(tx, userId, WOODCUTTING_AUTO_KEY, {
        ...autoState,
        session: null,
      });
      return { error: "invalid_session" as const };
    }
    const settlement = settleAutoGathering(autoState);
    if (!settlement) return { error: "no_session" as const };
    const tree = WOODCUTTING_TREES[session.sourceId];
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

    const diningXp = await consumeGuildDiningEffect(
      tx,
      userId,
      "life_xp",
      settlement.xpGained,
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
      settlement.successes * AUTO_GATHERING_MATERIAL_EFFICIENCY + 1e-9,
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
      masteryGained,
      masteryAfter,
      jobName: isWoodcuttingJobId(jobId)
        ? V2_JOB_CATALOG[jobId]?.name ?? jobId
        : null,
      seedDrops,
      materials: woodcuttingMaterialBalances(materials),
      log,
    };
  });

  if ("error" in result) {
    const status = result.error === "not_ready" ? 409 : 404;
    return Response.json({ ok: false, ...result }, { status });
  }
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
  return Response.json({
    ok: true,
    attempts: result.settlement.attempts,
    successes: result.settlement.successes,
    materialName: result.materialName,
    materialsGained: result.settlement.materialsGained,
    xpGained: result.xpGained,
    masteryGained: result.masteryGained,
    masteryAfter: result.masteryAfter,
    jobName: result.jobName,
    seedDrops: result.seedDrops,
    materials: result.materials,
    log: result.log,
    autoSession: null,
  });
}
