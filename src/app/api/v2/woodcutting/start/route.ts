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
import { SETTLEMENT_MATERIAL_ID } from "@/adventure/data/v2/settlementMaterials";
import {
  WOODCUTTING_MATERIALS,
  WOODCUTTING_SPOTS,
  isWoodcuttingSpotId,
} from "@/adventure/data/v2/woodcuttingSpots";
import {
  WOODCUTTING_LOG_KEY,
  WOODCUTTING_SESSION_KEY,
  WOODCUTTING_TREES,
  createWoodcuttingSession,
  parseWoodcuttingLog,
  pickWoodcuttingTreeId,
  woodcuttingMaterialBalances,
  type WoodcuttingSession,
} from "@/adventure/v2/woodcuttingSession";
import {
  woodcuttingDurationWithPassive,
  woodcuttingFailureRate,
  woodcuttingProgressionView,
} from "@/adventure/v2/woodcuttingProgression";
import { woodcuttingPost50Bonuses } from "@/adventure/v2/lifeLevelBonuses";
import {
  activeAutoGatheringActivity,
  lockAutoGatheringStatesForUpdate,
} from "@/lib/server/lifeActivityLock";
import {
  equippedWoodcuttingBonuses,
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
    action: "v2:woodcutting:start",
    userLimit: 20,
    ipLimit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { spotId?: unknown } | null;
  if (typeof body?.spotId !== "string" || !isWoodcuttingSpotId(body.spotId)) {
    return Response.json({ ok: false, error: "bad_spot" }, { status: 400 });
  }

  const spotId = body.spotId;
  const treeId = pickWoodcuttingTreeId(spotId);
  const tree = WOODCUTTING_TREES[treeId];
  const now = Date.now();
  const [charSave, logRaw, skillsRaw, guardRaw, workshopRaw, lifeFeatures] = await Promise.all([
    readSave<{ materials?: Record<string, unknown> }>(db, userId, "character.v2", {}),
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
  const log = parseWoodcuttingLog(logRaw);
  const progression = woodcuttingProgressionView(log.cuts, log.xp);
  const levelBonuses = woodcuttingPost50Bonuses(progression.level);
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
  const bonusLogChancePct = Math.min(
    100,
    bonuses.bonusLogChancePct +
      LIFE_TOOL_BONUS_MATERIAL_PCT[toolTier] +
      lifeGatheringBonusPct("woodcutting", workshop, progression.level) +
      levelBonuses.bonusLogChancePct +
      (aidApplies ? aidSpec?.bonusPct ?? 0 : 0),
  );
  const baseAdjustedDurationMs = woodcuttingDurationWithPassive(
    tree.durationMs,
    progression.level,
    durationReductionPct,
  );
  const lifeEnvironment = lifeFeatures.environmentEnabled
    ? lifeFieldEnvironmentSnapshot("woodcutting", spotId, now)
    : null;
  const durationMs = applyLifeFieldDurationReduction(
    tree.durationMs,
    baseAdjustedDurationMs,
    lifeEnvironment?.environment.effect.durationReductionPct ?? 0,
  );
  const failureRate =
    woodcuttingFailureRate(tree.baseFailureRate, progression.level) *
    (1 - bonuses.failureReductionPct / 100);
  const session: WoodcuttingSession = createWoodcuttingSession({
    sessionId: randomUUID(),
    spotId,
    treeId,
    now,
    durationMs,
    failureRate,
    failureRecoveryRate: bonuses.failureRecoveryPct / 100,
    bonusLogRate: bonusLogChancePct / 100,
    aidItemId: aidApplies ? activeAid?.itemId : undefined,
    lifeEnvironmentId: lifeEnvironment?.environment.id,
    lifeEnvironmentDayKey: lifeEnvironment?.dayKey,
  });

  const started = await db.transaction(async (tx) => {
    const autoStates = await lockAutoGatheringStatesForUpdate(tx, userId);
    const activeAutoActivity = activeAutoGatheringActivity(autoStates);
    if (activeAutoActivity) return { activeAutoActivity };
    await lockSaveForUpdate(tx, userId, WOODCUTTING_SESSION_KEY, {});
    await upsertSave(tx, userId, WOODCUTTING_SESSION_KEY, session);
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

  const materials = woodcuttingMaterialBalances(charSave.materials);

  return Response.json({
    ok: true,
    sessionId: session.sessionId,
    spot: WOODCUTTING_SPOTS[spotId],
    tree,
    material: WOODCUTTING_MATERIALS[tree.materialId],
    baseDurationMs: tree.durationMs,
    durationMs,
    failureRate,
    successRate: 1 - failureRate,
    failureReductionPct: bonuses.failureReductionPct,
    durationReductionPct,
    failureRecoveryPct: bonuses.failureRecoveryPct,
    bonusLogChancePct,
    chops: tree.chops,
    materials,
    timber: materials[SETTLEMENT_MATERIAL_ID.timber],
    log,
    lifeEnvironment,
  });
}
