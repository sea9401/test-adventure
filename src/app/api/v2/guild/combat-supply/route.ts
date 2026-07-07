import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  GUILD_COMBAT_SUPPLY_LIST,
  GUILD_COMBAT_SUPPLY_MAX_LEVEL,
  guildCombatSupplyNextCost,
  isGuildCombatSupplyId,
  parseGuildCombatSupplyLevels,
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
  role: string | null;
  levels: GuildCombatSupplyLevels;
}) {
  return {
    ok: true as const,
    fameTotal: Math.max(0, args.fameTotal),
    fameAvailable: Math.max(0, args.fameAvailable),
    canUpgrade: isGuildManagerRole(args.role),
    levels: args.levels,
    supplies: combatSupplyViews(args.levels),
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
    })
    .from(guildMembers)
    .innerJoin(guilds, eq(guilds.id, guildMembers.guildId))
    .where(and(eq(guildMembers.userId, userId), isNull(guilds.disbandedAt)))
    .limit(1);
  if (!row) {
    return Response.json({ ok: false, error: "no_guild" }, { status: 403 });
  }

  return Response.json(
    responseBody({
      fameTotal: row.fameTotal,
      fameAvailable: row.fameAvailable,
      role: row.role,
      levels: parseGuildCombatSupplyLevels(row.buffs),
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

  let body: { supplyId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!isGuildCombatSupplyId(body.supplyId)) {
    return Response.json(
      { ok: false, error: "invalid_supply" },
      { status: 400 },
    );
  }
  const supplyId = body.supplyId;

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

    const levels = parseGuildCombatSupplyLevels(guild.buffs);
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
      new Date().toISOString(),
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
        role: member.role,
        levels: nextLevels,
      }),
    };
  });

  return Response.json(result.body, { status: result.status });
}
