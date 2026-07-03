import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostVillages } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { getGuildIdByUser } from "@/lib/server/v2EnsureSoloGuild";
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
  isJobUnlocked,
  V2_JOB_LIST,
  V2_JOB_CATALOG,
  cumLevelForJob,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  emptyV2SkillsState,
  equippedGuildTrainingBonuses,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  nextTrainingGroundUpgrade,
  settlementBuildingIdOf,
  settlementBuildingLevelOf,
  settlementBuildingUpgradeCostText,
  settlementBuildingUpgradeSummary,
  trainingGroundUpgradeForLevel,
} from "@/adventure/data/v2/settlement";
import {
  claimGuildTrainingDrill,
  GUILD_TRAINING_WEEKLY_BONUS_MASTERY,
  GUILD_TRAINING_WEEKLY_BONUS_TARGET,
  guildTrainingDayWindow,
  guildTrainingDrillViews,
  isGuildTrainingDrillId,
  parseGuildTrainingState,
  recommendedGuildTrainingDrill,
  todayGuildTrainingWeekKey,
} from "@/adventure/data/v2/guildTrainingGround";
import { nextSpMilestoneProgressForCumLevel } from "@/adventure/data/v2/coreLoopConfig";

const TRAINING_SAVE_KEY = "guild-training.v1";

type CharacterSave = Record<string, unknown> & {
  class?: unknown;
  specChoice?: unknown;
  level?: unknown;
};

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
  const groupMastery = hasJob ? groupCumLevel(prof, group) : null;
  return { cls, group, jobId, job, prof, hasJob, mastery, groupMastery };
}

