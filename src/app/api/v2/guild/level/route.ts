import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds } from "@/db/schema";
import { guildLevelUpgradeCost, normalizeGuildLevel } from "@/adventure/data/guild";
import { ensureUser } from "@/lib/server/ensureUser";
import { isAdminRole } from "@/lib/server/guildAdmin";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";

// POST /api/v2/guild/level — 마스터/관리자가 사용 가능 명성과 길드 금고 골드를
// 함께 소비해 길드 레벨을 한 단계 올린다. 길드 자원→길드 행 순으로 잠가 다른
// 시설 결제·동시 승급과 직렬화하며, 두 재화 차감과 레벨 변경은 한 tx 로 처리한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:guild:level:upgrade",
    userLimit: 10,
    ipLimit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const result = await db.transaction(async (tx) => {
      const [member] = await tx
        .select({ guildId: guildMembers.guildId, role: guildMembers.role })
        .from(guildMembers)
        .where(eq(guildMembers.userId, userId))
        .limit(1);
      if (!member) {
        return { status: 403, body: { ok: false as const, error: "no_guild" } };
      }
      if (member.role !== "master" && !isAdminRole(member.role)) {
        return {
          status: 403,
          body: { ok: false as const, error: "not_allowed" },
        };
      }

      // 전역 결제 잠금 순서: guild_resources → guilds.
      const resources = await lockGuildResources(tx, member.guildId);
      const [guild] = await tx
        .select({
          level: guilds.level,
          fameAvailable: guilds.fameAvailable,
        })
        .from(guilds)
        .where(and(eq(guilds.id, member.guildId), isNull(guilds.disbandedAt)))
        .for("update")
        .limit(1);
      if (!guild) {
        return {
          status: 404,
          body: { ok: false as const, error: "guild_not_found" },
        };
      }

      const currentLevel = normalizeGuildLevel(guild.level);
      const cost = guildLevelUpgradeCost(currentLevel);
      if (!cost) {
        return { status: 409, body: { ok: false as const, error: "maxed" } };
      }
      if (guild.fameAvailable < cost.fame) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "insufficient_fame",
            fameAvailable: guild.fameAvailable,
            required: cost.fame,
          },
        };
      }
      if (resources.gold < cost.gold) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "insufficient_gold",
            guildGold: resources.gold,
            required: cost.gold,
          },
        };
      }

      const fameAvailable = guild.fameAvailable - cost.fame;
      const guildGold = resources.gold - cost.gold;
      await tx
        .update(guilds)
        .set({
          level: cost.nextLevel,
          fameAvailable: sql`${guilds.fameAvailable} - ${cost.fame}`,
        })
        .where(eq(guilds.id, member.guildId));
      await upsertGuildResources(tx, member.guildId, { gold: guildGold });
      await logGuildActivity(tx, {
        guildId: member.guildId,
        type: "guild_level_upgrade",
        actorUserId: userId,
        meta: {
          guildLevel: cost.nextLevel,
          fameCost: cost.fame,
          goldCost: cost.gold,
        },
      });

      return {
        status: 200,
        body: {
          ok: true as const,
          level: cost.nextLevel,
          fameAvailable,
          guildGold,
          nextCost: guildLevelUpgradeCost(cost.nextLevel),
        },
      };
    });

    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error("[guild.level.upgrade] failed", error);
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
