import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  exchangeDangerousFishingInTx,
  readDangerousFishingExchangeView,
} from "@/lib/server/dangerousFishingExchange";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return Response.json(await readDangerousFishingExchangeView(db, userId));
}

export async function POST(request: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(request, {
    userId,
    action: "v2:dangerous-fishing:exchange",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const result = await db.transaction((tx) =>
    exchangeDangerousFishingInTx(tx, userId, {
      action: body.action,
      operationId: body.operationId,
      entryId: body.entryId,
      batches: body.batches,
      selectedMaterials: body.selectedMaterials,
      gearKind: body.gearKind,
      gearId: body.gearId,
      expectedCurrentLevel: body.expectedCurrentLevel,
      expectedNextLevel: body.expectedNextLevel,
      now: Date.now(),
    }),
  );
  return Response.json(result, { status: result.status });
}
