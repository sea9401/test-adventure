import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, savesKv, v2GuildLineups } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";

// GET /api/v2/guild/me/lineup — viewer 의 길드 라인업 조회.
// 응답: { ok: true, guildId, isMaster, members: [{ userId, role, name, level }], lineup: string[] | null }
//
// POST /api/v2/guild/me/lineup — 마스터만 라인업 변경.
// body: { memberUserIds: string[] } — 1~3명, 순서대로. 모두 같은 길드 멤버여야.

const MAX_LINEUP = 3;

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await db.transaction(async (tx) => {
    const guildId = await getGuildId(tx, userId);
    if (guildId == null) {
      return {
        guildId: null as number | null,
        isMaster: false,
        members: [] as Array<{
          userId: string;
          role: string;
          name: string;
          level: number;
        }>,
        lineup: null as string[] | null,
      };
    }
    const memberRows = await tx
      .select({ userId: guildMembers.userId, role: guildMembers.role })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, guildId));
    const memberIds = memberRows.map((m) => m.userId);
    const isMaster = memberRows.some(
      (m) => m.userId === userId && m.role === "master",
    );
    const lineupRow = await tx
      .select({ memberUserIds: v2GuildLineups.memberUserIds })
      .from(v2GuildLineups)
      .where(eq(v2GuildLineups.guildId, guildId))
      .limit(1);

    // 이름·레벨 batch — character-profile.v2 + character.v2.
    const [profileRows, charRows] = await Promise.all([
      memberIds.length === 0
        ? Promise.resolve([])
        : tx
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
        : tx
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
      name: nameByUser.get(m.userId) ?? "모험가",
      level: levelByUser.get(m.userId) ?? 1,
    }));

    return {
      guildId,
      isMaster,
      members,
      lineup: lineupRow[0]?.memberUserIds ?? null,
    };
  });

  return Response.json({ ok: true, ...result });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { memberUserIds?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const list = body.memberUserIds;
  if (
    !Array.isArray(list) ||
    list.length < 1 ||
    list.length > MAX_LINEUP ||
    !list.every((v) => typeof v === "string" && v.length > 0)
  ) {
    return Response.json(
      { ok: false, error: "bad_lineup", max: MAX_LINEUP },
      { status: 400 },
    );
  }
  const ids = list as string[];
  // 중복 차단.
  if (new Set(ids).size !== ids.length) {
    return Response.json(
      { ok: false, error: "duplicate_member" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const guildId = await getGuildId(tx, userId);
    if (guildId == null) {
      return { status: 400, body: { ok: false, error: "no_guild" } };
    }
    const members = await tx
      .select({ userId: guildMembers.userId, role: guildMembers.role })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, guildId));
    const isMaster = members.some(
      (m) => m.userId === userId && m.role === "master",
    );
    if (!isMaster) {
      return { status: 403, body: { ok: false, error: "not_master" } };
    }
    const memberIds = new Set(members.map((m) => m.userId));
    for (const id of ids) {
      if (!memberIds.has(id)) {
        return {
          status: 400,
          body: { ok: false, error: "member_not_in_guild", offending: id },
        };
      }
    }
    await tx
      .insert(v2GuildLineups)
      .values({ guildId, memberUserIds: ids, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: v2GuildLineups.guildId,
        set: { memberUserIds: ids, updatedAt: new Date() },
      });
    return {
      status: 200,
      body: { ok: true as const, guildId, lineup: ids },
    };
  });

  return Response.json(result.body, { status: result.status });
}
