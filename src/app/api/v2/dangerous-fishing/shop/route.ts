import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  purchaseDangerousFishingItemInTx,
  withDangerousFishingTransaction,
} from "@/lib/server/dangerousFishingService";

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:dangerous-fishing:shop",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const result = await withDangerousFishingTransaction((tx) =>
    purchaseDangerousFishingItemInTx(tx, userId, {
      kind: body.kind,
      id: body.id,
      action: body.action,
    }),
  );
  return Response.json(result, { status: result.status });
}
