import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdminRole, currentAdminEmail } from "@/lib/server/isAdmin";
import { logAdminAction } from "@/lib/server/adminAudit";
import {
  clearAdminImpersonation,
  getActiveAdminImpersonation,
  isAdminImpersonationEnabled,
  setAdminImpersonation,
} from "@/lib/server/adminImpersonation";

async function superAdminSession() {
  const gate = await requireAdminRole("super");
  if (gate) return { gate, session: null };
  const session = await auth();
  if (!session?.user?.id) {
    return { gate: new Response("unauthorized", { status: 401 }), session: null };
  }
  return { gate: null, session };
}

export async function GET() {
  const { gate, session } = await superAdminSession();
  if (gate || !session) return gate;

  const enabled = isAdminImpersonationEnabled();
  const active = enabled ? await getActiveAdminImpersonation() : null;
  if (!active) return Response.json({ ok: true, enabled, active: null });

  const [target] = await db
    .select({ id: users.id, gameName: users.gameName, email: users.email })
    .from(users)
    .where(eq(users.id, active.targetUserId))
    .limit(1);
  return Response.json({
    ok: true,
    enabled,
    active: target
      ? {
          targetUserId: target.id,
          gameName: target.gameName,
          email: target.email,
          expiresAt: active.expiresAt,
        }
      : null,
  });
}

export async function POST(req: Request) {
  const { gate, session } = await superAdminSession();
  if (gate || !session) return gate;
  if (!isAdminImpersonationEnabled()) {
    return Response.json(
      { ok: false, error: "impersonation_disabled" },
      { status: 403 },
    );
  }
  if (await getActiveAdminImpersonation()) {
    return Response.json(
      { ok: false, error: "already_active" },
      { status: 409 },
    );
  }

  let body: { userId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!targetUserId || targetUserId === session.user.id) {
    return Response.json({ ok: false, error: "invalid_target" }, { status: 400 });
  }
  const [target] = await db
    .select({ id: users.id, gameName: users.gameName, email: users.email })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!target) {
    return Response.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }

  const active = await setAdminImpersonation(session.user.id, target.id);
  await logAdminAction({
    adminEmail: await currentAdminEmail(),
    action: "impersonation.start",
    targetUserId: target.id,
    detail: {
      gameName: target.gameName,
      expiresAt: new Date(active.expiresAt).toISOString(),
    },
  });
  return Response.json({
    ok: true,
    active: {
      targetUserId: target.id,
      gameName: target.gameName,
      email: target.email,
      expiresAt: active.expiresAt,
    },
  });
}

export async function DELETE() {
  const { gate } = await superAdminSession();
  if (gate) return gate;
  const active = await getActiveAdminImpersonation();
  await clearAdminImpersonation();
  if (active) {
    await logAdminAction({
      adminEmail: await currentAdminEmail(),
      action: "impersonation.end",
      targetUserId: active.targetUserId,
      detail: { startedAt: new Date(active.issuedAt).toISOString() },
    });
  }
  return Response.json({ ok: true });
}
