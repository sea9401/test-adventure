import { and, desc, eq, isNull, inArray } from "drizzle-orm";
import { db } from "@/db";
import { users, userSanctions } from "@/db/schema";
import {
  currentAdminEmail,
  requireAdmin,
  requireAdminRole,
} from "@/lib/server/isAdmin";
import { logAdminAction } from "@/lib/server/adminAudit";

// 유저 제재 — 밴/정지/경고 부과 + 해제 + 이력 조회. requireAdmin 게이트.
//   GET  ?userId=...        → 현재 차단 상태 + 제재 이력
//   POST { userId, action, reason?, days? }
//        action: 'ban'(영구) | 'suspend'(기간, days 필수) | 'extend'(기간 연장) | 'warn'(경고) | 'lift'(해제)
//
// 차단 enforcement 는 users.bannedUntil 비정규화 필드(ensureUser 가 검사). 이 라우트는
// 그 필드 + user_sanctions 이력을 함께 갱신한다. 모든 변경은 감사 로그에 기록.

// 영구 밴의 bannedUntil 센티넬 — 사실상 무한(Postgres timestamp 범위 내).
const PERMANENT = new Date("9999-12-31T00:00:00.000Z");

const ACTIONS = ["ban", "suspend", "extend", "warn", "lift"] as const;
type Action = (typeof ACTIONS)[number];
function isAction(v: unknown): v is Action {
  return typeof v === "string" && (ACTIONS as readonly string[]).includes(v);
}

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const userId = new URL(req.url).searchParams.get("userId") ?? "";
  if (!userId) {
    return Response.json({ ok: false, error: "missing userId" }, { status: 400 });
  }

  const [u] = await db
    .select({ bannedUntil: users.bannedUntil, banReason: users.banReason })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) {
    return Response.json({ ok: false, error: "user not found" }, { status: 404 });
  }

  const history = await db
    .select()
    .from(userSanctions)
    .where(eq(userSanctions.userId, userId))
    .orderBy(desc(userSanctions.id))
    .limit(50);

  const now = Date.now();
  const banned = !!(u.bannedUntil && u.bannedUntil.getTime() > now);
  return Response.json({
    ok: true,
    banned,
    bannedUntil: u.bannedUntil?.toISOString() ?? null,
    banReason: u.banReason ?? null,
    permanent: !!(u.bannedUntil && u.bannedUntil.getTime() >= PERMANENT.getTime()),
    sanctions: history,
  });
}

export async function POST(req: Request) {
  const gate = await requireAdminRole("sanction");
  if (gate) return gate;
  const adminEmail = await currentAdminEmail();

  let body: { userId?: unknown; action?: unknown; reason?: unknown; days?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  const action = body.action;
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : "";
  const days = typeof body.days === "number" ? body.days : 0;

  if (!userId || !isAction(action)) {
    return Response.json(
      { ok: false, error: "userId + valid action required", allowed: ACTIONS },
      { status: 400 },
    );
  }
  if ((action === "suspend" || action === "extend") && (!Number.isFinite(days) || days <= 0)) {
    return Response.json(
      { ok: false, error: `${action} requires days > 0` },
      { status: 400 },
    );
  }

  const [target] = await db
    .select({ id: users.id, gameName: users.gameName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) {
    return Response.json({ ok: false, error: "user not found" }, { status: 404 });
  }

  const now = new Date();

  if (action === "lift") {
    await db
      .update(users)
      .set({ bannedUntil: null, banReason: null, updatedAt: now })
      .where(eq(users.id, userId));
    // 활성(미해제) 밴/정지 이력을 해제 처리(경고는 건드리지 않음).
    await db
      .update(userSanctions)
      .set({ liftedAt: now, liftedByEmail: adminEmail })
      .where(
        and(
          eq(userSanctions.userId, userId),
          isNull(userSanctions.liftedAt),
          inArray(userSanctions.type, ["ban", "suspend"]),
        ),
      );
    await logAdminAction({
      adminEmail,
      action: "sanction.lift",
      targetUserId: userId,
      detail: { gameName: target.gameName },
    });
    return Response.json({ ok: true, action, banned: false });
  }

  // ban / suspend / extend / warn
  const expiresAt =
    action === "ban"
      ? PERMANENT
      : action === "suspend" || action === "extend"
        ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
        : null;
  const currentBan = await db
    .select({ bannedUntil: users.bannedUntil })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]?.bannedUntil ?? null);
  const effectiveExpiresAt =
    action === "extend" && currentBan && currentBan.getTime() > now.getTime()
      ? new Date(currentBan.getTime() + days * 24 * 60 * 60 * 1000)
      : expiresAt;

  await db.insert(userSanctions).values({
    userId,
    type: action === "extend" ? "suspend" : action,
    reason,
    expiresAt: effectiveExpiresAt,
    createdByEmail: adminEmail,
  });

  // 경고(warn)는 enforcement 없음 — bannedUntil 미변경.
  if (action !== "warn") {
    await db
      .update(users)
      .set({ bannedUntil: effectiveExpiresAt, banReason: reason || null, updatedAt: now })
      .where(eq(users.id, userId));
  }

  await logAdminAction({
    adminEmail,
    action: `sanction.${action}`,
    targetUserId: userId,
    detail: {
      gameName: target.gameName,
      reason,
      ...(action === "suspend" || action === "extend" ? { days } : {}),
    },
  });

  return Response.json({
    ok: true,
    action,
    banned: action !== "warn",
    bannedUntil: effectiveExpiresAt?.toISOString() ?? null,
  });
}
