import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { userSanctions } from "@/db/schema";
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

  let body: { warningId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const warningId =
    typeof body.warningId === "number" && Number.isInteger(body.warningId)
      ? body.warningId
      : 0;
  if (warningId <= 0) {
    return Response.json({ ok: false, error: "invalid_warning_id" }, { status: 400 });
  }

  const acknowledged = await db
    .update(userSanctions)
    .set({ acknowledgedAt: new Date() })
    .where(
      and(
        eq(userSanctions.id, warningId),
        eq(userSanctions.userId, userId),
        eq(userSanctions.type, "warn"),
        isNull(userSanctions.acknowledgedAt),
      ),
    )
    .returning({ id: userSanctions.id });

  if (acknowledged.length === 0) {
    return Response.json({ ok: false, error: "warning_not_found" }, { status: 404 });
  }

  return Response.json({ ok: true, warningId });
}
