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
import {
  activeAutoGatheringActivity,
  lockAutoGatheringStatesForUpdate,
} from "@/lib/server/lifeActivityLock";
import {
  equippedMiningBonuses,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";

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
  const [charSave, logRaw, skillsRaw, guardRaw] = await Promise.all([
    readSave<{ materials?: Record<string, unknown> }>(
      db,
      userId,
      "character.v2",
      {},
    ),
    readSave(db, userId, MINING_LOG_KEY, {}),
    readSave(db, userId, "skills.v2", {}),
    readSave(db, userId, ACTIVITY_GUARD_KEY, {}),
  ]);
  const verificationRequired = activityVerificationGateResponse(
    parseActivityGuardState(guardRaw),
    "mining",
  );
  if (verificationRequired) return verificationRequired;

  const log = parseMiningLog(logRaw);
  const progression = miningProgressionView(log.successes, log.xp);
  const bonuses = equippedMiningBonuses(parseV2SkillsState(skillsRaw).equipped);
  const durationMs = miningDurationWithPassive(
    node.durationMs,
    progression.level,
    bonuses.durationReductionPct,
  );
  const failureRate =
    miningFailureRate(node.baseFailureRate, progression.level) *
    (1 - bonuses.failureReductionPct / 100);
  const session: MiningSession = createMiningSession({
    sessionId: randomUUID(),
    spotId,
    nodeId,
    now: Date.now(),
    durationMs,
    failureRate,
    failureRecoveryRate: bonuses.failureRecoveryPct / 100,
    bonusOreRate: bonuses.bonusOreChancePct / 100,
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
    durationReductionPct: bonuses.durationReductionPct,
    failureRecoveryPct: bonuses.failureRecoveryPct,
    bonusOreChancePct: bonuses.bonusOreChancePct,
    strikes: node.strikes,
    materials: miningMaterialBalances(charSave.materials),
    log,
  });
}
