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
import {
  MINING_MATERIALS,
  MINING_NODES,
  rollMiningByproducts,
  type MiningMaterialId,
} from "@/adventure/data/v2/miningSpots";
import {
  MINING_LOG_KEY,
  MINING_ORE_REWARD,
  MINING_SESSION_KEY,
  miningAttemptSucceeds,
  miningMaterialBalances,
  parseMiningLog,
  parseMiningSession,
  recordMiningSuccess,
} from "@/adventure/v2/miningSession";
import {
  miningFailureRate,
  miningProgressionView,
} from "@/adventure/v2/miningProgression";
import { recordLifeGatheringTelemetrySoon } from "@/lib/server/lifeGatheringTelemetry";
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
    action: "v2:mining:strike",
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
    const session = parseMiningSession(
      await lockSaveForUpdate(tx, userId, MINING_SESSION_KEY, {}),
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
          "mining",
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
      return { success: false as const, reason: "not_ready" as const, retryAfterMs };
    }
    if (now > session.expiresAt) {
      await upsertSave(tx, userId, MINING_SESSION_KEY, {});
      return { success: false as const, reason: "expired" as const };
    }

    await upsertSave(tx, userId, MINING_SESSION_KEY, {});
    const guardUpdate = recordActivityCompletion(
      parseActivityGuardState(
        await lockSaveForUpdate(tx, userId, ACTIVITY_GUARD_KEY, {}),
      ),
      "mining",
      now,
    );
    await upsertSave(tx, userId, ACTIVITY_GUARD_KEY, guardUpdate.state);
    const nextActionAt = activityGuardView(
      guardUpdate.state,
      "mining",
    ).nextActionAt;

    const node = MINING_NODES[session.nodeId];
    const logRaw = await lockSaveForUpdate(tx, userId, MINING_LOG_KEY, {});
    const currentLog = parseMiningLog(logRaw);
    const progression = miningProgressionView(
      currentLog.successes,
      currentLog.xp,
    );
    const failureRate =
      session.failureRate ??
      miningFailureRate(node.baseFailureRate, progression.level);
    const initiallySucceeded = miningAttemptSucceeds(failureRate);
    const recovered =
      !initiallySucceeded &&
      (session.failureRecoveryRate ?? 0) > 0 &&
      Math.random() < (session.failureRecoveryRate ?? 0);
    if (!initiallySucceeded && !recovered) {
      return {
        success: false as const,
        reason: "failed" as const,
        node,
        failureRate,
        guardState: guardUpdate.state,
        guardExtremeVolumeAlert: guardUpdate.extremeVolumeAlert,
        guardCheckpointNewlyRequired: guardUpdate.checkpointNewlyRequired,
        guardBehaviorSignal: guardUpdate.behaviorSignal,
        nextActionAt,
      };
    }

    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const bonusMaterialGained =
      (session.bonusOreRate ?? 0) > 0 &&
      Math.random() < (session.bonusOreRate ?? 0)
        ? 1
        : 0;
    const byproductDrops = rollMiningByproducts(node);
    const materialGained = MINING_ORE_REWARD + bonusMaterialGained;
    const byproductTotal = Object.values(byproductDrops).reduce(
      (sum, count) => sum + (count ?? 0),
      0,
    );
    const materials = mergeDrops(charSave.materials, {
      [node.materialId]: materialGained,
      ...byproductDrops,
    });
    await upsertSave(tx, userId, "character.v2", { ...charSave, materials });

    const diningXp = await consumeGuildDiningEffect(
      tx,
      userId,
      "life_xp",
      node.xp,
      new Date(now),
    );
    const xpGained = node.xp + diningXp.bonus;
    const log = recordMiningSuccess(currentLog, {
      nodeId: session.nodeId,
      ore: materialGained,
      byproducts: byproductTotal,
      xp: xpGained,
    });
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

    return {
      success: true as const,
      node,
      materialId: node.materialId,
      materialName: MINING_MATERIALS[node.materialId].name,
      materialGained,
      bonusMaterialGained,
      nextActionAt,
      recovered,
      failureRate,
      byproducts: (
        Object.entries(byproductDrops) as [MiningMaterialId, number][]
      ).map(([materialId, amount]) => ({
        materialId,
        name: MINING_MATERIALS[materialId].name,
        amount,
      })),
      xpGained,
      jobId: isMiningJobId(jobId) ? jobId : null,
      jobName: isMiningJobId(jobId)
        ? V2_JOB_CATALOG[jobId]?.name ?? jobId
        : null,
      masteryGained,
      masteryAfter,
      materials: miningMaterialBalances(materials),
      log,
      guardState: guardUpdate.state,
      guardExtremeVolumeAlert: guardUpdate.extremeVolumeAlert,
      guardCheckpointNewlyRequired: guardUpdate.checkpointNewlyRequired,
      guardBehaviorSignal: guardUpdate.behaviorSignal,
    };
  });

  if ("guardStrongSignal" in result && result.guardStrongSignal && "guardState" in result) {
    recordStrongActivitySignalSoon({
      req,
      userId,
      activity: "mining",
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
      activity: "mining",
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
      activity: "mining",
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
      activity: "mining",
      signal: result.guardBehaviorSignal,
      state: result.guardState,
    });
  }

  if (!result.success && result.reason === "failed" && "node" in result) {
    recordLifeGatheringTelemetrySoon({
      userId,
      activity: "mining",
      sourceId: result.node.id,
      sourceName: result.node.name,
      grade: result.node.grade,
      success: false,
      failureRate: result.failureRate,
      xpGained: 0,
      drops: [],
    });
  }
  if (result.success) {
    recordLifeGatheringTelemetrySoon({
      userId,
      activity: "mining",
      sourceId: result.node.id,
      sourceName: result.node.name,
      grade: result.node.grade,
      success: true,
      failureRate: result.failureRate,
      xpGained: result.xpGained,
      drops: [
        {
          materialId: result.materialId,
          quantity: result.materialGained,
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
