import { and, eq, isNull } from "drizzle-orm";
import { GUILD_EMBLEM_CHANGE_COST } from "@/adventure/data/guild-emblems";
import { db } from "@/db";
import { guildMembers, guilds } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { verifyGuildEmblemImage } from "@/lib/server/guildEmblemImage";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";

// POST /api/v2/guild/emblem — 길드 엠블럼 등록·교체·제거(마스터 전용).
// body: { emblem: "https://i.imgur.com/...jpg" | null }
// 새 URL 등록·교체는 길드 자금 5천만 G. 같은 URL 재저장과 제거(null)는 무료다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:guild:emblem",
    userLimit: 10,
    ipLimit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { emblem?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const clearing = body.emblem === null;
  const checked = clearing ? null : await verifyGuildEmblemImage(body.emblem);
  if (checked && !checked.ok) {
    return Response.json(
      { ok: false, error: checked.error },
      { status: checked.error === "image_unreachable" ? 422 : 400 },
    );
  }
  const emblem = checked?.url ?? null;

  const result = await db.transaction(async (tx) => {
    const [member] = await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1);
    if (!member) {
      return { status: 403, body: { ok: false as const, error: "no_guild" } };
    }

    const [guild] = await tx
      .select({ masterId: guilds.masterId, emblem: guilds.emblem })
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
    if (guild.masterId !== userId) {
      return { status: 403, body: { ok: false as const, error: "not_master" } };
    }

    if (guild.emblem === emblem) {
      return {
        status: 200,
        body: { ok: true as const, emblem, cost: 0, unchanged: true as const },
      };
    }

    let cost = 0;
    let guildGold: number | undefined;
    if (emblem !== null) {
      cost = GUILD_EMBLEM_CHANGE_COST;
      const resources = await lockGuildResources(tx, member.guildId);
      if (resources.gold < cost) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "insufficient_gold",
            cost,
            gold: resources.gold,
          },
        };
      }
      guildGold = resources.gold - cost;
      await upsertGuildResources(tx, member.guildId, { gold: guildGold });
    }

    await tx
      .update(guilds)
      .set({ emblem })
      .where(eq(guilds.id, member.guildId));
    await logGuildActivity(tx, {
      guildId: member.guildId,
      type: "emblem_change",
      actorUserId: userId,
      meta: { amount: cost },
    });

    return {
      status: 200,
      body: { ok: true as const, emblem, cost, guildGold },
    };
  });

  return Response.json(result.body, { status: result.status });
}
