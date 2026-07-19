import { and, eq, isNull } from "drizzle-orm";
import { GUILD_DESCRIPTION_MAX } from "@/adventure/data/guild";
import { db } from "@/db";
import { guildMembers, guilds } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

// POST /api/v2/guild/description — 길드 소개 저장(마스터 전용).
// body: { description: string }, 공백만 입력하면 소개를 제거한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:guild:description:update",
    userLimit: 20,
    ipLimit: 100,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { description?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.description !== "string") {
    return Response.json(
      { ok: false, error: "bad_description" },
      { status: 400 },
    );
  }
  const description = body.description.trim();
  if (description.length > GUILD_DESCRIPTION_MAX) {
    return Response.json(
      {
        ok: false,
        error: "description_too_long",
        maxLength: GUILD_DESCRIPTION_MAX,
      },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const member = (
      await tx
        .select({ guildId: guildMembers.guildId })
        .from(guildMembers)
        .where(eq(guildMembers.userId, userId))
        .limit(1)
    )[0];
    if (!member) {
      return { status: 403, body: { ok: false as const, error: "no_guild" } };
    }

    const guild = (
      await tx
        .select({ masterId: guilds.masterId })
        .from(guilds)
        .where(and(eq(guilds.id, member.guildId), isNull(guilds.disbandedAt)))
        .for("update")
        .limit(1)
    )[0];
    if (!guild) {
      return {
        status: 404,
        body: { ok: false as const, error: "guild_not_found" },
      };
    }
    if (guild.masterId !== userId) {
      return {
        status: 403,
        body: { ok: false as const, error: "not_master" },
      };
    }

    await tx
      .update(guilds)
      .set({ description: description || null })
      .where(eq(guilds.id, member.guildId));

    return {
      status: 200,
      body: { ok: true as const, description: description || null },
    };
  });

  return Response.json(result.body, { status: result.status });
}
