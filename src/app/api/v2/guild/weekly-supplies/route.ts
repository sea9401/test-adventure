import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds, marketplaceInbox, v2GuildResources } from "@/db/schema";
import {
  GUILD_WEEKLY_SUPPLIES_COST,
  GUILD_WEEKLY_SUPPLIES_POTIONS,
  guildWeeklySuppliesFunded,
  markGuildWeeklySuppliesFunded,
} from "@/adventure/data/v2/guildWeeklySupplies";
import { ensureUser } from "@/lib/server/ensureUser";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { inboxValues } from "@/lib/server/inboxPayload";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockGuildResources, upsertGuildResources } from "@/lib/server/v2GuildResources";
import { kstWeekMondayKey } from "@/lib/kst";

function isManager(role: string): boolean {
  return role === "master" || role === "manager";
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const [row] = await db.select({
    role: guildMembers.role,
    buffs: guilds.buffs,
    guildGold: v2GuildResources.gold,
  }).from(guildMembers)
    .innerJoin(guilds, eq(guilds.id, guildMembers.guildId))
    .leftJoin(v2GuildResources, eq(v2GuildResources.guildId, guildMembers.guildId))
    .where(and(eq(guildMembers.userId, userId), isNull(guilds.disbandedAt)))
    .limit(1);
  if (!row) return Response.json({ ok: false, error: "no_guild" }, { status: 403 });
  const now = new Date();
  return Response.json({
    ok: true,
    weekKey: kstWeekMondayKey(now),
    funded: guildWeeklySuppliesFunded(row.buffs, now),
    cost: GUILD_WEEKLY_SUPPLIES_COST,
    potionsPerMember: GUILD_WEEKLY_SUPPLIES_POTIONS,
    guildGold: row.guildGold ?? 0,
    canFund: isManager(row.role),
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:guild:weekly-supplies:fund",
    userLimit: 10,
    ipLimit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const result = await db.transaction(async (tx) => {
    const [member] = await tx.select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers).where(eq(guildMembers.userId, userId)).limit(1);
    if (!member) return { status: 403, body: { ok: false, error: "no_guild" } };
    if (!isManager(member.role)) return { status: 403, body: { ok: false, error: "not_allowed" } };

    // 기존 길드 결제 경로와 같은 잠금 순서: 길드 자금 → 길드 행.
    const resources = await lockGuildResources(tx, member.guildId);
    const [guild] = await tx.select({ name: guilds.name, buffs: guilds.buffs })
      .from(guilds)
      .where(and(eq(guilds.id, member.guildId), isNull(guilds.disbandedAt)))
      .for("update").limit(1);
    if (!guild) return { status: 404, body: { ok: false, error: "guild_not_found" } };
    const now = new Date();
    if (guildWeeklySuppliesFunded(guild.buffs, now)) {
      return { status: 409, body: { ok: false, error: "already_funded" } };
    }
    if (resources.gold < GUILD_WEEKLY_SUPPLIES_COST) {
      return { status: 409, body: { ok: false, error: "insufficient_gold", guildGold: resources.gold } };
    }

    const recipients = await tx.select({ userId: guildMembers.userId })
      .from(guildMembers).where(eq(guildMembers.guildId, member.guildId))
      .orderBy(guildMembers.userId);
    const nextGold = resources.gold - GUILD_WEEKLY_SUPPLIES_COST;
    await tx.update(guilds)
      .set({ buffs: markGuildWeeklySuppliesFunded(guild.buffs, now) })
      .where(eq(guilds.id, member.guildId));
    await upsertGuildResources(tx, member.guildId, { gold: nextGold });
    await tx.insert(marketplaceInbox).values(recipients.map(({ userId: recipientId }) => inboxValues({
      userId: recipientId,
      message: `${guild.name} 주간 길드 지원품: 귀속 스태미나 회복약 ${GUILD_WEEKLY_SUPPLIES_POTIONS}개를 받아 주세요.`,
      payload: {
        kind: "admin_gift",
        source: "guild_weekly_supplies",
        gold: 0,
        materials: [],
        items: [],
        staminaPotions: GUILD_WEEKLY_SUPPLIES_POTIONS,
        staminaPotionsBound: true,
        museunCoins: 0,
        cashItems: [],
        adventureSupportDays: 0,
      },
    })));
    await logGuildActivity(tx, {
      guildId: member.guildId,
      type: "weekly_supplies_funding",
      actorUserId: userId,
      meta: { goldCost: GUILD_WEEKLY_SUPPLIES_COST, recipientCount: recipients.length },
    });
    return {
      status: 200,
      body: { ok: true, weekKey: kstWeekMondayKey(now), funded: true, guildGold: nextGold, recipientCount: recipients.length },
    };
  });
  return Response.json(result.body, { status: result.status });
}