function nextJobGoal(current: ReturnType<typeof currentJobInfo>) {
  if (!current.hasJob || !current.job) return null;
  const candidates = V2_JOB_LIST.flatMap((job) => {
    if (job.id === current.jobId || isJobUnlocked(job, current.prof)) {
      return [];
    }
    const required = job.unlock.prereqs[current.jobId];
    if (required == null) return [];
    const actual = cumLevelForJob(current.prof, current.job!);
    const remaining = Math.max(0, required - actual);
    if (remaining <= 0) return [];
    return [
      {
        jobId: job.id,
        name: job.name,
        requiredMastery: required,
        currentMastery: actual,
        remainingMastery: remaining,
      },
    ];
  });
  return candidates.sort((a, b) => a.remainingMastery - b.remainingMastery)[0] ?? null;
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const guildId = await getGuildIdByUser(userId);
  if (guildId == null) {
    return Response.json({ ok: false, error: "no_guild" }, { status: 403 });
  }

  const trainingGroundLevel = await guildTrainingGroundLevel(guildId);
  const { dayKey } = guildTrainingDayWindow();
  const weekKey = todayGuildTrainingWeekKey();
  const [charSave, profRaw, trainingRaw, skillsRaw] = await Promise.all([
    readSave<CharacterSave | null>(db, userId, "character.v2", null),
    readSave<V2ProficiencyState | null>(db, userId, "proficiency.v2", null),
    readSave<Record<string, unknown> | null>(db, userId, TRAINING_SAVE_KEY, null),
    readSave(db, userId, "skills.v2", emptyV2SkillsState()),
  ]);
  if (!charSave) {
    return Response.json({ ok: false, error: "no_character" }, { status: 400 });
  }

  const current = currentJobInfo(charSave, profRaw);
  const characterLevel = Math.max(1, Math.floor(Number(charSave.level) || 1));
  const state = parseGuildTrainingState(trainingRaw, dayKey, weekKey);
  const trainingBonuses = equippedGuildTrainingBonuses(
    parseV2SkillsState(skillsRaw).equipped,
  );
  const upgrade = trainingGroundUpgradeForLevel(Math.max(1, trainingGroundLevel));
  const nextUpgrade = nextTrainingGroundUpgrade(trainingGroundLevel);
  const drills = guildTrainingDrillViews({
    state,
    buildingLevel: trainingGroundLevel,
    characterLevel,
    hasJob: current.hasJob,
    currentClass: current.group,
    rewardBonusPct: trainingBonuses.rewardBonusPct,
  });
  const claimedCount = drills.filter((drill) => drill.claimed).length;
  const availableCount = drills.filter((drill) => drill.available).length;
  const dailyClaimLimit = Math.max(1, upgrade.unlockedDrillCount);
  const remainingClaims = Math.max(0, dailyClaimLimit - claimedCount);
  const recommendedDrill = recommendedGuildTrainingDrill(drills);
  const nextSp =
    current.groupMastery != null
      ? nextSpMilestoneProgressForCumLevel(current.groupMastery)
      : null;
  return Response.json({
    ok: true,
    dayKey,
    hasTrainingGround: trainingGroundLevel > 0,
    trainingGroundLevel,
    upgrade,
    nextUpgrade: nextUpgrade
      ? {
          level: nextUpgrade.level,
          label: nextUpgrade.label,
          trainingRewardBonusPct: nextUpgrade.trainingRewardBonusPct,
          unlockedDrillCount: nextUpgrade.unlockedDrillCount,
          costText: settlementBuildingUpgradeCostText(nextUpgrade.cost),
          summary: settlementBuildingUpgradeSummary(
            "training_ground",
            nextUpgrade,
          ),
        }
      : null,
    claimedCount,
    availableCount,
    remainingClaims,
    claimableCount: Math.min(availableCount, remainingClaims),
    recommendedDrillId: recommendedDrill?.id ?? null,
    weekly: {
      weekKey,
      completed: state.weeklyClaims ?? 0,
      target: GUILD_TRAINING_WEEKLY_BONUS_TARGET,
      bonusMastery:
        GUILD_TRAINING_WEEKLY_BONUS_MASTERY +
        trainingBonuses.weeklyBonusMastery,
      bonusClaimed: state.weeklyBonusClaimed === true,
    },
    trainingBonuses,
    goals: {
      nextSp,
      nextJob: nextJobGoal(current),
    },
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

  const guildId = await getGuildIdByUser(userId);
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
    const weekKey = todayGuildTrainingWeekKey();
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
    const skillsRaw = await lockSaveForUpdate(
      tx,
      userId,
      "skills.v2",
      emptyV2SkillsState(),
    );
    const current = currentJobInfo(charSave, profRaw);
    const characterLevel = Math.max(1, Math.floor(Number(charSave.level) || 1));
    const state = parseGuildTrainingState(trainingRaw, dayKey, weekKey);
    const trainingBonuses = equippedGuildTrainingBonuses(
      parseV2SkillsState(skillsRaw).equipped,
    );
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
      rewardBonusPct: trainingBonuses.rewardBonusPct,
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

    const claim = claimGuildTrainingDrill(state, drillId);
    const weeklyBonusMastery =
      claim.weeklyBonusMastery > 0
        ? claim.weeklyBonusMastery + trainingBonuses.weeklyBonusMastery
        : 0;
    const totalRewardMastery = drill.rewardMastery + weeklyBonusMastery;
    let prof = current.prof;
    prof = addCumLevel(prof, current.group, totalRewardMastery);
    prof = addJobCumLevel(prof, current.jobId, totalRewardMastery);
    const masteryAfter =
      current.job != null
        ? cumLevelForJob(prof, current.job)
        : groupCumLevel(prof, current.group);
    const nextState = claim.state;

    await upsertSave(tx, userId, "proficiency.v2", prof);
    await upsertSave(tx, userId, TRAINING_SAVE_KEY, nextState);
    await logGuildActivity(tx, {
      guildId,
      type: "training_drill_claim",
      actorUserId: userId,
      meta: {
        drillTitle: drill.title,
        rewardMastery: totalRewardMastery,
      },
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        dayKey,
        drill,
        rewardMastery: totalRewardMastery,
        baseRewardMastery: drill.rewardMastery,
        weeklyBonusMastery,
        masteryAfter,
        claimed: nextState.claimed,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
