import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds, v2GuildResources } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import { kstWeekMondayKey } from "@/lib/kst";
import {
  GUILD_COMBAT_OPERATIONS_MAX_TIER,
  GUILD_COMBAT_SUPPLY_LIST,
  GUILD_COMBAT_SUPPLY_MAX_LEVEL,
  guildCombatOperationsNextCost,
  guildCombatSupplyNextCost,
  isGuildCombatSupplyId,
  parseGuildCombatOperationsTier,
  parseGuildCombatSupplyLevels,
  upsertGuildCombatOperationsBuff,
  upsertGuildCombatSupplyBuff,
  type GuildCombatSupplyId,
  type GuildCombatSupplyLevels,
} from "@/adventure/data/v2/guildCombatSupply";

type CombatSupplyView = {
  id: GuildCombatSupplyId;
  name: string;
  shortName: string;
  description: string;
  level: number;
  maxLevel: number;
  currentEffect: string;
  nextEffect: string | null;
  nextCost: number | null;
  maxed: boolean;
};

function isGuildManagerRole(role: string | null | undefined): boolean {
  return role === "master" || role === "manager";
}

function combatSupplyViews(
  levels: GuildCombatSupplyLevels,
): CombatSupplyView[] {
  return GUILD_COMBAT_SUPPLY_LIST.map((def) => {
    const level = levels[def.id];
    const nextCost = guildCombatSupplyNextCost(level);
    return {
      id: def.id,
      name: def.name,
      shortName: def.shortName,
      description: def.description,
      level,
      maxLevel: GUILD_COMBAT_SUPPLY_MAX_LEVEL,
      currentEffect: def.effectLabel(level),
      nextEffect:
        nextCost == null || level >= GUILD_COMBAT_SUPPLY_MAX_LEVEL
          ? null
          : def.effectLabel(level + 1),
      nextCost,
      maxed: level >= GUILD_COMBAT_SUPPLY_MAX_LEVEL,
    };
  });
}

