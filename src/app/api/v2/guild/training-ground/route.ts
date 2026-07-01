import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  guildActivityLog,
  guildMembers,
  outpostVillages,
  savesKv,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import {
  addCumLevel,
  addJobCumLevel,
  groupCumLevel,
  parseProficiencyForChar,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import {
  parseV2Class,
  tier1ClassOf,
} from "@/adventure/data/v2/classes";
import {
  V2_JOB_CATALOG,
  cumLevelForJob,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  settlementBuildingIdOf,
  settlementBuildingLevelOf,
  trainingGroundUpgradeForLevel,
} from "@/adventure/data/v2/settlement";
import {
  claimGuildTrainingDrill,
  guildTrainingDayWindow,
  guildTrainingDrillViews,
  isGuildTrainingDrillId,
  parseGuildTrainingState,
} from "@/adventure/data/v2/guildTrainingGround";

const TRAINING_SAVE_KEY = "guild-training.v1";

type CharacterSave = Record<string, unknown> & {
  class?: unknown;
  specChoice?: unknown;
  level?: unknown;
};

type TrainingActivityMetaView = {
  drillTitle: string | null;
  rewardMastery: number;
};

type GuildTrainingDayWindow = ReturnType<typeof guildTrainingDayWindow>;

async function getGuildIdForUser(userId: string): Promise<number | null> {
  const row = (
    await db
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1)
  )[0];
  return row?.guildId ?? null;
}

function trainingGroundLevelFromBuildings(buildings: unknown): number {
  if (buildings == null || typeof buildings !== "object" || Array.isArray(buildings)) {
    return 0;
  }
  let level = 0;
  for (const raw of Object.values(buildings as Record<string, unknown>)) {
    if (settlementBuildingIdOf(raw) === "training_ground") {
      level = Math.max(level, settlementBuildingLevelOf(raw));
    }
  }
  return level;
}

async function guildTrainingGroundLevel(guildId: number): Promise<number> {
  const rows = await db
    .select({ buildings: outpostVillages.buildings })
    .from(outpostVillages)
    .where(eq(outpostVillages.guildId, guildId));
  return rows.reduce(
    (max, row) => Math.max(max, trainingGroundLevelFromBuildings(row.buildings)),
    0,
  );
}

function currentJobInfo(charSave: CharacterSave, profRaw: unknown) {
  const cls = parseV2Class(charSave.class);
  const group = tier1ClassOf(cls);
  const jobId = jobIdFromLegacy(
    cls,
    typeof charSave.specChoice === "string" ? charSave.specChoice : null,
  );
  const job = V2_JOB_CATALOG[jobId] ?? null;
  const prof = parseProficiencyForChar(profRaw, charSave);
  const hasJob = group !== "none" && jobId !== "none";
  const mastery = hasJob
    ? job
      ? cumLevelForJob(prof, job)
      : groupCumLevel(prof, group)
    : null;
  return { cls, group, jobId, job, prof, hasJob, mastery };
}

function positiveInt(raw: unknown): number {
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : 0;
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function trainingActivityMeta(raw: unknown): TrainingActivityMetaView {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { drillTitle: null, rewardMastery: 0 };
  }
  const obj = raw as Record<string, unknown>;
  return {
    drillTitle:
      typeof obj.drillTitle === "string" && obj.drillTitle.trim()
        ? obj.drillTitle.trim()
        : null,
    rewardMastery: positiveInt(obj.rewardMastery),
  };
}

async function readProfileNames(userIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter((id) => id.length > 0)));
  const nameByUser = new Map<string, string>();
  if (ids.length === 0) return nameByUser;

  const rows = await db
    .select({ userId: savesKv.userId, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        inArray(savesKv.userId, ids),
        eq(savesKv.key, "character-profile.v2"),
      ),
    );
  for (const row of rows) {
    const value = (row.value ?? null) as { name?: string } | null;
    const name = value?.name?.trim();
    if (name) nameByUser.set(row.userId, name);
  }
  return nameByUser;
}

