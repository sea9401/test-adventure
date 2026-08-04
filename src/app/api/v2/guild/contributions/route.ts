import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { guildContributionEvents, guildMembers } from "@/db/schema";
import {
  GUILD_CONTRIBUTION_CATEGORIES,
  GUILD_NON_PERSONAL_CONTRIBUTION_SOURCES,
  type GuildContributionCategory,
} from "@/adventure/data/v2/guildContribution";
import { ensureUser } from "@/lib/server/ensureUser";
import { kstWeekMondayKey } from "@/lib/kst";

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

// GET /api/v2/guild/contributions — 현재 길드원별 이번 주(KST 월 00:00)·누적 기여 점수.
// 탈퇴자의 기록은 원장에 보존하지만 현재 길드 순위에는 노출하지 않는다.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const member = (
    await db
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1)
  )[0];
  if (!member) {
    return Response.json({
      ok: true,
      viewerUserId: userId,
      weekStartsAt: null,
      rows: [],
    });
  }

  const weekKey = kstWeekMondayKey();
  const weekStartsAt = new Date(`${weekKey}T00:00:00+09:00`);
  const members = await db
    .select({ userId: guildMembers.userId })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, member.guildId));

  // 과거에 이미 적립된 공동 의뢰 수령 이벤트도 개인 순위에서 소급 제외한다.
  // 이벤트와 활동 로그 자체는 감사 가능하도록 삭제하지 않는다.
  const personalContributionWhere = and(
    eq(guildContributionEvents.guildId, member.guildId),
    notInArray(guildContributionEvents.source, [
      ...GUILD_NON_PERSONAL_CONTRIBUTION_SOURCES,
    ]),
  );

  const totals = await db
    .select({
      userId: guildContributionEvents.userId,
      lifetimePoints: sql<number>`coalesce(sum(${guildContributionEvents.points}), 0)::int`,
      weeklyPoints: sql<number>`coalesce(sum(${guildContributionEvents.points}) filter (where ${guildContributionEvents.createdAt} >= ${weekStartsAt}), 0)::int`,
    })
    .from(guildContributionEvents)
    .where(personalContributionWhere)
    .groupBy(guildContributionEvents.userId);

  const categories = await db
    .select({
      userId: guildContributionEvents.userId,
      category: guildContributionEvents.category,
      lifetimePoints: sql<number>`coalesce(sum(${guildContributionEvents.points}), 0)::int`,
      weeklyPoints: sql<number>`coalesce(sum(${guildContributionEvents.points}) filter (where ${guildContributionEvents.createdAt} >= ${weekStartsAt}), 0)::int`,
    })
    .from(guildContributionEvents)
    .where(personalContributionWhere)
    .groupBy(
      guildContributionEvents.userId,
      guildContributionEvents.category,
    );

  const totalByUser = new Map(totals.map((row) => [row.userId, row]));
  const categoryByUser = new Map<
    string,
    {
      weekly: Record<GuildContributionCategory, number>;
      lifetime: Record<GuildContributionCategory, number>;
    }
  >();
  for (const row of categories) {
    if (!isContributionCategory(row.category)) continue;
    const values = categoryByUser.get(row.userId) ?? {
      weekly: emptyCategoryPoints(),
      lifetime: emptyCategoryPoints(),
    };
    values.weekly[row.category] = Number(row.weeklyPoints) || 0;
    values.lifetime[row.category] = Number(row.lifetimePoints) || 0;
    categoryByUser.set(row.userId, values);
  }

  const rows = members
    .map(({ userId: memberUserId }) => {
      const total = totalByUser.get(memberUserId);
      const byCategory = categoryByUser.get(memberUserId) ?? {
        weekly: emptyCategoryPoints(),
        lifetime: emptyCategoryPoints(),
      };
      return {
        userId: memberUserId,
        weeklyPoints: Number(total?.weeklyPoints) || 0,
        lifetimePoints: Number(total?.lifetimePoints) || 0,
        weeklyByCategory: byCategory.weekly,
        lifetimeByCategory: byCategory.lifetime,
      };
    })
    .sort(
      (a, b) =>
        b.weeklyPoints - a.weeklyPoints ||
        b.lifetimePoints - a.lifetimePoints ||
        a.userId.localeCompare(b.userId),
    );

  return Response.json({
    ok: true,
    viewerUserId: userId,
    weekStartsAt: weekStartsAt.toISOString(),
    rows,
  });
}
