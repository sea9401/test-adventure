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
import {
  MINING_MATERIALS,
  MINING_NODES,
  MINING_SPOTS,
  isMiningSpotId,
} from "@/adventure/data/v2/miningSpots";
import {
  MINING_LOG_KEY,
  MINING_SESSION_KEY,
  createMiningSession,
  miningMaterialBalances,
  parseMiningLog,
  pickMiningNodeId,
  type MiningSession,
} from "@/adventure/v2/miningSession";
import {
  miningDurationWithPassive,
  miningFailureRate,
  miningProgressionView,
} from "@/adventure/v2/miningProgression";
import { miningPost50Bonuses } from "@/adventure/v2/lifeLevelBonuses";
import {
  activeAutoGatheringActivity,
  lockAutoGatheringStatesForUpdate,
} from "@/lib/server/lifeActivityLock";
import {
  equippedMiningBonuses,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  LIFE_TOOL_BONUS_MATERIAL_PCT,
  LIFE_TOOL_DURATION_REDUCTION_PCT,
  LIFE_WORKSHOP_SAVE_KEY,
  lifeGatheringBonusPct,
  parseLifeWorkshopState,
} from "@/adventure/v2/lifeWorkshop";
import { lifeAidSpec } from "@/adventure/v2/lifeCrafting";
import {
  applyLifeFieldDurationReduction,
  lifeFieldEnvironmentSnapshot,
} from "@/adventure/data/v2/lifeFieldEnvironment";
import { readLifeFieldFeatureSettings } from "@/lib/server/opsSettings";

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:mining:start",
    userLimit: 20,
    ipLimit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { spotId?: unknown } | null;
  if (typeof body?.spotId !== "string" || !isMiningSpotId(body.spotId)) {
    return Response.json({ ok: false, error: "bad_spot" }, { status: 400 });
  }

  const spotId = body.spotId;
  const nodeId = pickMiningNodeId(spotId);
  const node = MINING_NODES[nodeId];
  const now = Date.now();
  const [charSave, logRaw, skillsRaw, guardRaw, workshopRaw, lifeFeatures] = await Promise.all([
    readSave<{ materials?: Record<string, unknown> }>(
      db,
      userId,
      "character.v2",
      {},
    ),
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

  const log = parseMiningLog(logRaw);
  const progression = miningProgressionView(log.successes, log.xp);
  const levelBonuses = miningPost50Bonuses(progression.level);
  const bonuses = equippedMiningBonuses(parseV2SkillsState(skillsRaw).equipped);
  const workshop = parseLifeWorkshopState(workshopRaw);
  const toolTier = workshop.tools.mining;
  const activeAid = workshop.crafting.activeAids.mining;
  const aidSpec = activeAid?.enabled ? lifeAidSpec(activeAid.itemId) : null;
  const aidApplies = Boolean(aidSpec && node.grade >= aidSpec.gradeMin && node.grade <= aidSpec.gradeMax);
  const durationReductionPct =
    bonuses.durationReductionPct + LIFE_TOOL_DURATION_REDUCTION_PCT[toolTier];
  const bonusOreChancePct = Math.min(
    100,
    bonuses.bonusOreChancePct +
      LIFE_TOOL_BONUS_MATERIAL_PCT[toolTier] +
      lifeGatheringBonusPct("mining", workshop, progression.level) +
      levelBonuses.bonusOreChancePct +
      (aidApplies ? aidSpec?.bonusPct ?? 0 : 0),
  );
  const baseAdjustedDurationMs = miningDurationWithPassive(
    node.durationMs,
    progression.level,
    durationReductionPct,
  );
  const lifeEnvironment = lifeFeatures.environmentEnabled
    ? lifeFieldEnvironmentSnapshot("mining", spotId, now)
    : null;
  const durationMs = applyLifeFieldDurationReduction(
    node.durationMs,
    baseAdjustedDurationMs,
    lifeEnvironment?.environment.effect.durationReductionPct ?? 0,
  );
  const failureRate =
    miningFailureRate(node.baseFailureRate, progression.level) *
    (1 - bonuses.failureReductionPct / 100);
  const session: MiningSession = createMiningSession({
    sessionId: randomUUID(),
    spotId,
    nodeId,
    now,
    durationMs,
    failureRate,
    failureRecoveryRate: bonuses.failureRecoveryPct / 100,
    bonusOreRate: bonusOreChancePct / 100,
    aidItemId: aidApplies ? activeAid?.itemId : undefined,
    lifeEnvironmentId: lifeEnvironment?.environment.id,
    lifeEnvironmentDayKey: lifeEnvironment?.dayKey,
  });

  const started = await db.transaction(async (tx) => {
    const autoStates = await lockAutoGatheringStatesForUpdate(tx, userId);
    const activeAutoActivity = activeAutoGatheringActivity(autoStates);
    if (activeAutoActivity) return { activeAutoActivity };
    await lockSaveForUpdate(tx, userId, MINING_SESSION_KEY, {});
    await upsertSave(tx, userId, MINING_SESSION_KEY, session);
    return { activeAutoActivity: null };
  });
  if (started.activeAutoActivity) {
    return Response.json(
      {
        ok: false,
        error: "auto_active",
        activeAutoActivity: started.activeAutoActivity,
      },
      { status: 409 },
    );
  }

  return Response.json({
    ok: true,
    sessionId: session.sessionId,
    spot: MINING_SPOTS[spotId],
    node,
    material: MINING_MATERIALS[node.materialId],
    baseDurationMs: node.durationMs,
    durationMs,
    failureRate,
    successRate: 1 - failureRate,
    failureReductionPct: bonuses.failureReductionPct,
    durationReductionPct,
    failureRecoveryPct: bonuses.failureRecoveryPct,
    bonusOreChancePct,
    strikes: node.strikes,
    materials: miningMaterialBalances(charSave.materials),
    log,
    lifeEnvironment,
  });
}
