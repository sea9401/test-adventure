import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  GUILD_MANAGER_LIMIT,
  GUILD_ROLE_MANAGER,
} from "@/lib/server/guildAdmin";
import { logGuildActivity } from "@/lib/server/guildActivityLog";

// POST /api/v2/guild/role — 길드원 직책 변경 (마스터 전용).
//
// body: { targetUserId, role: "manager" | "member" }
//   - manager(관리자): 길드 관리탭 접근, 가입 신청 처리, 시설 관리.
//   - 관리자 임명은 길드당 최대 2명.
//   - member: 직책 해임.
// 제약: 마스터 본인(=masterId) 직책은 변경 불가, 같은 길드 멤버만.

const ASSIGNABLE_ROLES = [GUILD_ROLE_MANAGER, "member"] as const;

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { targetUserId?: unknown; role?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.targetUserId !== "string" || body.targetUserId.length === 0) {
    return Response.json({ ok: false, error: "bad_target" }, { status: 400 });
  }
  if (
    typeof body.role !== "string" ||
    !(ASSIGNABLE_ROLES as readonly string[]).includes(body.role)
  ) {
    return Response.json({ ok: false, error: "bad_role" }, { status: 400 });
  }
  const targetUserId = body.targetUserId;
  const role = body.role;

  const result = await db.transaction(async (tx) => {
    // 내 길드 + 마스터 검증.
    const [mem] = await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1);
    if (!mem) {
      return { status: 403, body: { ok: false as const, error: "no_guild" } };
    }
    const [guild] = await tx
      .select({ masterId: guilds.masterId })
      .from(guilds)
      .where(eq(guilds.id, mem.guildId))
      .for("update")
      .limit(1);
    if (!guild || guild.masterId !== userId) {
      return {
        status: 403,
        body: { ok: false as const, error: "not_master" },
      };
    }
    // 마스터 본인 직책은 role 컬럼이 아니라 masterId 가 원천 — 변경 불가.
    if (targetUserId === guild.masterId) {
      return {
        status: 400,
        body: { ok: false as const, error: "target_is_master" },
      };
    }
    const [targetMem] = await tx
      .select({ role: guildMembers.role })
      .from(guildMembers)
      .where(
        and(
          eq(guildMembers.guildId, mem.guildId),
          eq(guildMembers.userId, targetUserId),
        ),
      )
      .limit(1);
    if (!targetMem) {
      return {
        status: 404,
        body: { ok: false as const, error: "target_not_member" },
      };
    }
    if (targetMem.role === role) {
      return {
        status: 200,
        body: { ok: true as const, role, changed: false },
      };
    }
    if (role === GUILD_ROLE_MANAGER) {
      const managerRows = await tx
        .select({ userId: guildMembers.userId })
        .from(guildMembers)
        .where(
          and(
            eq(guildMembers.guildId, mem.guildId),
            inArray(guildMembers.role, [GUILD_ROLE_MANAGER, "vice_master"]),
            ne(guildMembers.userId, targetUserId),
          ),
        )
        .limit(GUILD_MANAGER_LIMIT);
      if (managerRows.length >= GUILD_MANAGER_LIMIT) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "manager_limit",
            limit: GUILD_MANAGER_LIMIT,
          },
        };
      }
    }
    await tx
      .update(guildMembers)
      .set({ role })
      .where(
        and(
          eq(guildMembers.guildId, mem.guildId),
          eq(guildMembers.userId, targetUserId),
        ),
      );
    await logGuildActivity(tx, {
      guildId: mem.guildId,
      type: "role_change",
      actorUserId: userId,
      targetUserId,
      meta: { role },
    });
    return { status: 200, body: { ok: true as const, role, changed: true } };
  });

  return Response.json(result.body, { status: result.status });
}
