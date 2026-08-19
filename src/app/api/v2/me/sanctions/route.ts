import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users, userSanctions } from "@/db/schema";
import { readPlayerSanctionStatus } from "@/lib/server/playerSanctions";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const status = await readPlayerSanctionStatus(userId);
  if (!status) {
    return Response.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }

  return Response.json({ ok: true, ...status });
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { warningId?: unknown; sanctionId?: unknown; kind?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const isTradeAcknowledgement = body.kind === "trade";
  const acknowledgementValue = isTradeAcknowledgement ? body.sanctionId : body.warningId;
  const acknowledgementId =
    typeof acknowledgementValue === "number" && Number.isInteger(acknowledgementValue)
      ? acknowledgementValue
      : 0;
  if (acknowledgementId <= 0) {
    return Response.json(
      {
        ok: false,
        error: isTradeAcknowledgement ? "invalid_sanction_id" : "invalid_warning_id",
      },
      { status: 400 },
    );
  }

  const now = new Date();
  const acknowledged = isTradeAcknowledgement
    ? await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ expiresAt: users.tradeSuspendedUntil })
          .from(users)
          .where(eq(users.id, userId))
          .for("update")
          .limit(1);
        if (
          !current?.expiresAt ||
          current.expiresAt.getTime() <= now.getTime()
        ) {
          return [];
        }
        return tx
          .update(userSanctions)
          .set({ acknowledgedAt: now })
          .where(
            and(
              eq(userSanctions.id, acknowledgementId),
              eq(userSanctions.userId, userId),
              inArray(userSanctions.type, ["trade_suspend", "trade_ban"]),
              isNull(userSanctions.liftedAt),
              isNull(userSanctions.acknowledgedAt),
              eq(userSanctions.expiresAt, current.expiresAt),
              gt(userSanctions.expiresAt, now),
            ),
          )
          .returning({ id: userSanctions.id });
      })
    : await db
        .update(userSanctions)
        .set({ acknowledgedAt: now })
        .where(
          and(
            eq(userSanctions.id, acknowledgementId),
            eq(userSanctions.userId, userId),
            eq(userSanctions.type, "warn"),
            isNull(userSanctions.acknowledgedAt),
          ),
        )
        .returning({ id: userSanctions.id });

  if (acknowledged.length === 0) {
    return Response.json(
      {
        ok: false,
        error: isTradeAcknowledgement ? "trade_sanction_not_found" : "warning_not_found",
      },
      { status: 404 },
    );
  }

  return Response.json(
    isTradeAcknowledgement
      ? { ok: true, sanctionId: acknowledgementId, kind: "trade" }
      : { ok: true, warningId: acknowledgementId },
  );
}
