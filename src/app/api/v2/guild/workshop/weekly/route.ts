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
  currentGuildWorkshopWeek,
  lockGuildWorkshopWeeklyState,
  readGuildWorkshopWeeklyState,
  saveGuildWorkshopWeeklyState,
} from "@/lib/server/guildWorkshopWeekly";
import {
  GUILD_WORKSHOP_WEEKLY_QUESTS,
  claimGuildWorkshopWeeklyQuest,
  guildWorkshopWeeklyQuestViews,
  isGuildWorkshopWeeklyQuestId,
} from "@/adventure/data/v2/guildWorkshopWeekly";


export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const guildId = await getGuildIdByUser(userId);
  if (guildId == null) {
    return Response.json({ ok: false, error: "no_guild" }, { status: 403 });
  }

  const week = currentGuildWorkshopWeek();
  const state = await db.transaction((tx) =>
    readGuildWorkshopWeeklyState(tx, guildId, week.key),
  );
  return Response.json({
    ok: true,
    weekKey: week.key,
    endsAt: week.endsAt.toISOString(),
    state,
    quests: guildWorkshopWeeklyQuestViews(state),
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { questId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!isGuildWorkshopWeeklyQuestId(body.questId)) {
    return Response.json(
      { ok: false, error: "invalid_quest" },
      { status: 400 },
    );
  }

  const guildId = await getGuildIdByUser(userId);
  if (guildId == null) {
    return Response.json({ ok: false, error: "no_guild" }, { status: 403 });
  }

  const week = currentGuildWorkshopWeek();
  const result = await db.transaction(async (tx) => {
    const state = await lockGuildWorkshopWeeklyState(tx, guildId, week.key);
    const view = guildWorkshopWeeklyQuestViews(state).find(
      (quest) => quest.id === body.questId,
    );
    if (!view) {
      return {
        status: 400,
        body: { ok: false as const, error: "invalid_quest" as const },
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
          quests: guildWorkshopWeeklyQuestViews(state),
        },
      };
    }

    const resources = await lockGuildResources(tx, guildId);
    await upsertGuildResources(tx, guildId, {
      gold: resources.gold + view.rewardGold,
    });
    await addGuildFame(tx, guildId, view.rewardFame);
    const nextState = claimGuildWorkshopWeeklyQuest(state, view.id);
    await saveGuildWorkshopWeeklyState(tx, guildId, nextState);
    await logGuildActivity(tx, {
      guildId,
      type: "workshop_weekly_claim",
      actorUserId: userId,
      meta: {
        questTitle: GUILD_WORKSHOP_WEEKLY_QUESTS[view.id].title,
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
        state: nextState,
        quests: guildWorkshopWeeklyQuestViews(nextState),
        rewardGold: view.rewardGold,
        rewardFame: view.rewardFame,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