function responseBody(args: {
  fameTotal: number;
  fameAvailable: number;
  guildGold: number;
  role: string | null;
  buffs: unknown;
  levels: GuildCombatSupplyLevels;
  now: Date;
}) {
  const operationsTier = parseGuildCombatOperationsTier(args.buffs, args.now);
  return {
    ok: true as const,
    fameTotal: Math.max(0, args.fameTotal),
    fameAvailable: Math.max(0, args.fameAvailable),
    guildGold: Math.max(0, args.guildGold),
    canUpgrade: isGuildManagerRole(args.role),
    levels: args.levels,
    supplies: combatSupplyViews(args.levels),
    operations: {
      weekKey: kstWeekMondayKey(args.now),
      tier: operationsTier,
      maxTier: GUILD_COMBAT_OPERATIONS_MAX_TIER,
      nextCost: guildCombatOperationsNextCost(operationsTier),
      goldPct: operationsTier,
      expPct: operationsTier,
      proficiencyChancePct: operationsTier * 5,
    },
  };
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [row] = await db
    .select({
      role: guildMembers.role,
      fameTotal: guilds.fameTotal,
      fameAvailable: guilds.fameAvailable,
      buffs: guilds.buffs,
      guildGold: v2GuildResources.gold,
    })
    .from(guildMembers)
    .innerJoin(guilds, eq(guilds.id, guildMembers.guildId))
    .leftJoin(
      v2GuildResources,
      eq(v2GuildResources.guildId, guildMembers.guildId),
    )
    .where(and(eq(guildMembers.userId, userId), isNull(guilds.disbandedAt)))
    .limit(1);
  if (!row) {
    return Response.json({ ok: false, error: "no_guild" }, { status: 403 });
  }

  return Response.json(
    responseBody({
      fameTotal: row.fameTotal,
      fameAvailable: row.fameAvailable,
      guildGold: row.guildGold ?? 0,
      role: row.role,
      buffs: row.buffs,
      levels: parseGuildCombatSupplyLevels(row.buffs),
      now: new Date(),
    }),
  );
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:guild:combat-supply:upgrade",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { supplyId?: unknown; action?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const fundOperations = body.action === "fund_operations";
  if (!fundOperations && !isGuildCombatSupplyId(body.supplyId)) {
    return Response.json(
      {
        ok: false,
        error: body.action == null ? "invalid_supply" : "invalid_action",
      },
      { status: 400 },
    );
  }
  const supplyId = isGuildCombatSupplyId(body.supplyId)
    ? body.supplyId
    : null;
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const [member] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1);
    if (!member) {
      return { status: 403, body: { ok: false as const, error: "no_guild" } };
    }
    if (!isGuildManagerRole(member.role)) {
      return {
        status: 403,
        body: { ok: false as const, error: "not_allowed" },
      };
    }

    // 전역 결제 잠금 순서: guild_resources → guilds.
    const resources = await lockGuildResources(tx, member.guildId);
    const [guild] = await tx
      .select({
        fameTotal: guilds.fameTotal,
        fameAvailable: guilds.fameAvailable,
        buffs: guilds.buffs,
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

    if (fundOperations) {
      const currentTier = parseGuildCombatOperationsTier(guild.buffs, now);
      const cost = guildCombatOperationsNextCost(currentTier);
      if (cost == null) {
        return {
          status: 409,
          body: { ok: false as const, error: "operations_maxed" },
        };
      }
      if (resources.gold < cost) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "insufficient_gold",
            guildGold: resources.gold,
            required: cost,
          },
        };
      }

      const nextTier = currentTier + 1;
      const nextGuildGold = resources.gold - cost;
      const nextBuffs = upsertGuildCombatOperationsBuff(
        guild.buffs,
        nextTier,
        now.toISOString(),
      );
      await tx
        .update(guilds)
        .set({ buffs: nextBuffs })
        .where(eq(guilds.id, member.guildId));
      await upsertGuildResources(tx, member.guildId, { gold: nextGuildGold });
      await logGuildActivity(tx, {
        guildId: member.guildId,
        type: "combat_supply_funding",
        actorUserId: userId,
        meta: { operationsTier: nextTier, goldCost: cost },
      });

      return {
        status: 200,
        body: responseBody({
          fameTotal: guild.fameTotal,
          fameAvailable: guild.fameAvailable,
          guildGold: nextGuildGold,
          role: member.role,
          buffs: nextBuffs,
          levels: parseGuildCombatSupplyLevels(guild.buffs),
          now,
        }),
      };
    }

    const levels = parseGuildCombatSupplyLevels(guild.buffs);
    if (!supplyId) {
      return {
        status: 400,
        body: { ok: false as const, error: "invalid_supply" },
      };
    }
    const currentLevel = levels[supplyId];
    const cost = guildCombatSupplyNextCost(currentLevel);
    if (cost == null) {
      return { status: 409, body: { ok: false as const, error: "maxed" } };
    }
    if (guild.fameAvailable < cost) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "insufficient_fame",
          fameAvailable: guild.fameAvailable,
          required: cost,
        },
      };
    }

    const nextLevel = currentLevel + 1;
    const nextBuffs = upsertGuildCombatSupplyBuff(
      guild.buffs,
      supplyId,
      nextLevel,
      now.toISOString(),
    );
    await tx
      .update(guilds)
      .set({
        fameAvailable: sql`${guilds.fameAvailable} - ${cost}`,
        buffs: nextBuffs,
      })
      .where(eq(guilds.id, member.guildId));

    const def = GUILD_COMBAT_SUPPLY_LIST.find((s) => s.id === supplyId);
    await logGuildActivity(tx, {
      guildId: member.guildId,
      type: "combat_supply_upgrade",
      actorUserId: userId,
      meta: {
        supplyName: def?.name ?? supplyId,
        supplyLevel: nextLevel,
        fameCost: cost,
      },
    });

    const nextLevels = { ...levels, [supplyId]: nextLevel };
    return {
      status: 200,
      body: responseBody({
        fameTotal: guild.fameTotal,
        fameAvailable: guild.fameAvailable - cost,
        guildGold: resources.gold,
        role: member.role,
        buffs: nextBuffs,
        levels: nextLevels,
        now,
      }),
    };
  });

  return Response.json(result.body, { status: result.status });
}
