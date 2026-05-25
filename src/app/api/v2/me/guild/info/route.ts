import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";

// GET /api/v2/me/guild/info — 길드 정보 + 멤버 list (V2GuildHome).
//
// 응답:
//   guild: { id, name, masterId, createdAt, fameTotal, description }
//   members: [{ userId, role, joinedAt, name, level }]
//
// 길드 미가입 → guild=null, members=[].

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 1) 사용자가 어느 길드 멤버인지.
  const memRow = (
    await db
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1)
  )[0];
  if (!memRow) {
    return Response.json({ ok: true, guild: null, members: [] });
  }
  const guildId = memRow.guildId;

  // 2) 길드 메타.
  const guildRow = (
    await db
      .select({
        id: guilds.id,
        name: guilds.name,
        masterId: guilds.masterId,
        createdAt: guilds.createdAt,
        fameTotal: guilds.fameTotal,
        description: guilds.description,
      })
      .from(guilds)
      .where(eq(guilds.id, guildId))
      .limit(1)
  )[0];
  if (!guildRow) {
    return Response.json({ ok: true, guild: null, members: [] });
  }

  // 3) 멤버 row (userId·role·joinedAt).
  const memberRows = await db
    .select({
      userId: guildMembers.userId,
      role: guildMembers.role,
      joinedAt: guildMembers.joinedAt,
    })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId));

  // 4) 멤버 이름·레벨 — character.v2 + character-profile.v2 batch.
  const memberIds = memberRows.map((m) => m.userId);
  const [profileRows, charRows] = await Promise.all([
    memberIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ userId: savesKv.userId, value: savesKv.value })
          .from(savesKv)
          .where(
            and(
              inArray(savesKv.userId, memberIds),
              eq(savesKv.key, "character-profile.v2"),
            ),
          ),
    memberIds.length === 0
      ? Promise.resolve([])
      : db
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
  for (const r of profileRows) {
    const v = (r.value ?? null) as { name?: string } | null;
    const n = v?.name?.trim();
    if (n) nameByUser.set(r.userId, n);
  }
  const levelByUser = new Map<string, number>();
  for (const r of charRows) {
    const v = (r.value ?? null) as { level?: number } | null;
    if (typeof v?.level === "number") levelByUser.set(r.userId, v.level);
  }

  const members = memberRows.map((m) => ({
    userId: m.userId,
    role: m.role,
    joinedAt: m.joinedAt,
    name: nameByUser.get(m.userId) ?? "모험가",
    level: levelByUser.get(m.userId) ?? 1,
  }));
  // master 먼저, 그 다음 joinedAt 오름차순.
  members.sort((a, b) => {
    if (a.role === "master" && b.role !== "master") return -1;
    if (a.role !== "master" && b.role === "master") return 1;
    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  });

  return Response.json({
    ok: true,
    guild: guildRow,
    members,
  });
}
