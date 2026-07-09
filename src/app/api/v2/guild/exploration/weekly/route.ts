import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import { addGuildFame } from "@/lib/server/v2GuildFame";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { isGuildAdmin } from "@/lib/server/guildAdmin";
import { getGuildIdByUser } from "@/lib/server/v2EnsureSoloGuild";
import {
  currentGuildExplorationWeek,
  explorationHqLevelForGuild,
  lockGuildExplorationWeeklyState,
  readGuildExplorationWeeklyState,
  saveGuildExplorationWeeklyState,
} from "@/lib/server/guildExplorationWeekly";
import {
  GUILD_EXPLORATION_EVENTS,
  GUILD_EXPLORATION_EXPEDITIONS,
  GUILD_EXPLORATION_MAP_FRAGMENT_TARGET,
  GUILD_EXPLORATION_WEEKLY_MISSIONS,
  claimGuildExplorationExpedition,
  claimGuildExplorationWeeklyMission,
  guildExplorationWeeklyMissionViews,
  isGuildExplorationEventChoiceId,
  isGuildExplorationExpeditionId,
  isGuildExplorationWeeklyMissionId,
  resolveGuildExplorationEvent,
  restoreGuildExplorationMap,
  startGuildExplorationExpedition,
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
        content: state.content,
        expeditions: GUILD_EXPLORATION_EXPEDITIONS,
        events: GUILD_EXPLORATION_EVENTS,
        mapFragmentTarget: GUILD_EXPLORATION_MAP_FRAGMENT_TARGET,
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

  let body: {
    action?: unknown;
    missionId?: unknown;
    expeditionId?: unknown;
    choiceId?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const action =
    typeof body.action === "string" ? body.action : "claim_mission";
  if (
    action === "claim_mission" &&
    !isGuildExplorationWeeklyMissionId(body.missionId)
  ) {
    return Response.json(
      { ok: false, error: "invalid_mission" },
      { status: 400 },
    );
  }
  if (
    action === "dispatch" &&
    !isGuildExplorationExpeditionId(body.expeditionId)
  ) {
    return Response.json(
      { ok: false, error: "invalid_expedition" },
      { status: 400 },
    );
  }
  if (
    action !== "claim_mission" &&
    action !== "dispatch" &&
    action !== "claim_expedition" &&
    action !== "restore_map" &&
    action !== "resolve_event"
  ) {
    return Response.json(
      { ok: false, error: "invalid_action" },
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
    const baseBody = {
      weekKey: week.key,
      endsAt: week.endsAt.toISOString(),
      explorationHqLevel: level,
      weeklyMissionCount: upgrade.weeklyMissionCount,
      progressBonusPct: upgrade.missionProgressBonusPct,
      expeditions: GUILD_EXPLORATION_EXPEDITIONS,
      events: GUILD_EXPLORATION_EVENTS,
      mapFragmentTarget: GUILD_EXPLORATION_MAP_FRAGMENT_TARGET,
    };

    if (action === "dispatch") {
      if (!(await isGuildAdmin(tx, guildId, userId))) {
        return {
          status: 403,
          body: { ok: false as const, error: "not_authorized" as const },
        };
      }
      const expeditionId = body.expeditionId;
      if (!isGuildExplorationExpeditionId(expeditionId)) {
        return {
          status: 400,
          body: { ok: false as const, error: "invalid_expedition" as const },
        };
      }
      const def = GUILD_EXPLORATION_EXPEDITIONS[expeditionId];
      if (level < def.minLevel) {
        return {
          status: 409,
          body: { ok: false as const, error: "level_required" as const },
        };
      }
      if (state.content.activeExpedition) {
        return {
          status: 409,
          body: { ok: false as const, error: "expedition_active" as const },
        };
      }
      const resources = await lockGuildResources(tx, guildId);
      if (resources.gold < def.costGold) {
        return {
          status: 409,
          body: { ok: false as const, error: "insufficient_gold" as const },
        };
      }
      const nextState = startGuildExplorationExpedition(
        state,
        expeditionId,
        new Date(),
      );
      await upsertGuildResources(tx, guildId, {
        gold: resources.gold - def.costGold,
      });
      await saveGuildExplorationWeeklyState(tx, guildId, nextState);
      await logGuildActivity(tx, {
        guildId,
        type: "exploration_expedition_dispatch",
        actorUserId: userId,
        meta: {
          questTitle: def.name,
          amount: def.costGold,
        },
      });
      return {
        status: 200,
        body: {
          ok: true as const,
          ...baseBody,
          state: nextState,
          content: nextState.content,
          missions: guildExplorationWeeklyMissionViews(
            nextState,
            upgrade.weeklyMissionCount,
          ),
        },
      };
    }

    if (action === "claim_expedition") {
      const claimed = claimGuildExplorationExpedition(state, new Date());
      if (!claimed) {
        return {
          status: 409,
          body: { ok: false as const, error: "expedition_not_ready" as const },
        };
      }
      const resources = await lockGuildResources(tx, guildId);
      await upsertGuildResources(tx, guildId, {
        gold: resources.gold + claimed.reward.rewardGold,
      });
      await addGuildFame(tx, guildId, claimed.reward.rewardFame);
      await saveGuildExplorationWeeklyState(tx, guildId, claimed.state);
      await logGuildActivity(tx, {
        guildId,
        type: "exploration_expedition_claim",
        actorUserId: userId,
        meta: {
          questTitle:
            GUILD_EXPLORATION_EXPEDITIONS[claimed.reward.expeditionId].name,
          rewardGold: claimed.reward.rewardGold,
          rewardFame: claimed.reward.rewardFame,
          mapFragments: claimed.reward.mapFragments,
        },
      });
      return {
        status: 200,
        body: {
          ok: true as const,
          ...baseBody,
          state: claimed.state,
          content: claimed.state.content,
          missions: guildExplorationWeeklyMissionViews(
            claimed.state,
            upgrade.weeklyMissionCount,
          ),
          rewardGold: claimed.reward.rewardGold,
          rewardFame: claimed.reward.rewardFame,
          mapFragments: claimed.reward.mapFragments,
        },
      };
    }

    if (action === "restore_map") {
      if (!(await isGuildAdmin(tx, guildId, userId))) {
        return {
          status: 403,
          body: { ok: false as const, error: "not_authorized" as const },
        };
      }
      const nextState = restoreGuildExplorationMap(state);
      if (!nextState) {
        return {
          status: 409,
          body: { ok: false as const, error: "map_not_ready" as const },
        };
      }
      await saveGuildExplorationWeeklyState(tx, guildId, nextState);
      return {
        status: 200,
        body: {
          ok: true as const,
          ...baseBody,
          state: nextState,
          content: nextState.content,
          missions: guildExplorationWeeklyMissionViews(
            nextState,
            upgrade.weeklyMissionCount,
          ),
        },
      };
    }

    if (action === "resolve_event") {
      if (!(await isGuildAdmin(tx, guildId, userId))) {
        return {
          status: 403,
          body: { ok: false as const, error: "not_authorized" as const },
        };
      }
      const pendingEvent = state.content.pendingEvent;
      if (
        !pendingEvent ||
        !isGuildExplorationEventChoiceId(pendingEvent.eventId, body.choiceId)
      ) {
        return {
          status: 409,
          body: { ok: false as const, error: "invalid_event_choice" as const },
        };
      }
      const resolved = resolveGuildExplorationEvent(state, body.choiceId);
      if (!resolved) {
        return {
          status: 409,
          body: { ok: false as const, error: "invalid_event_choice" as const },
        };
      }
      const resources = await lockGuildResources(tx, guildId);
      await upsertGuildResources(tx, guildId, {
        gold: resources.gold + (resolved.choice.rewardGold ?? 0),
      });
      if (resolved.choice.rewardFame) {
        await addGuildFame(tx, guildId, resolved.choice.rewardFame);
      }
      await saveGuildExplorationWeeklyState(tx, guildId, resolved.state);
      await logGuildActivity(tx, {
        guildId,
        type: "exploration_event_resolve",
        actorUserId: userId,
        meta: {
          questTitle: resolved.event.title,
          deliveryTitle: resolved.choice.label,
          rewardGold: resolved.choice.rewardGold,
          rewardFame: resolved.choice.rewardFame,
          mapFragments: resolved.choice.mapFragments,
        },
      });
      return {
        status: 200,
        body: {
          ok: true as const,
          ...baseBody,
          state: resolved.state,
          content: resolved.state.content,
          missions: guildExplorationWeeklyMissionViews(
            resolved.state,
            upgrade.weeklyMissionCount,
          ),
          rewardGold: resolved.choice.rewardGold,
          rewardFame: resolved.choice.rewardFame,
          mapFragments: resolved.choice.mapFragments,
        },
      };
    }

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
        content: nextState.content,
        expeditions: GUILD_EXPLORATION_EXPEDITIONS,
        events: GUILD_EXPLORATION_EVENTS,
        mapFragmentTarget: GUILD_EXPLORATION_MAP_FRAGMENT_TARGET,
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
