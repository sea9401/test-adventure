import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { normalizeGuildLevel } from "@/adventure/data/guild";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/guilds/:id — 게임 안에서 보는 간단한 공개 길드 정보.
// 랭킹 정보창에서 선택한 길드의 최신 소개와 길드원 명단만 가볍게 조회한다.
export async function GET(_req: Request, { params }: Ctx) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const guildId = Number((await params).id);
  if (!Number.isSafeInteger(guildId) || guildId <= 0) {
    return Response.json({ ok: false, error: "bad_guild_id" }, { status: 400 });
  }

  const guild = (
    await db
      .select({
        id: guilds.id,
        name: guilds.name,
        masterId: guilds.masterId,
        description: guilds.description,
        nationName: guilds.nationName,
        level: guilds.level,
      })
      .from(guilds)
      .where(and(eq(guilds.id, guildId), isNull(guilds.disbandedAt)))
      .limit(1)
  )[0];
  if (!guild) {
    return Response.json(
      { ok: false, error: "guild_not_found" },
      { status: 404 },
    );
  }

  const memberRows = await db
    .select({
      userId: guildMembers.userId,
      role: guildMembers.role,
      joinedAt: guildMembers.joinedAt,
    })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId));
  const memberIds = memberRows.map((member) => member.userId);

  const [profileRows, characterRows] =
    memberIds.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select({ userId: savesKv.userId, value: savesKv.value })
            .from(savesKv)
            .where(
              and(
                inArray(savesKv.userId, memberIds),
                eq(savesKv.key, "character-profile.v2"),
              ),
            ),
          db
            .select({ userId: savesKv.userId, value: savesKv.value })
            .from(savesKv)
            .where(
              and(
                inArray(savesKv.userId, memberIds),
                eq(savesKv.key, "character.v2"),
              ),
            ),
        ]);

  const nameByUser = new Map<string, string>();
  for (const row of profileRows) {
    const value = (row.value ?? null) as { name?: unknown } | null;
    const name = typeof value?.name === "string" ? value.name.trim() : "";
    if (name) nameByUser.set(row.userId, name);
  }
  const levelByUser = new Map<string, number>();
  for (const row of characterRows) {
    const value = (row.value ?? null) as { level?: unknown } | null;
    if (
      typeof value?.level === "number" &&
      Number.isFinite(value.level) &&
      value.level > 0
    ) {
      levelByUser.set(row.userId, Math.floor(value.level));
    }
  }

  const roleOrder: Record<string, number> = { master: 0, manager: 1, member: 2 };
  const members = memberRows
    .map((member) => {
      const role =
        member.userId === guild.masterId
          ? "master"
          : member.role === "manager" || member.role === "vice_master"
            ? "manager"
            : "member";
      return {
        name: nameByUser.get(member.userId) ?? null,
        level: levelByUser.get(member.userId) ?? 1,
        role,
        joinedAt: member.joinedAt,
      };
    })
    .sort((a, b) => {
      const byRole = roleOrder[a.role] - roleOrder[b.role];
      if (byRole !== 0) return byRole;
      return a.joinedAt.getTime() - b.joinedAt.getTime();
    })
    .map(({ joinedAt: _joinedAt, ...member }) => member);

  return Response.json({
    ok: true,
    guild: {
      id: guild.id,
      name: guild.name,
      description: guild.description,
      nationName: guild.nationName,
      level: normalizeGuildLevel(guild.level),
    },
    members,
  });
}
