import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import { addGuildFame } from "@/lib/server/v2GuildFame";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { getGuildIdByUser } from "@/lib/server/v2EnsureSoloGuild";
import {
  currentGuildExplorationWeek,
  explorationHqLevelForGuild,
  lockGuildExplorationWeeklyState,
  readGuildExplorationWeeklyState,
  saveGuildExplorationWeeklyState,
} from "@/lib/server/guildExplorationWeekly";
import {
  GUILD_EXPLORATION_WEEKLY_MISSIONS,
  claimGuildExplorationWeeklyMission,
  guildExplorationWeeklyMissionViews,
  isGuildExplorationWeeklyMissionId,
} from "@/adventure/data/v2/guildExploration";
import { explorationHqUpgradeForLevel } from "@/adventure/data/v2/settlement";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const guildId = await getGuildIdByUser(userId);
  if (guildId == null) {
    return Response.json({ ok: false, error: "no_guild" }, { status: 403 });
  }

  const week = currentGuildExplorationWeek();
  const result = await db.transaction(async (tx) => {
    const level = await explorationHqLevelForGuild(tx, guildId);
    if (level <= 0) {
      return {
        status: 409,
        body: { ok: false as const, error: "exploration_hq_required" },
      };
    }
    const upgrade = explorationHqUpgradeForLevel(level);
    const state = await readGuildExplorationWeeklyState(tx, guildId, week.key);
    return {
      status: 200,
      body: {
        ok: true as const,
        weekKey: week.key,
        endsAt: week.endsAt.toISOString(),
        explorationHqLevel: level,
        weeklyMissionCount: upgrade.weeklyMissionCount,
        progressBonusPct: upgrade.missionProgressBonusPct,
        state,
        missions: guildExplorationWeeklyMissionViews(
          state,
          upgrade.weeklyMissionCount,
        ),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { missionId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!isGuildExplorationWeeklyMissionId(body.missionId)) {
    return Response.json(
      { ok: false, error: "invalid_mission" },
      { status: 400 },
    );
  }

  const guildId = await getGuildIdByUser(userId);
  if (guildId == null) {
    return Response.json({ ok: false, error: "no_guild" }, { status: 403 });
  }

  const week = currentGuildExplorationWeek();
  const result = await db.transaction(async (tx) => {
    const level = await explorationHqLevelForGuild(tx, guildId);
    if (level <= 0) {
      return {
        status: 409,
        body: { ok: false as const, error: "exploration_hq_required" },
      };
    }
    const upgrade = explorationHqUpgradeForLevel(level);
    const state = await lockGuildExplorationWeeklyState(tx, guildId, week.key);
    const views = guildExplorationWeeklyMissionViews(
      state,
      upgrade.weeklyMissionCount,
    );
    const view = views.find((mission) => mission.id === body.missionId);
    if (!view) {
      return {
        status: 400,
        body: { ok: false as const, error: "invalid_mission" as const },
      };
    }
    if (view.claimed) {
      return {
        status: 409,
        body: { ok: false as const, error: "already_claimed" as const },
      };
    }
    if (!view.complete) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "not_complete" as const,
          missions: views,
        },
      };
    }

    const resources = await lockGuildResources(tx, guildId);
    await upsertGuildResources(tx, guildId, {
      gold: resources.gold + view.rewardGold,
    });
    await addGuildFame(tx, guildId, view.rewardFame);
    const nextState = claimGuildExplorationWeeklyMission(state, view.id);
    await saveGuildExplorationWeeklyState(tx, guildId, nextState);
    await logGuildActivity(tx, {
      guildId,
      type: "exploration_weekly_claim",
      actorUserId: userId,
      meta: {
        questTitle: GUILD_EXPLORATION_WEEKLY_MISSIONS[view.id].title,
        rewardGold: view.rewardGold,
        rewardFame: view.rewardFame,
      },
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        weekKey: week.key,
        endsAt: week.endsAt.toISOString(),
        explorationHqLevel: level,
        weeklyMissionCount: upgrade.weeklyMissionCount,
        progressBonusPct: upgrade.missionProgressBonusPct,
        state: nextState,
        missions: guildExplorationWeeklyMissionViews(
          nextState,
          upgrade.weeklyMissionCount,
        ),
        rewardGold: view.rewardGold,
        rewardFame: view.rewardFame,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
