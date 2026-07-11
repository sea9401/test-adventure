import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  ACTIVITY_GUARD_KEY,
  parseActivityGuardState,
  recordActivityCompletion,
  recordActivityStrongSignal,
} from "@/lib/server/activityGuard";
import {
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
  parseWoodcuttingLog,
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
        const guardUpdate = recordActivityStrongSignal(
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
          guardStrongSignal: "early_finish" as const,
          guardState: guardUpdate.state,
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
    const tree = WOODCUTTING_TREES[session.treeId];
    const logRaw = await lockSaveForUpdate(tx, userId, WOODCUTTING_LOG_KEY, {});
    const currentLog = parseWoodcuttingLog(logRaw);
    const progression = woodcuttingProgressionView(currentLog.cuts, currentLog.xp);
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
        failureRate,
        guardState: guardUpdate.state,
        guardExtremeVolumeAlert: guardUpdate.extremeVolumeAlert,
      };
    }

    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materialId = tree.materialId;
    const bonusMaterialGained =
      (session.bonusLogRate ?? 0) > 0 && Math.random() < (session.bonusLogRate ?? 0)
        ? 1
        : 0;
    const materialGained = WOODCUTTING_MATERIAL_REWARD + bonusMaterialGained;
    const materials = mergeDrops(charSave.materials, {
      [materialId]: materialGained,
    });
    await upsertSave(tx, userId, "character.v2", { ...charSave, materials });

    const log = recordWoodcuttingSuccess(currentLog, {
      treeId: session.treeId,
      timber: materialGained,
      xp: tree.xp,
    });
    await upsertSave(tx, userId, WOODCUTTING_LOG_KEY, log);

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
      recovered,
      xpGained: tree.xp,
      jobId: isWoodcuttingJobId(jobId) ? jobId : null,
      jobName: isWoodcuttingJobId(jobId)
        ? V2_JOB_CATALOG[jobId]?.name ?? jobId
        : null,
      masteryGained,
      masteryAfter,
      materials: woodcuttingMaterialBalances(materials),
      // 구버전 클라이언트가 배포 중 응답을 받아도 깨지지 않도록 한동안 유지한다.
      timberGained: materialGained,
      timber: materials[SETTLEMENT_MATERIAL_ID.timber] ?? 0,
      log,
      guardState: guardUpdate.state,
      guardExtremeVolumeAlert: guardUpdate.extremeVolumeAlert,
    };
  });

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

  if (!result.success) {
    return Response.json({
      ok: true,
      success: false,
      reason: result.reason,
      retryAfterMs: "retryAfterMs" in result ? result.retryAfterMs : undefined,
      failureRate: "failureRate" in result ? result.failureRate : undefined,
    });
  }

  return Response.json({ ok: true, ...result });
}
