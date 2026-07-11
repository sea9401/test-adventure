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
  woodcuttingDurationForLevel,
  woodcuttingFailureRate,
  woodcuttingProgressionView,
} from "@/adventure/v2/woodcuttingProgression";

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
  const [charSave, logRaw, guardRaw] = await Promise.all([
    readSave<{ materials?: Record<string, unknown> }>(db, userId, "character.v2", {}),
    readSave(db, userId, WOODCUTTING_LOG_KEY, {}),
    readSave(db, userId, ACTIVITY_GUARD_KEY, {}),
  ]);
  const verificationRequired = activityVerificationGateResponse(
    parseActivityGuardState(guardRaw),
    "woodcutting",
  );
  if (verificationRequired) return verificationRequired;
  const log = parseWoodcuttingLog(logRaw);
  const progression = woodcuttingProgressionView(log.cuts, log.xp);
  const durationMs = woodcuttingDurationForLevel(tree.durationMs, progression.level);
  const failureRate = woodcuttingFailureRate(tree.baseFailureRate, progression.level);
  const now = Date.now();
  const session: WoodcuttingSession = createWoodcuttingSession({
    sessionId: randomUUID(),
    spotId,
    treeId,
    now,
    durationMs,
    failureRate,
  });

  await db.transaction(async (tx) => {
    await lockSaveForUpdate(tx, userId, WOODCUTTING_SESSION_KEY, {});
    await upsertSave(tx, userId, WOODCUTTING_SESSION_KEY, session);
  });

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
    chops: tree.chops,
    materials,
    timber: materials[SETTLEMENT_MATERIAL_ID.timber],
    log,
  });
}
