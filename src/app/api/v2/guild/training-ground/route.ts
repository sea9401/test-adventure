import { eq } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, outpostVillages } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
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
  guildTrainingDrillViews,
  isGuildTrainingDrillId,
  parseGuildTrainingState,
  todayGuildTrainingKey,
} from "@/adventure/data/v2/guildTrainingGround";

const TRAINING_SAVE_KEY = "guild-training.v1";

type CharacterSave = Record<string, unknown> & {
  class?: unknown;
  specChoice?: unknown;
  level?: unknown;
  gold?: unknown;
};

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
  const dayKey = todayGuildTrainingKey();
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
  return Response.json({
    ok: true,
    dayKey,
    hasTrainingGround: trainingGroundLevel > 0,
    trainingGroundLevel,
    upgrade,
    currentJob: current.job
      ? {
          id: current.job.id,
          name: current.job.name,
          mastery: current.mastery,
        }
      : null,
    drills: guildTrainingDrillViews({
      state,
      buildingLevel: trainingGroundLevel,
      characterLevel,
      hasJob: current.hasJob,
      currentClass: current.group,
    }),
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
    const dayKey = todayGuildTrainingKey();
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

    const nextGold =
      Math.max(0, Math.floor(Number(charSave.gold) || 0)) + drill.rewardGold;
    let prof = current.prof;
    prof = addCumLevel(prof, current.group, drill.rewardMastery);
    prof = addJobCumLevel(prof, current.jobId, drill.rewardMastery);
    const masteryAfter =
      current.job != null
        ? cumLevelForJob(prof, current.job)
        : groupCumLevel(prof, current.group);
    const nextState = claimGuildTrainingDrill(state, drillId);

    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: nextGold,
    });
    await upsertSave(tx, userId, "proficiency.v2", prof);
    await upsertSave(tx, userId, TRAINING_SAVE_KEY, nextState);

    return {
      status: 200,
      body: {
        ok: true as const,
        dayKey,
        drill,
        rewardMastery: drill.rewardMastery,
        rewardGold: drill.rewardGold,
        masteryAfter,
        gold: nextGold,
        claimed: nextState.claimed,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
