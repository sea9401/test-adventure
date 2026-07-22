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
  MINING_MATERIALS,
  MINING_NODES,
  isMiningSpotId,
} from "@/adventure/data/v2/miningSpots";
import {
  MINING_LOG_KEY,
  isMiningNodeId,
  miningMaterialBalances,
  parseMiningLog,
  pickMiningNodeId,
} from "@/adventure/v2/miningSession";
import {
  miningDurationWithPassive,
  miningFailureRate,
  miningProgressionView,
} from "@/adventure/v2/miningProgression";
import {
  MINING_AUTO_KEY,
  autoGatheringCompletedAttempts,
  beginAutoGathering,
  cancelAutoGathering,
  createAutoGatheringSession,
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
import {
  V2_JOB_CATALOG,
  isMiningJobId,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";
import { recordLifeGatheringTelemetrySoon } from "@/lib/server/lifeGatheringTelemetry";
import { MINING_SETTLE_MS } from "@/adventure/v2/miningAnimation";

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
    | { action?: unknown; spotId?: unknown }
    | null;
  if (body?.action === "start") {
    if (typeof body.spotId !== "string" || !isMiningSpotId(body.spotId)) {
      return Response.json({ ok: false, error: "bad_spot" }, { status: 400 });
    }
    const [logRaw, skillsRaw, guardRaw] = await Promise.all([
      readSave(db, userId, MINING_LOG_KEY, {}),
      readSave(db, userId, "skills.v2", {}),
      readSave(db, userId, ACTIVITY_GUARD_KEY, {}),
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
    const bonuses = equippedMiningBonuses(parseV2SkillsState(skillsRaw).equipped);
    const cycleDurationMs = miningDurationWithPassive(
      node.durationMs,
      progression.level,
      bonuses.durationReductionPct,
    );
    const failureRate =
      miningFailureRate(node.baseFailureRate, progression.level) *
      (1 - bonuses.failureReductionPct / 100);
    const successRate = 1 - failureRate * (1 - bonuses.failureRecoveryPct / 100);
    const now = Date.now();
    const session = createAutoGatheringSession({
      sessionId: randomUUID(),
      sourceId: nodeId,
      sourceName: node.name,
      materialId: node.materialId,
      now,
      cycleDurationMs: cycleDurationMs + MINING_SETTLE_MS,
      successRate,
      bonusMaterialRate: bonuses.bonusOreChancePct / 100,
      baseXp: node.xp,
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
      autoSession: startResult.session,
      materialName: MINING_MATERIALS[node.materialId].name,
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
    const settlement = settleAutoGathering(
      autoState,
      canceling
        ? autoGatheringCompletedAttempts(session, now)
        : session.attempts,
    );
    if (!settlement) return { error: "no_session" as const };
    const node = MINING_NODES[session.sourceId];
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materials = mergeDrops(charSave.materials, {
      [node.materialId]: settlement.materialsGained,
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
    const currentLog = parseMiningLog(
      await lockSaveForUpdate(tx, userId, MINING_LOG_KEY, {}),
    );
    const log = {
      ...currentLog,
      successes: currentLog.successes + settlement.successes,
      xp: currentLog.xp + xpGained,
      oreEarned: currentLog.oreEarned + settlement.materialsGained,
      nodes: {
        ...currentLog.nodes,
        [node.id]: (currentLog.nodes[node.id] ?? 0) + settlement.successes,
      },
    };
    await upsertSave(tx, userId, MINING_LOG_KEY, log);

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
      await upsertSave(tx, userId, "proficiency.v2", proficiency);
    }
    await upsertSave(tx, userId, MINING_AUTO_KEY, settlement.state);
    return {
      settlement,
      node,
      materialName: MINING_MATERIALS[node.materialId].name,
      xpGained,
      masteryGained,
      masteryAfter,
      jobName: isMiningJobId(jobId) ? V2_JOB_CATALOG[jobId]?.name ?? jobId : null,
      materials: miningMaterialBalances(materials),
      log,
      canceled: canceling,
      activeAutoActivity: autoStates.woodcutting.session
        ? "woodcutting" as const
        : null,
    };
  });

  if ("error" in result) {
    const status = result.error === "not_ready" ? 409 : 404;
    return Response.json({ ok: false, ...result }, { status });
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
    masteryGained: result.masteryGained,
    masteryAfter: result.masteryAfter,
    jobName: result.jobName,
    materials: result.materials,
    log: result.log,
    autoSession: null,
    activeAutoActivity: result.activeAutoActivity,
  });
}