async function readGuildTrainingSummary({
  guildId,
  dayWindow,
  dailyClaimLimit,
}: {
  guildId: number;
  dayWindow: GuildTrainingDayWindow;
  dailyClaimLimit: number;
}) {
  const [memberRows, activityRows] = await Promise.all([
    db
      .select({ userId: guildMembers.userId })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, guildId)),
    db
      .select({
        id: guildActivityLog.id,
        actorUserId: guildActivityLog.actorUserId,
        meta: guildActivityLog.meta,
        createdAt: guildActivityLog.createdAt,
      })
      .from(guildActivityLog)
      .where(
        and(
          eq(guildActivityLog.guildId, guildId),
          eq(guildActivityLog.type, "training_drill_claim"),
          gte(guildActivityLog.createdAt, dayWindow.start),
          lt(guildActivityLog.createdAt, dayWindow.end),
        ),
      )
      .orderBy(desc(guildActivityLog.createdAt)),
  ]);

  const memberIds = memberRows.map((row) => row.userId);
  const memberIdSet = new Set(memberIds);
  const rows = activityRows.flatMap((row) => {
    if (
      typeof row.actorUserId !== "string" ||
      !memberIdSet.has(row.actorUserId)
    ) {
      return [];
    }
    return [
      {
        ...row,
        actorUserId: row.actorUserId,
        metaView: trainingActivityMeta(row.meta),
      },
    ];
  });
  const participatedMemberIds = new Set(rows.map((row) => row.actorUserId));
  const totalMastery = rows.reduce(
    (sum, row) => sum + row.metaView.rewardMastery,
    0,
  );
  const recentRows = rows.slice(0, 5);
  const nameByUser = await readProfileNames(
    recentRows.map((row) => row.actorUserId),
  );

  return {
    dayKey: dayWindow.dayKey,
    memberCount: memberIds.length,
    participatedMemberCount: participatedMemberIds.size,
    pendingMemberCount: Math.max(
      0,
      memberIds.length - participatedMemberIds.size,
    ),
    completionCount: rows.length,
    dailyClaimLimit,
    maxCompletionCount: memberIds.length * Math.max(1, dailyClaimLimit),
    totalMastery,
    recent: recentRows.map((row) => ({
      id: row.id,
      actorName: nameByUser.get(row.actorUserId) ?? "모험가",
      drillTitle: row.metaView.drillTitle ?? "훈련",
      rewardMastery: row.metaView.rewardMastery,
      createdAt: row.createdAt,
    })),
  };
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const guildId = await getGuildIdForUser(userId);
  if (guildId == null) {
    return Response.json({ ok: false, error: "no_guild" }, { status: 403 });
  }

  const trainingGroundLevel = await guildTrainingGroundLevel(guildId);
  const dayWindow = guildTrainingDayWindow();
  const dayKey = dayWindow.dayKey;
  const [charSave, profRaw, trainingRaw] = await Promise.all([
    readSave<CharacterSave | null>(db, userId, "character.v2", null),
    readSave<V2ProficiencyState | null>(db, userId, "proficiency.v2", null),
    readSave<Record<string, unknown> | null>(db, userId, TRAINING_SAVE_KEY, null),
  ]);
  if (!charSave) {
    return Response.json({ ok: false, error: "no_character" }, { status: 400 });
  }

  const current = currentJobInfo(charSave, profRaw);
  const characterLevel = Math.max(1, Math.floor(Number(charSave.level) || 1));
  const state = parseGuildTrainingState(trainingRaw, dayKey);
  const upgrade = trainingGroundUpgradeForLevel(Math.max(1, trainingGroundLevel));
  const drills = guildTrainingDrillViews({
    state,
    buildingLevel: trainingGroundLevel,
    characterLevel,
    hasJob: current.hasJob,
    currentClass: current.group,
  });
  const claimedCount = drills.filter((drill) => drill.claimed).length;
  const availableCount = drills.filter((drill) => drill.available).length;
  const dailyClaimLimit = Math.max(1, upgrade.unlockedDrillCount);
  const remainingClaims = Math.max(0, dailyClaimLimit - claimedCount);
  const guildSummary = await readGuildTrainingSummary({
    guildId,
    dayWindow,
    dailyClaimLimit,
  });
  return Response.json({
    ok: true,
    dayKey,
    hasTrainingGround: trainingGroundLevel > 0,
    trainingGroundLevel,
    upgrade,
    claimedCount,
    availableCount,
    remainingClaims,
    claimableCount: Math.min(availableCount, remainingClaims),
    guildSummary,
    currentJob: current.job
      ? {
          id: current.job.id,
          name: current.job.name,
          mastery: current.mastery,
        }
      : null,
    drills,
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { drillId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!isGuildTrainingDrillId(body.drillId)) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const drillId = body.drillId;

  const guildId = await getGuildIdForUser(userId);
  if (guildId == null) {
    return Response.json({ ok: false, error: "no_guild" }, { status: 403 });
  }
  const trainingGroundLevel = await guildTrainingGroundLevel(guildId);
  if (trainingGroundLevel <= 0) {
    return Response.json(
      { ok: false, error: "training_ground_required" },
      { status: 403 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const { dayKey } = guildTrainingDayWindow();
    const charSave = await lockSaveForUpdate<CharacterSave | null>(
      tx,
      userId,
      "character.v2",
      null,
    );
    if (!charSave) {
      return { status: 400, body: { ok: false as const, error: "no_character" } };
    }
    const profRaw = await lockSaveForUpdate<V2ProficiencyState | null>(
      tx,
      userId,
      "proficiency.v2",
      null,
    );
    const trainingRaw = await lockSaveForUpdate<Record<string, unknown> | null>(
      tx,
      userId,
      TRAINING_SAVE_KEY,
      null,
    );
    const current = currentJobInfo(charSave, profRaw);
    const characterLevel = Math.max(1, Math.floor(Number(charSave.level) || 1));
    const state = parseGuildTrainingState(trainingRaw, dayKey);
    if (state.claimed.includes(drillId)) {
      return {
        status: 409,
        body: { ok: false as const, error: "already_claimed" },
      };
    }
    const drill = guildTrainingDrillViews({
      state,
      buildingLevel: trainingGroundLevel,
      characterLevel,
      hasJob: current.hasJob,
      currentClass: current.group,
    }).find((d) => d.id === drillId);
    if (!drill || !drill.available) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "locked",
          reason: drill?.lockedReason ?? null,
        },
      };
    }

    let prof = current.prof;
    prof = addCumLevel(prof, current.group, drill.rewardMastery);
    prof = addJobCumLevel(prof, current.jobId, drill.rewardMastery);
    const masteryAfter =
      current.job != null
        ? cumLevelForJob(prof, current.job)
        : groupCumLevel(prof, current.group);
    const nextState = claimGuildTrainingDrill(state, drillId);

    await upsertSave(tx, userId, "proficiency.v2", prof);
    await upsertSave(tx, userId, TRAINING_SAVE_KEY, nextState);
    await logGuildActivity(tx, {
      guildId,
      type: "training_drill_claim",
      actorUserId: userId,
      meta: {
        drillTitle: drill.title,
        rewardMastery: drill.rewardMastery,
      },
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        dayKey,
        drill,
        rewardMastery: drill.rewardMastery,
        masteryAfter,
        claimed: nextState.claimed,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
