import { requireCronAuth } from "@/lib/server/cronAuth";
import { deleteExpiredBattleReplays } from "@/lib/server/battleReplayRetention";

export async function POST(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const result = await deleteExpiredBattleReplays();
  return Response.json({ ok: true, ...result });
}
