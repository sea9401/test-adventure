import { and, desc, eq, isNull, inArray } from "drizzle-orm";
import { db } from "@/db";
import { users, userSanctions } from "@/db/schema";
import {
  currentAdminEmail,
  requireAdmin,
  requireAdminRole,
} from "@/lib/server/isAdmin";
import { logAdminAction } from "@/lib/server/adminAudit";
import {
  clearActiveTradeExposure,
  type TradeExposureCleanupResult,
} from "@/lib/server/tradeSuspensionCleanup";

export const dynamic = "force-dynamic";

// 영구 밴/거래 정지의 센티넬 — 사실상 무한(Postgres timestamp 범위 내).
const PERMANENT = new Date("9999-12-31T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const ACTIONS = ["ban", "suspend", "extend", "warn", "lift"] as const;
const TRADE_ACTIONS = ["ban", "suspend", "extend", "lift"] as const;
const SCOPES = ["account", "trade"] as const;
type Action = (typeof ACTIONS)[number];
type Scope = (typeof SCOPES)[number];

function isAction(value: unknown): value is Action {
  return (
    typeof value === "string" &&
    (ACTIONS as readonly string[]).includes(value)
  );
}

function isScope(value: unknown): value is Scope {
  return (
    typeof value === "string" &&
    (SCOPES as readonly string[]).includes(value)
  );
}

function emptyCleanup(): TradeExposureCleanupResult {
  return {
    listingsCancelled: 0,
    buyOrdersCancelled: 0,
    highestBidsCleared: 0,
    refundedGold: 0,
  };
}

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const userId = new URL(req.url).searchParams.get("userId") ?? "";
  if (!userId) {
    return Response.json({ ok: false, error: "missing userId" }, { status: 400 });
  }

  const [user] = await db
    .select({
      bannedUntil: users.bannedUntil,
      banReason: users.banReason,
      tradeSuspendedUntil: users.tradeSuspendedUntil,
      tradeSuspensionReason: users.tradeSuspensionReason,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) {
    return Response.json({ ok: false, error: "user not found" }, { status: 404 });
  }

  const history = await db
    .select()
    .from(userSanctions)
    .where(eq(userSanctions.userId, userId))
    .orderBy(desc(userSanctions.id))
    .limit(50);

  const now = Date.now();
  const banned = !!(user.bannedUntil && user.bannedUntil.getTime() > now);
  const tradeSuspended = !!(
    user.tradeSuspendedUntil && user.tradeSuspendedUntil.getTime() > now
  );
  return Response.json({
    ok: true,
    banned,
    bannedUntil: user.bannedUntil?.toISOString() ?? null,
    banReason: user.banReason ?? null,
    permanent: !!(
      user.bannedUntil && user.bannedUntil.getTime() >= PERMANENT.getTime()
    ),
    trade: {
      suspended: tradeSuspended,
      suspendedUntil: user.tradeSuspendedUntil?.toISOString() ?? null,
      reason: user.tradeSuspensionReason ?? null,
      permanent: !!(
        user.tradeSuspendedUntil &&
        user.tradeSuspendedUntil.getTime() >= PERMANENT.getTime()
      ),
    },
    sanctions: history,
  });
}

export async function POST(req: Request) {
  const gate = await requireAdminRole("sanction");
  if (gate) return gate;
  const adminEmail = await currentAdminEmail();

  let body: {
    userId?: unknown;
    scope?: unknown;
    action?: unknown;
    reason?: unknown;
    adminMemo?: unknown;
    days?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  const action = body.action;
  const scopeValue = body.scope ?? "account";
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : "";
  const adminMemo =
    typeof body.adminMemo === "string" ? body.adminMemo.slice(0, 500) : "";
  const days = typeof body.days === "number" ? body.days : 0;

  if (!userId || !isAction(action)) {
    return Response.json(
      { ok: false, error: "userId + valid action required", allowed: ACTIONS },
      { status: 400 },
    );
  }
  if (!isScope(scopeValue)) {
    return Response.json(
      { ok: false, error: "invalid scope", allowed: SCOPES },
      { status: 400 },
    );
  }
  const scope = scopeValue;
  if (
    scope === "trade" &&
    !(TRADE_ACTIONS as readonly string[]).includes(action)
  ) {
    return Response.json(
      { ok: false, error: "invalid trade action", allowed: TRADE_ACTIONS },
      { status: 400 },
    );
  }
  if (
    (action === "suspend" || action === "extend") &&
    (!Number.isFinite(days) || days <= 0)
  ) {
    return Response.json(
      { ok: false, error: `${action} requires days > 0` },
      { status: 400 },
    );
  }
  if (scope === "trade" && action !== "lift" && !reason.trim()) {
    return Response.json(
      { ok: false, error: "trade sanction requires reason" },
      { status: 400 },
    );
  }

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    // 제재와 모든 거래 정리보다 대상 유저 행을 먼저 잠근다.
    const [target] = await tx
      .select({
        id: users.id,
        gameName: users.gameName,
        bannedUntil: users.bannedUntil,
        tradeSuspendedUntil: users.tradeSuspendedUntil,
      })
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
      .limit(1);
    if (!target) return { found: false as const };

    if (action === "lift") {
      if (scope === "trade") {
        await tx
          .update(users)
          .set({
            tradeSuspendedUntil: null,
            tradeSuspensionReason: null,
            updatedAt: now,
          })
          .where(eq(users.id, userId));
        await tx
          .update(userSanctions)
          .set({ liftedAt: now, liftedByEmail: adminEmail })
          .where(
            and(
              eq(userSanctions.userId, userId),
              isNull(userSanctions.liftedAt),
              inArray(userSanctions.type, ["trade_suspend", "trade_ban"]),
            ),
          );
      } else {
        await tx
          .update(users)
          .set({ bannedUntil: null, banReason: null, updatedAt: now })
          .where(eq(users.id, userId));
        await tx
          .update(userSanctions)
          .set({ liftedAt: now, liftedByEmail: adminEmail })
          .where(
            and(
              eq(userSanctions.userId, userId),
              isNull(userSanctions.liftedAt),
              inArray(userSanctions.type, ["ban", "suspend"]),
            ),
          );
      }
      return {
        found: true as const,
        gameName: target.gameName,
        expiresAt: null,
        cleanup: emptyCleanup(),
      };
    }

    const currentExpiresAt =
      scope === "trade" ? target.tradeSuspendedUntil : target.bannedUntil;
    const expiresAt =
      action === "ban"
        ? PERMANENT
        : action === "suspend" || action === "extend"
          ? new Date(now.getTime() + days * DAY_MS)
          : null;
    const effectiveExpiresAt =
      action === "extend" &&
      currentExpiresAt &&
      currentExpiresAt.getTime() > now.getTime()
        ? new Date(currentExpiresAt.getTime() + days * DAY_MS)
        : expiresAt;
    const sanctionType =
      scope === "trade"
        ? action === "ban"
          ? "trade_ban"
          : "trade_suspend"
        : action === "extend"
          ? "suspend"
          : action;

    await tx.insert(userSanctions).values({
      userId,
      type: sanctionType,
      reason,
      expiresAt: effectiveExpiresAt,
      createdByEmail: adminEmail,
    });

    if (scope === "trade") {
      await tx
        .update(users)
        .set({
          tradeSuspendedUntil: effectiveExpiresAt,
          tradeSuspensionReason: reason,
          updatedAt: now,
        })
        .where(eq(users.id, userId));
    } else if (action !== "warn") {
      await tx
        .update(users)
        .set({
          bannedUntil: effectiveExpiresAt,
          banReason: reason || null,
          updatedAt: now,
        })
        .where(eq(users.id, userId));
    }

    const cleanup =
      action === "warn"
        ? emptyCleanup()
        : await clearActiveTradeExposure(tx, userId, now);
    return {
      found: true as const,
      gameName: target.gameName,
      expiresAt: effectiveExpiresAt,
      cleanup,
    };
  });

  if (!result.found) {
    return Response.json({ ok: false, error: "user not found" }, { status: 404 });
  }

  const auditAction =
    scope === "trade"
      ? `sanction.trade_${action}`
      : `sanction.${action}`;
  await logAdminAction({
    adminEmail,
    action: auditAction,
    targetUserId: userId,
    detail: {
      gameName: result.gameName,
      reason,
      adminMemo,
      ...(action === "suspend" || action === "extend" ? { days } : {}),
      ...result.cleanup,
    },
  });

  if (scope === "trade") {
    return Response.json({
      ok: true,
      scope,
      action,
      tradeSuspended: action !== "lift",
      tradeSuspendedUntil: result.expiresAt?.toISOString() ?? null,
      cleanup: result.cleanup,
    });
  }
  return Response.json({
    ok: true,
    scope,
    action,
    banned: action !== "warn" && action !== "lift",
    bannedUntil: result.expiresAt?.toISOString() ?? null,
    cleanup: result.cleanup,
  });
}
