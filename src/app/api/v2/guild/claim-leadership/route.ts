import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds, presence } from "@/db/schema";
import { canClaimGuildLeadership } from "@/adventure/data/guildLeadership";
import { ensureUser } from "@/lib/server/ensureUser";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { resolveActor } from "@/lib/server/resolveActor";

// POST — 현재 길드원이 72시간 미접속한 길드장의 자리를 승계한다.
// 기존 양도/추방/해산과 동일하게 길드 → 멤버십 순서로 잠근다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { expectedMasterId?: unknown } | null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body?.expectedMasterId !== "string" || !body.expectedMasterId) {
    return Response.json({ ok: false, error: "bad_target" }, { status: 400 });
  }
  const expectedMasterId = body.expectedMasterId;
  const { name, className, title } = await resolveActor(userId);
  const result = await db.transaction(async (tx) => {
    const reject = (status: number, error: string) => ({
      status, body: { ok: false as const, error },
    });
    const [membership] = await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1);
    if (!membership) return reject(403, "no_guild");
    const guildId = membership.guildId;

    const [guild] = await tx
      .select({ masterId: guilds.masterId, disbandedAt: guilds.disbandedAt })
      .from(guilds)
      .where(eq(guilds.id, guildId))
      .for("update")
      .limit(1);
    if (!guild || guild.disbandedAt) return reject(404, "guild_not_found");
    if (guild.masterId === userId) return reject(409, "already_master");
    if (guild.masterId !== expectedMasterId) return reject(409, "master_changed");

    // 길드 잠금을 기다리는 동안 탈퇴/추방되었을 수 있으므로 같은 길드 소속을 재검증한다.
    const [currentMember] = await tx
      .select({ userId: guildMembers.userId })
      .from(guildMembers)
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId)))
      .for("update")
      .limit(1);
    if (!currentMember) return reject(403, "no_guild");

    // 하트비트 갱신과 직렬화한다. 복귀 기록이 먼저 커밋되었다면 새 시각으로 판정한다.
    const [masterPresence] = await tx
      .select({ lastSeenAt: presence.lastSeenAt })
      .from(presence)
      .where(eq(presence.userId, guild.masterId))
      .for("update")
      .limit(1);
    const now = new Date();
    if (!canClaimGuildLeadership(masterPresence?.lastSeenAt, now.getTime())) {
      return reject(409, "master_active");
    }

    await tx.update(guilds).set({ masterId: userId }).where(eq(guilds.id, guildId));
    await tx.update(guildMembers).set({ role: "master" }).where(
      and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId)),
    );
    await tx.update(guildMembers).set({ role: "member" }).where(
      and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, guild.masterId)),
    );
    // 신청 자체가 활동이므로 즉시 반영한다. 하트비트보다 먼저 신청해도 연속 승계를 막는다.
    await tx.insert(presence).values({ userId, name, className, title, lastSeenAt: now })
      .onConflictDoUpdate({ target: presence.userId, set: { lastSeenAt: now } });
    await logGuildActivity(tx, {
      guildId,
      type: "leadership_claim",
      actorUserId: userId,
      targetUserId: guild.masterId,
    });
    return { status: 200, body: { ok: true as const, newMasterId: userId } };
  });
  return Response.json(result.body, { status: result.status });
}
