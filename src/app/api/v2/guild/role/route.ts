import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  GUILD_ROLE_MANAGER,
  GUILD_ROLE_VICE_MASTER,
} from "@/lib/server/guildAdmin";
import { logGuildActivity } from "@/lib/server/guildActivityLog";

// POST /api/v2/guild/role — 길드원 직책 변경 (마스터 전용).
//
// body: { targetUserId, role: "vice_master" | "manager" | "member" }
//   - vice_master(부마스터)·manager(관리자): 길드 관리탭 접근 — 초대·가입 신청
//     수락/거절·거점 세율/정책. (권한 동일 — 부마스터는 서열 표시용 상급 직책.)
//   - member: 직책 해임.
// 제약: 마스터 본인(=masterId) 직책은 변경 불가, 같은 길드 멤버만.

const ASSIGNABLE_ROLES = [
  GUILD_ROLE_VICE_MASTER,
  GUILD_ROLE_MANAGER,
  "member",
] as const;

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
