import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import {
  GUILD_CONTRIBUTION_CATEGORIES,
  GUILD_NON_PERSONAL_CONTRIBUTION_SOURCES,
  type GuildContributionCategory,
} from "@/adventure/data/v2/guildContribution";
import { db } from "@/db";
import {
  guildActivityRollups,
  guildActivityLog,
  guildContributionEvents,
  guildMembers,
} from "@/db/schema";
import { kstWeekMondayKey } from "@/lib/kst";
import { ensureUser } from "@/lib/server/ensureUser";
import type { GuildActivityMeta } from "@/lib/server/guildActivityLog";
import { canViewGuildContributionDetails } from "@/lib/server/guildContributionAccess";

type Ctx = { params: Promise<{ userId: string }> };

function emptyCategoryPoints(): Record<GuildContributionCategory, number> {
  return Object.fromEntries(
    GUILD_CONTRIBUTION_CATEGORIES.map((category) => [category, 0]),
  ) as Record<GuildContributionCategory, number>;
}

function isContributionCategory(value: string): value is GuildContributionCategory {
  return GUILD_CONTRIBUTION_CATEGORIES.includes(
    value as GuildContributionCategory,
  );
}

// GET /api/v2/guild/contributions/[userId]
// 길드장·관리자만 같은 길드에 현재 소속된 길드원의 상세 기여 내역을 조회한다.
export async function GET(_req: Request, { params }: Ctx) {
  const viewerUserId = await ensureUser();
  if (!viewerUserId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const viewer = (
    await db
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(eq(guildMembers.userId, viewerUserId))
      .limit(1)
  )[0];
  if (!viewer) {
    return Response.json({ ok: false, error: "no_guild" }, { status: 403 });
  }
  if (!canViewGuildContributionDetails(viewer.role)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId: targetUserId } = await params;
  const target = (
    await db
      .select({ userId: guildMembers.userId })
      .from(guildMembers)
      .where(
        and(
          eq(guildMembers.guildId, viewer.guildId),
          eq(guildMembers.userId, targetUserId),
        ),
      )
      .limit(1)
  )[0];
  if (!target) {
    return Response.json(
      { ok: false, error: "member_not_found" },
      { status: 404 },
    );
  }

  const weekKey = kstWeekMondayKey();
  const weekStartsAt = new Date(`${weekKey}T00:00:00+09:00`);
  const personalContributionWhere = and(
    eq(guildContributionEvents.guildId, viewer.guildId),
    eq(guildContributionEvents.userId, targetUserId),
    notInArray(guildContributionEvents.source, [
      ...GUILD_NON_PERSONAL_CONTRIBUTION_SOURCES,
    ]),
  );

  const archivedWhere = and(
    eq(guildActivityRollups.guildId, viewer.guildId),
    eq(guildActivityRollups.userId, targetUserId),
    eq(guildActivityRollups.periodKey, "lifetime"),
    notInArray(guildActivityRollups.source, [
      ...GUILD_NON_PERSONAL_CONTRIBUTION_SOURCES,
    ]),
  );
  const [categoryRows, archivedCategoryRows, goldRows, archivedGoldRows, eventRows] = await Promise.all([
    db
      .select({
        category: guildContributionEvents.category,
        lifetimePoints: sql<number>`coalesce(sum(${guildContributionEvents.points}), 0)::int`,
        weeklyPoints: sql<number>`coalesce(sum(${guildContributionEvents.points}) filter (where ${guildContributionEvents.createdAt} >= ${weekStartsAt}), 0)::int`,
      })
      .from(guildContributionEvents)
      .where(personalContributionWhere)
      .groupBy(guildContributionEvents.category),
    db
      .select({
        category: guildActivityRollups.category,
        lifetimePoints: sql<number>`coalesce(sum(${guildActivityRollups.contributionPoints}), 0)::bigint`,
      })
      .from(guildActivityRollups)
      .where(archivedWhere)
      .groupBy(guildActivityRollups.category),
    db
      .select({
        lifetimeGoldDeposited: sql<number>`coalesce(sum(case when ${guildContributionEvents.source} = 'gold_deposit' and jsonb_typeof(${guildActivityLog.meta}->'amount') = 'number' then (${guildActivityLog.meta}->>'amount')::bigint else 0 end), 0)::bigint`,
        weeklyGoldDeposited: sql<number>`coalesce(sum(case when ${guildContributionEvents.source} = 'gold_deposit' and ${guildContributionEvents.createdAt} >= ${weekStartsAt} and jsonb_typeof(${guildActivityLog.meta}->'amount') = 'number' then (${guildActivityLog.meta}->>'amount')::bigint else 0 end), 0)::bigint`,
      })
      .from(guildContributionEvents)
      .innerJoin(
        guildActivityLog,
        eq(guildActivityLog.id, guildContributionEvents.activityLogId),
      )
      .where(personalContributionWhere),
    db
      .select({
        lifetimeGoldDeposited: sql<number>`coalesce(sum(${guildActivityRollups.goldAmount}) filter (where ${guildActivityRollups.source} = 'gold_deposit'), 0)::bigint`,
      })
      .from(guildActivityRollups)
      .where(archivedWhere),
    db
      .select({
        id: guildContributionEvents.id,
        source: guildContributionEvents.source,
        category: guildContributionEvents.category,
        points: guildContributionEvents.points,
        createdAt: guildContributionEvents.createdAt,
        meta: guildActivityLog.meta,
      })
      .from(guildContributionEvents)
      .innerJoin(
        guildActivityLog,
        eq(guildActivityLog.id, guildContributionEvents.activityLogId),
      )
      .where(personalContributionWhere)
      .orderBy(desc(guildContributionEvents.createdAt))
      .limit(100),
  ]);

  const weeklyByCategory = emptyCategoryPoints();
  const lifetimeByCategory = emptyCategoryPoints();
  for (const row of categoryRows) {
    if (!isContributionCategory(row.category)) continue;
    weeklyByCategory[row.category] = Number(row.weeklyPoints) || 0;
    lifetimeByCategory[row.category] = Number(row.lifetimePoints) || 0;
  }
  for (const row of archivedCategoryRows) {
    if (!isContributionCategory(row.category)) continue;
    lifetimeByCategory[row.category] += Number(row.lifetimePoints) || 0;
  }
  const weeklyPoints = Object.values(weeklyByCategory).reduce(
    (sum, points) => sum + points,
    0,
  );
  const lifetimePoints = Object.values(lifetimeByCategory).reduce(
    (sum, points) => sum + points,
    0,
  );
  const gold = goldRows[0];
  const archivedGold = archivedGoldRows[0];

  return Response.json({
    ok: true,
    userId: target.userId,
    weekStartsAt: weekStartsAt.toISOString(),
    weeklyPoints,
    lifetimePoints,
    weeklyGoldDeposited: Number(gold?.weeklyGoldDeposited) || 0,
    lifetimeGoldDeposited:
      (Number(gold?.lifetimeGoldDeposited) || 0) +
      (Number(archivedGold?.lifetimeGoldDeposited) || 0),
    weeklyByCategory,
    lifetimeByCategory,
    events: eventRows.flatMap((row) =>
      isContributionCategory(row.category)
        ? [
            {
              id: row.id,
              source: row.source,
              category: row.category,
              points: row.points,
              createdAt: row.createdAt.toISOString(),
              meta: (row.meta ?? null) as GuildActivityMeta | null,
            },
          ]
        : [],
    ),
  });
}
