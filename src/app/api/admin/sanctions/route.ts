import { and, desc, eq, gt, isNull, inArray } from "drizzle-orm";
import { db } from "@/db";
import { users, userSanctions } from "@/db/schema";
import {
  currentAdminEmail,
  requireAdmin,
  requireAdminRole,
} from "@/lib/server/isAdmin";
import { logAdminAction } from "@/lib/server/adminAudit";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import {
  clearActiveTradeExposure,
  TradeExposureChangedError,
  type TradeExposureCleanupResult,
  type TradeExposureCleanupSummary,
} from "@/lib/server/tradeSuspensionCleanup";
import type { DbExecutor } from "@/lib/server/savesKv";

export const dynamic = "force-dynamic";

// 영구 밴/거래 정지의 센티넬 — 사실상 무한(Postgres timestamp 범위 내).
const PERMANENT = new Date("9999-12-31T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TRADE_EXPOSURE_ATTEMPTS = 3;

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
    economyEvents: [],
  };
}

function cleanupSummary(
  cleanup: TradeExposureCleanupResult,
): TradeExposureCleanupSummary {
  const { economyEvents: _economyEvents, ...summary } = cleanup;
  return summary;
}

async function transactionWithBoundedExposureRetry<T>(
  callback: (tx: DbExecutor) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_TRADE_EXPOSURE_ATTEMPTS; attempt += 1) {
    try {
      return await db.transaction((tx) => callback(tx));
    } catch (error) {
      if (
        !(error instanceof TradeExposureChangedError) ||
        attempt === MAX_TRADE_EXPOSURE_ATTEMPTS
      ) {
        throw error;
      }
    }
  }
  throw new TradeExposureChangedError();
}

class CannotExtendPermanentTradeSuspensionError extends Error {
  constructor() {
    super("cannot_extend_permanent_trade_suspension");
  }
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
  const result = await transactionWithBoundedExposureRetry(async (tx) => {
    // Cleanup owns the complete users -> buy orders -> listings lock protocol.
    // It must run before the target-only lookup so mutually exposed users do
    // not form target-A/target-B lock inversions.
    const cleanup =
      action === "warn" || action === "lift"
        ? emptyCleanup()
        : await clearActiveTradeExposure(tx, userId, now);
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
    if (!target) return { found: false as const, economyEvents: [] };

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
        if (
          target.tradeSuspendedUntil &&
          target.tradeSuspendedUntil.getTime() > now.getTime()
        ) {
          await tx
            .update(userSanctions)
            .set({ liftedAt: now, liftedByEmail: adminEmail })
            .where(
              and(
                eq(userSanctions.userId, userId),
                isNull(userSanctions.liftedAt),
                inArray(userSanctions.type, ["trade_suspend", "trade_ban"]),
                eq(
                  userSanctions.expiresAt,
                  target.tradeSuspendedUntil,
                ),
                gt(userSanctions.expiresAt, now),
              ),
            );
        }
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
        cleanup: cleanupSummary(cleanup),
        economyEvents: cleanup.economyEvents,
      };
    }

    const currentExpiresAt =
      scope === "trade" ? target.tradeSuspendedUntil : target.bannedUntil;
    if (
      scope === "trade" &&
      action === "extend" &&
      currentExpiresAt &&
      currentExpiresAt.getTime() >= PERMANENT.getTime()
    ) {
      throw new CannotExtendPermanentTradeSuspensionError();
    }
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

    if (scope === "trade") {
      // Replacing the denormalized current state also retires every still-
      // active same-scope history row. This repairs pre-existing orphan rows
      // and leaves one authoritative current lifecycle.
      await tx
        .update(userSanctions)
        .set({ liftedAt: now, liftedByEmail: adminEmail })
        .where(
          and(
            eq(userSanctions.userId, userId),
            isNull(userSanctions.liftedAt),
            inArray(userSanctions.type, ["trade_suspend", "trade_ban"]),
            gt(userSanctions.expiresAt, now),
          ),
        );
    }

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

    return {
      found: true as const,
      gameName: target.gameName,
      expiresAt: effectiveExpiresAt,
      cleanup: cleanupSummary(cleanup),
      economyEvents: cleanup.economyEvents,
    };
  }).catch((error: unknown) => {
    if (error instanceof CannotExtendPermanentTradeSuspensionError) {
      return error;
    }
    throw error;
  });
  if (result instanceof CannotExtendPermanentTradeSuspensionError) {
    return Response.json(
      { ok: false, error: result.message },
      { status: 409 },
    );
  }

  if (!result.found) {
    return Response.json({ ok: false, error: "user not found" }, { status: 404 });
  }

  for (const event of result.economyEvents) {
    recordEconomyEventSoon(event);
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
