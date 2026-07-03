import { eq } from "drizzle-orm";
import { db } from "@/db";
import { guildLeaveCooldown, users } from "@/db/schema";
import { logAdminAction } from "@/lib/server/adminAudit";
import { currentAdminEmail, requireAdmin } from "@/lib/server/isAdmin";

async function userExists(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows.length > 0;
}

// GET /api/admin/users/guild-cooldown?userId=<id>
// 대상 유저의 길드 탈퇴/추방 쿨다운 만료 시각. row 가 없거나 이미 지났으면 null.
export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return new Response("missing userId", { status: 400 });
  if (!(await userExists(userId))) {
    return new Response("user not found", { status: 404 });
  }

  const rows = await db
    .select({ cooldownUntil: guildLeaveCooldown.cooldownUntil })
    .from(guildLeaveCooldown)
    .where(eq(guildLeaveCooldown.userId, userId))
    .limit(1);

  const until = rows[0]?.cooldownUntil ?? null;
  const active = until !== null && until.getTime() > Date.now();
  return Response.json({ cooldownUntil: active ? until!.toISOString() : null });
}

// DELETE /api/admin/users/guild-cooldown?userId=<id>
// 길드 탈퇴 쿨다운 row 삭제 → 대상 유저는 즉시 다른 길드 가입/생성 가능.
export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return new Response("missing userId", { status: 400 });
  if (!(await userExists(userId))) {
    return new Response("user not found", { status: 404 });
  }

  const removed = await db
    .delete(guildLeaveCooldown)
    .where(eq(guildLeaveCooldown.userId, userId))
    .returning({ userId: guildLeaveCooldown.userId });

  await logAdminAction({
    adminEmail: await currentAdminEmail(),
    action: "guild-cooldown.clear",
    targetUserId: userId,
    detail: { cleared: removed.length > 0 },
  });

  return Response.json({ ok: true, cleared: removed.length > 0 });
}
